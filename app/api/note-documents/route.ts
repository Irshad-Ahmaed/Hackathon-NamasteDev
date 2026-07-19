import { NextRequest, NextResponse } from 'next/server';
import { resolveActor } from '@/lib/tenant';
import { AppError } from '@/lib/errors';
import { CreateNoteDocumentSchema } from '@/lib/schemas';
import { createOrLoadDocument, type NoteDocument } from '@/server/note-document-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/note-documents
 * Create-or-load the student's single private document for a subject/chapter/
 * language inside the active tenant. New documents start empty; the first
 * Generate Notes request is the single canonical generation path in /api/chat.
 * This avoids treating a server-seeded document as if it were user-authored.
 */
export async function POST(req: NextRequest) {
  try {
    const actor = await resolveActor(req);

    const body = await req.json().catch(() => null);
    const parsed = CreateNoteDocumentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { subject, chapterNumber, language } = parsed.data;

    const result = await createOrLoadDocument({
      userId: actor.userId,
      tenantId: actor.tenantId,
      subject,
      chapterNumber,
      language,
    });
    return NextResponse.json(serialize(result.document));
  } catch (error) {
    return handleError(error, 'POST /api/note-documents');
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

function handleError(error: unknown, route: string) {
  if (error instanceof AppError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
  }
  console.error(`[${route}] Error:`, error);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
