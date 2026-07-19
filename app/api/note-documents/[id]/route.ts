import { NextRequest, NextResponse } from 'next/server';
import { resolveActor } from '@/lib/tenant';
import { AppError } from '@/lib/errors';
import { SaveNoteDocumentSchema } from '@/lib/schemas';
import {
  loadDocumentById,
  saveManualEdit,
  type NoteDocument,
} from '@/server/note-document-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/note-documents/:id
 * Loads one document after ownership verification (id + user_id + tenant_id).
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await resolveActor(req);
    const { id } = await ctx.params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: 'Invalid document id' }, { status: 400 });
    }
    const doc = await loadDocumentById(id, actor.userId, actor.tenantId);
    return NextResponse.json(serialize(doc));
  } catch (error) {
    return handleError(error, 'GET /api/note-documents/:id');
  }
}

/**
 * PATCH /api/note-documents/:id
 * Revision-safe manual save. Returns 409 on a stale expectedRevision.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await resolveActor(req);
    const { id } = await ctx.params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: 'Invalid document id' }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const parsed = SaveNoteDocumentSchema.safeParse(body);
    if (!parsed.success) {
      // Distinguish oversized content (413) from other validation errors (400).
      const tooLarge = parsed.error.issues.some(i => i.code === 'too_big');
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: tooLarge ? 413 : 400 }
      );
    }

    const updated = await saveManualEdit({
      id,
      userId: actor.userId,
      tenantId: actor.tenantId,
      content: parsed.data.content,
      expectedRevision: parsed.data.expectedRevision,
    });
    return NextResponse.json(serialize(updated));
  } catch (error) {
    return handleError(error, 'PATCH /api/note-documents/:id');
  }
}

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(v: string): boolean {
  return UUID_RX.test(v);
}

function serialize(doc: NoteDocument) {
  return {
    documentId: doc.id,
    revision: doc.revision,
    content: doc.content,
    subject: doc.subject,
    chapterNumber: doc.chapterNumber,
    language: doc.language,
  };
}

function handleError(error: unknown, route: string) {
  if (error instanceof AppError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
  }
  console.error(`[${route}] Error:`, error);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
