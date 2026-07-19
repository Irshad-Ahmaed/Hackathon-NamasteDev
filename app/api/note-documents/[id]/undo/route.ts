import { NextRequest, NextResponse } from 'next/server';
import { resolveActor } from '@/lib/tenant';
import { AppError } from '@/lib/errors';
import { undoDocument, type NoteDocument } from '@/server/note-document-service';

export const dynamic = 'force-dynamic';

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/note-documents/:id/undo
 * Restores the most recent archived version older than the current revision,
 * committing it as a new revision so AI/manual changes can be reverted.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await resolveActor(req);
    const { id } = await ctx.params;
    if (!UUID_RX.test(id)) {
      return NextResponse.json({ error: 'Invalid document id' }, { status: 400 });
    }

    const restored = await undoDocument({ id, userId: actor.userId, tenantId: actor.tenantId });
    if (!restored) {
      return NextResponse.json({ error: 'Nothing to undo' }, { status: 409 });
    }
    return NextResponse.json(serialize(restored));
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    console.error('[POST /api/note-documents/:id/undo] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
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
