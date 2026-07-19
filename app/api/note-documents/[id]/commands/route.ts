import { NextRequest, NextResponse } from 'next/server';
import { resolveActor } from '@/lib/tenant';
import { AppError } from '@/lib/errors';
import { NoteCommandSchema } from '@/lib/schemas';
import { enforceRateLimits } from '@/lib/rate-limit';
import { moderateInput, ModeratedStreamBuffer } from '@/lib/moderation';
import { detectPromptInjection, CitationMetadata } from '@/lib/schemas';
import { DistressError, SAFE_ESCALATION_MESSAGE } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { estimateCostUsd, models } from '@/lib/openai';
import {
  loadDocumentById,
  commitRevision,
} from '@/server/note-document-service';
import {
  streamNotesEdit,
  NOTE_DOCUMENT_CHAR_LIMIT,
} from '@/lib/notes/generation-service';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/note-documents/:id/commands
 * Applies an AI instruction to the SERVER-loaded document (the browser never
 * sends the document as authoritative input), streams the replacement, then
 * atomically commits the next revision and emits `note_document_saved`.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  try {
    const actor = await resolveActor(req);
    const { id } = await ctx.params;
    if (!UUID_RX.test(id)) {
      return NextResponse.json({ error: 'Invalid document id' }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const parsed = NoteCommandSchema.safeParse(body);
    if (!parsed.success) {
      const tooLarge = parsed.error.issues.some(i => i.code === 'too_big');
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: tooLarge ? 413 : 400 }
      );
    }
    const { instruction, expectedRevision } = parsed.data;

    // Prompt-injection + input moderation on the instruction.
    if (detectPromptInjection(instruction)) {
      return NextResponse.json({ error: 'Instruction contains disallowed content.' }, { status: 400 });
    }
    try {
      await moderateInput(instruction);
    } catch (err) {
      if (err instanceof DistressError) {
        return NextResponse.json({ error: SAFE_ESCALATION_MESSAGE, code: 'DISTRESS_SIGNAL' }, { status: 200 });
      }
      throw err;
    }

    // Rate limit note edits per user (reuses the shared limiter).
    const rawIp = req.headers.get('x-forwarded-for') ?? '127.0.0.1';
    const ip = rawIp.split(',')[0].trim();
    try {
      await enforceRateLimits(actor.userId, ip, false);
    } catch (rlErr) {
      const e = rlErr as Error;
      if (
        e.message === 'IP_RATE_LIMIT_EXCEEDED' ||
        e.message === 'USER_DAILY_LIMIT_EXCEEDED' ||
        e.message === 'REASONING_DAILY_LIMIT_EXCEEDED'
      ) {
        return NextResponse.json({ error: 'Rate limit exceeded. Please try again later.' }, { status: 429 });
      }
      throw rlErr;
    }

    // Load the authoritative document (ownership enforced) and revision-check.
    const doc = await loadDocumentById(id, actor.userId, actor.tenantId);
    if (doc.revision !== expectedRevision) {
      return NextResponse.json({ error: 'Document was modified elsewhere', code: 'CONFLICT' }, { status: 409 });
    }

    const { stream, commandClass, citations } = await streamNotesEdit({
      documentContent: doc.content,
      instruction,
      subject: doc.subject,
      chapterNumber: doc.chapterNumber,
      language: doc.language,
    });

    const userIdHash = crypto.createHash('sha256').update(actor.userId).digest('hex');

    let cancelled = false;
    const responseStream = new ReadableStream({
      async start(controller) {
        // init event mirrors the chat stream shape (no conversation here).
        const initEvent = JSON.stringify({
          type: 'init',
          conversationId: '',
          citations,
          outcome: 'success',
        });
        controller.enqueue(`data: ${initEvent}\n\n`);

        let fullResponse = '';
        let promptTokens = 0;
        let completionTokens = 0;

        const moderationBuffer = new ModeratedStreamBuffer(
          (safeText) => {
            fullResponse += safeText;
            controller.enqueue(`data: ${JSON.stringify({ type: 'token', content: safeText })}\n\n`);
          },
          (error) => {
            controller.enqueue(`data: ${JSON.stringify({ type: 'error', message: error.message, code: 'MODERATION_ERROR' })}\n\n`);
          },
          450
        );

        try {
          for await (const chunk of stream) {
            if (cancelled) throw new Error('Notes edit cancelled');
            if (chunk.usage) {
              promptTokens = chunk.usage.prompt_tokens;
              completionTokens = chunk.usage.completion_tokens;
            }
            const content = chunk.choices?.[0]?.delta?.content || '';
            if (content) await moderationBuffer.addChunk(content);
          }
          await moderationBuffer.flush();
          if (cancelled) throw new Error('Notes edit cancelled');

          // Enforce document-size limit on the produced output.
          const finalContent = fullResponse.slice(0, NOTE_DOCUMENT_CHAR_LIMIT);

          // Atomically persist the next revision (archives prior for Undo).
          const updated = await commitRevision({
            id,
            userId: actor.userId,
            tenantId: actor.tenantId,
            content: finalContent,
            expectedRevision,
          });

          const savedEvent = JSON.stringify({
            type: 'note_document_saved',
            documentId: updated.id,
            revision: updated.revision,
            operation: 'command',
            citations: commandClass === 'knowledge' ? citations : ([] as CitationMetadata[]),
          });
          controller.enqueue(`data: ${savedEvent}\n\n`);

          const cost = estimateCostUsd(
            models.chat,
            promptTokens || Math.ceil((doc.content.length + instruction.length) / 4),
            completionTokens || Math.ceil(fullResponse.length / 4)
          );
          logger.info({
            requestId,
            userIdHash,
            route: '/api/note-documents/:id/commands',
            documentId: id,
            commandClass,
            model: models.chat,
            durationMs: Date.now() - startTime,
            estimatedCostUsd: cost,
            outcome: 'success',
          }, 'note_command_complete');
        } catch (err) {
          // Error / cancellation path: do NOT emit note_document_saved and do
          // NOT commit a revision. The saved document remains intact.
          controller.enqueue(`data: ${JSON.stringify({ type: 'error', message: 'Edit failed', code: 'STREAM_ERROR' })}\n\n`);
          logger.error({
            requestId,
            userIdHash,
            route: '/api/note-documents/:id/commands',
            documentId: id,
            commandClass,
            durationMs: Date.now() - startTime,
            outcome: 'error',
            error: err instanceof Error ? err.message : String(err),
          }, 'note_command_complete');
        } finally {
          controller.close();
        }
      },
      cancel() {
        // Preserve the prior revision when the browser cancels the rewrite.
        cancelled = true;
      },
    });

    return new NextResponse(responseStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    console.error('[POST /api/note-documents/:id/commands] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
