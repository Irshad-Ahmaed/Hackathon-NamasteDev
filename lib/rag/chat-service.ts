import { models, createStreamingChatCompletion, estimateCostUsd } from '../openai';
import { moderateInput, ModeratedStreamBuffer } from '../moderation';
import { reformulateQuery } from './reformulate';
import { retrieveContext, buildCitations, RetrievalResult } from './retrieval';
import { buildPrompt } from './prompt';
import { ChatRequest, CitationMetadata, detectPromptInjection } from '../schemas';
import { saveMessage, fetchHistory, createConversation } from '../../server/conversation-service';
import { AppError, SAFE_ESCALATION_MESSAGE, DistressError } from '../errors';
import { logger } from '../logger';
import { sql } from '../db';
import crypto from 'crypto';
import {
  getApprovedChapterContext,
  streamNotesGeneration,
  NOTE_DOCUMENT_CHAR_LIMIT,
} from '../notes/generation-service';
import { loadDocumentById, commitRevision } from '../../server/note-document-service';

export interface ChatServiceOptions {
  userId: string;
  tenantId: string;
  request: ChatRequest;
  requestId: string;
  startTime: number;
}

export async function executeChatPipeline(options: ChatServiceOptions): Promise<ReadableStream> {
  const { userId, tenantId, request, requestId, startTime } = options;
  const { message, subject, language, conversationId: reqConversationId, chapterId, mode } = request;
  let conversationId = reqConversationId;

  // 1. Prompt Injection Check
  if (detectPromptInjection(message)) {
    throw new AppError('BAD_REQUEST', 'Message contains disallowed content.', 400);
  }

  // 2. Input Moderation
  try {
    await moderateInput(message);
  } catch (error) {
    if (error instanceof DistressError) {
      // Short circuit and return a distress response as stream
      return createStaticStream(SAFE_ESCALATION_MESSAGE, conversationId || 'new');
    }
    throw error;
  }

  // 3. Resolve Conversation & Save User Message
  if (!conversationId) {
    conversationId = await createConversation(tenantId, userId, subject, chapterId);
  }
  
  // Mode-based RAG bypass routing:
  // If the user selects "general" chat mode, we bypass RAG context search and let the model answer freely.
  // If the user selects any academic mode (explain, solve, notes, quiz), they are strictly bound to RAG context.
  const isGeneralChat = mode === 'general';
  
  await saveMessage(conversationId, 'user', message, userId, tenantId, { 
    subject, 
    chapterId, 
    mode: isGeneralChat ? undefined : mode 
  });

  // 3b. Notes generation branch: Generate Notes mode with a private document.
  // This streams NCERT-grounded notes into the canvas and, on success, commits
  // a new document revision and emits a `note_document_saved` event.
  if (mode === 'notes' && request.noteDocumentId) {
    return await executeNotesGeneration({
      userId,
      tenantId,
      conversationId,
      noteDocumentId: request.noteDocumentId,
      subject,
      language,
      chapterId,
      instruction: message,
      requestId,
      startTime,
    });
  }

  // 4. Fetch History
  const history = await fetchHistory(conversationId, userId, tenantId);

  // 5. Reformulate & Classify Query
  const { query: standaloneQuery, category } = await reformulateQuery(history.slice(0, -1), message);

  let contextResults: RetrievalResult[] = [];
  let citations: CitationMetadata[] = [];
  // null means no retrieval was performed (bypassRAG or general chat)
  let topScore: number | null = null;
  
  const isQuiz = mode === 'quiz';
  // Decide whether to bypass retrieval:
  // Bypass if the user explicitly chose General Chat, OR if reformulation classified it as chitchat, BUT NOT in quiz mode.
  const bypassRAG = (isGeneralChat || category === 'chitchat') && !isQuiz;

  const selectedModel = mode === 'solve' ? models.reasoning : models.chat;

  if (!bypassRAG) {
    // 6. Retrieve Context (with filters!) - Quiz mode retrieves more chunks for broader coverage
    const retrievalLimit = isQuiz ? 8 : 5;
    contextResults = await retrieveContext(standaloneQuery, { subject, language, chapterId }, retrievalLimit);
    citations = buildCitations(contextResults);

    // 7. Evaluate Retrieval Confidence (Basic Thresholding)
    topScore = contextResults[0]?.score || 0;
    if (topScore < 0.35 && !isQuiz) {
      // Low confidence -> Fallback
      const fallbackText = "I'm sorry, I couldn't find relevant information in the NCERT textbook to answer your question. I can only assist with topics covered in the Class 10 Math and Science curriculum.";
      const assistantMessageId = crypto.randomUUID();
      const promptTokens = Math.ceil(standaloneQuery.length / 4) + 100;
      const completionTokens = Math.ceil(fallbackText.length / 4);
      const cost = estimateCostUsd(selectedModel, promptTokens, completionTokens);

      await saveMessage(conversationId, 'assistant', fallbackText, userId, tenantId, { 
        id: assistantMessageId,
        subject, 
        mode: isGeneralChat ? undefined : mode, 
        outcome: 'low_confidence', 
        retrievalTopScore: topScore ?? undefined, 
        retrievedChunkCount: 0,
        model: selectedModel,
        inputTokens: promptTokens,
        outputTokens: completionTokens,
        estimatedCostUsd: cost
      });

      // Log low confidence refutation
      const userIdHash = crypto.createHash('sha256').update(userId).digest('hex');
      logger.info({
        requestId,
        userIdHash,
        route: '/api/chat',
        subject,
        chapterId,
        mode,
        statusCode: 200,
        durationMs: Date.now() - startTime,
        retrievalTopScore: topScore,
        retrievedChunkCount: 0,
        model: selectedModel,
        inputTokens: promptTokens,
        outputTokens: completionTokens,
        estimatedCostUsd: cost,
        outcome: 'low_confidence',
      }, 'chat_request_complete');

      // Insert event into DB
      await sql`
        INSERT INTO events (user_id_hash, event_type, subject, chapter_id, mode, outcome, duration_ms, estimated_cost_usd)
        VALUES (${userIdHash}, 'chat_message', ${subject}, ${chapterId || null}, ${mode}, 'low_confidence', ${Date.now() - startTime}, ${cost})
      `;

      return createStaticStream(fallbackText, conversationId, citations, 'refusal', assistantMessageId);
    }
  }

  // Use the provided requestId for the assistant message
  const assistantMessageId = requestId || crypto.randomUUID();

  // 8. Build Prompt & LLM Call
  const promptMessages = buildPrompt(history, standaloneQuery, contextResults, bypassRAG, isGeneralChat, isQuiz);

  
  const stream = await createStreamingChatCompletion({
    model: selectedModel,
    messages: promptMessages,
    stream: true,
    stream_options: { include_usage: true },
  });


  // 9. Stream Response & Apply Output Moderation Buffer
  let cancelled = false;
  return new ReadableStream({
    async start(controller) {
      // Send Init Event
      const initEvent = JSON.stringify({
        type: 'init',
        conversationId: conversationId!,
        citations,
        outcome: 'success',
        assistantMessageId
      });
      controller.enqueue(`data: ${initEvent}\n\n`);

      let fullResponse = '';

      const moderationBuffer = new ModeratedStreamBuffer(
        (safeText) => {
          fullResponse += safeText;
          const tokenEvent = JSON.stringify({ type: 'token', content: safeText });
          controller.enqueue(`data: ${tokenEvent}\n\n`);
        },
        (error) => {
          const errorEvent = JSON.stringify({ type: 'error', message: error.message, code: 'MODERATION_ERROR' });
          controller.enqueue(`data: ${errorEvent}\n\n`);
        },
        450 // Buffer size
      );

      let promptTokens = 0;
      let completionTokens = 0;

      try {
        for await (const chunk of stream) {
          if (cancelled) throw new Error('Streaming cancelled');
          if (chunk.usage) {
            promptTokens = chunk.usage.prompt_tokens;
            completionTokens = chunk.usage.completion_tokens;
          }
          const content = chunk.choices?.[0]?.delta?.content || '';
          if (content) {
            await moderationBuffer.addChunk(content);
          }
        }
        await moderationBuffer.flush();
        if (cancelled) throw new Error('Streaming cancelled');

        const finalPromptTokens = promptTokens || (Math.ceil(standaloneQuery.length / 4) + 500);
        const finalCompletionTokens = completionTokens || Math.ceil(fullResponse.length / 4);
        const finalCost = estimateCostUsd(selectedModel, finalPromptTokens, finalCompletionTokens);

        // 10. Save assistant message after stream completes
        await saveMessage(conversationId!, 'assistant', fullResponse, userId, tenantId, {
           id: assistantMessageId,
           subject, 
           mode: isGeneralChat ? undefined : mode, 
           outcome: 'success', 
           retrievalTopScore: topScore ?? undefined, 
           retrievedChunkCount: contextResults.length, 
           model: selectedModel,
           inputTokens: finalPromptTokens,
           outputTokens: finalCompletionTokens,
           estimatedCostUsd: finalCost
        });

        // Structured Logging on Success
        const userIdHash = crypto.createHash('sha256').update(userId).digest('hex');
        logger.info({
          requestId,
          userIdHash,
          route: '/api/chat',
          subject,
          chapterId,
          mode,
          statusCode: 200,
          durationMs: Date.now() - startTime,
          retrievalTopScore: topScore,
          retrievedChunkCount: contextResults.length,
          model: selectedModel,
          inputTokens: finalPromptTokens,
          outputTokens: finalCompletionTokens,
          estimatedCostUsd: finalCost,
          outcome: 'success',
        }, 'chat_request_complete');

        // Insert event into DB
        await sql`
          INSERT INTO events (user_id_hash, event_type, subject, chapter_id, mode, outcome, duration_ms, estimated_cost_usd)
          VALUES (${userIdHash}, 'chat_message', ${subject}, ${chapterId || null}, ${mode}, 'success', ${Date.now() - startTime}, ${finalCost})
        `;

      } catch (err: unknown) {
        console.error('Streaming error:', err);
        const errorEvent = JSON.stringify({ type: 'error', message: 'Streaming failed', code: 'STREAM_ERROR' });
        controller.enqueue(`data: ${errorEvent}\n\n`);

        const userIdHash = crypto.createHash('sha256').update(userId).digest('hex');
        logger.error({
          requestId,
          userIdHash,
          route: '/api/chat',
          subject,
          chapterId,
          mode,
          statusCode: 500,
          durationMs: Date.now() - startTime,
          retrievalTopScore: topScore,
          retrievedChunkCount: contextResults.length,
          model: selectedModel,
          outcome: 'error',
          error: err instanceof Error ? err.message : String(err),
        }, 'chat_request_complete');

        // Insert failure event into DB
        try {
          await sql`
            INSERT INTO events (user_id_hash, event_type, subject, chapter_id, mode, outcome, duration_ms, estimated_cost_usd)
            VALUES (${userIdHash}, 'chat_message_failed', ${subject}, ${chapterId || null}, ${mode}, 'error', ${Date.now() - startTime}, 0)
          `;
        } catch (dbErr) {
          console.error('Failed to log error event to DB:', dbErr);
        }
      } finally {
        controller.close();
      }
    },
    cancel() {
      cancelled = true;
    },
  });
}

interface NotesGenerationOptions {
  userId: string;
  tenantId: string;
  conversationId: string;
  noteDocumentId: string;
  subject: 'mathematics' | 'science';
  language: 'en' | 'hi';
  chapterId?: string;
  instruction: string;
  requestId: string;
  startTime: number;
}

/**
 * Streams NCERT-grounded notes generation into the canvas for Generate Notes
 * mode. On a successful stream it atomically commits a new document revision
 * and emits `note_document_saved`. Error/cancellation paths never commit and
 * never emit that event, leaving the saved document intact.
 */
async function executeNotesGeneration(options: NotesGenerationOptions): Promise<ReadableStream> {
  const { userId, tenantId, conversationId, noteDocumentId, subject, language, chapterId, instruction, requestId, startTime } = options;

  // Ownership-scoped load of the private document (throws 404 if not owned).
  const doc = await loadDocumentById(noteDocumentId, userId, tenantId);

  // The document, not client-supplied request fields, defines its subject,
  // chapter, and language. Reject mismatches rather than mixing source context
  // from one chapter into another private document.
  const requestedChapterNumber = chapterId && /^\d+$/.test(chapterId)
    ? Number(chapterId)
    : undefined;
  if (
    doc.subject !== subject ||
    doc.language !== language ||
    (requestedChapterNumber !== undefined && doc.chapterNumber !== requestedChapterNumber)
  ) {
    throw new AppError('BAD_REQUEST', 'Selected subject, chapter, or language does not match this notes document.', 400);
  }

  const chapterNumber = doc.chapterNumber;
  const ctx = await getApprovedChapterContext(doc.subject, chapterNumber, doc.language);

  const assistantMessageId = requestId || crypto.randomUUID();
  const userIdHash = crypto.createHash('sha256').update(userId).digest('hex');

  if (!ctx) {
    const msg = "I couldn't find approved NCERT source content for this chapter, so I can't generate grounded notes yet.";
    return createStaticStream(msg, conversationId, [], 'refusal', assistantMessageId);
  }

  const stream = await streamNotesGeneration(doc.subject, chapterNumber, ctx.chapterTitle, ctx.chapterText, instruction);

  let cancelled = false;
  return new ReadableStream({
    async start(controller) {
      const initEvent = JSON.stringify({
        type: 'init',
        conversationId,
        citations: ctx.citations,
        outcome: 'success',
        assistantMessageId,
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
          if (cancelled) throw new Error('Notes generation cancelled');
          if (chunk.usage) {
            promptTokens = chunk.usage.prompt_tokens;
            completionTokens = chunk.usage.completion_tokens;
          }
          const content = chunk.choices?.[0]?.delta?.content || '';
          if (content) await moderationBuffer.addChunk(content);
        }
        await moderationBuffer.flush();
        if (cancelled) throw new Error('Notes generation cancelled');

        const finalContent = fullResponse.slice(0, NOTE_DOCUMENT_CHAR_LIMIT);

        // Atomically persist the generated revision (archives prior for Undo).
        const updated = await commitRevision({
          id: noteDocumentId,
          userId,
          tenantId,
          content: finalContent,
          expectedRevision: doc.revision,
        });

        // Persist assistant chat message for history parity.
        const finalPromptTokens = promptTokens || (Math.ceil(ctx.chapterText.length / 4) + 500);
        const finalCompletionTokens = completionTokens || Math.ceil(fullResponse.length / 4);
        const finalCost = estimateCostUsd(models.chat, finalPromptTokens, finalCompletionTokens);

        const chatSummary = `Created notes in the canvas and applied your request: ${instruction}`;
        await saveMessage(conversationId, 'assistant', chatSummary, userId, tenantId, {
          id: assistantMessageId,
          subject: doc.subject,
          mode: 'notes',
          outcome: 'success',
          retrievedChunkCount: ctx.chunkCount,
          model: models.chat,
          inputTokens: finalPromptTokens,
          outputTokens: finalCompletionTokens,
          estimatedCostUsd: finalCost,
        });

        const savedEvent = JSON.stringify({
          type: 'note_document_saved',
          documentId: updated.id,
          revision: updated.revision,
          operation: 'generate',
          citations: ctx.citations,
        });
        controller.enqueue(`data: ${savedEvent}\n\n`);

        logger.info({
          requestId,
          userIdHash,
          route: '/api/chat',
          subject: doc.subject,
          chapterId,
          mode: 'notes',
          statusCode: 200,
          durationMs: Date.now() - startTime,
          retrievedChunkCount: ctx.chunkCount,
          model: models.chat,
          inputTokens: finalPromptTokens,
          outputTokens: finalCompletionTokens,
          estimatedCostUsd: finalCost,
          outcome: 'success',
        }, 'chat_request_complete');

        await sql`
          INSERT INTO events (user_id_hash, event_type, subject, chapter_id, mode, outcome, duration_ms, estimated_cost_usd)
          VALUES (${userIdHash}, 'notes_generated', ${doc.subject}, ${chapterId || null}, 'notes', 'success', ${Date.now() - startTime}, ${finalCost})
        `;
      } catch (err) {
        // Do NOT commit or emit note_document_saved on error/cancellation.
        controller.enqueue(`data: ${JSON.stringify({ type: 'error', message: 'Notes generation failed', code: 'STREAM_ERROR' })}\n\n`);
        logger.error({
          requestId,
          userIdHash,
          route: '/api/chat',
          subject: doc.subject,
          chapterId,
          mode: 'notes',
          statusCode: 500,
          durationMs: Date.now() - startTime,
          outcome: 'error',
          error: err instanceof Error ? err.message : String(err),
        }, 'chat_request_complete');
      } finally {
        controller.close();
      }
    },
    cancel() {
      // The model iterator may not support aborting directly, but this prevents
      // its eventual output from being committed after the client disconnects.
      cancelled = true;
    },
  });
}

function createStaticStream(text: string, conversationId: string, citations: CitationMetadata[] = [], outcome: 'success'|'refusal' = 'success', assistantMessageId?: string): ReadableStream {
  return new ReadableStream({
    start(controller) {
      const initEvent = JSON.stringify({ type: 'init', conversationId, citations, outcome, assistantMessageId });
      controller.enqueue(`data: ${initEvent}\n\n`);
      
      const tokenEvent = JSON.stringify({ type: 'token', content: text });
      controller.enqueue(`data: ${tokenEvent}\n\n`);
      
      controller.close();
    }
  });
}
