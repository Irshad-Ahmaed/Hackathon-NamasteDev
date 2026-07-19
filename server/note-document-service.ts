import 'server-only';
import { sql } from '@/lib/db';
import { AppError } from '@/lib/errors';

export interface NoteDocument {
  id: string;
  tenantId: string;
  userId: string;
  sourceNoteId: string | null;
  subject: 'mathematics' | 'science';
  chapterNumber: number;
  language: 'en' | 'hi';
  content: string;
  revision: number;
  updatedAt: string;
}

interface DocumentRow {
  id: string;
  tenant_id: string;
  user_id: string;
  source_note_id: string | null;
  subject: 'mathematics' | 'science';
  chapter_number: number;
  language: 'en' | 'hi';
  content: string;
  revision: number;
  updated_at: string;
}

function mapRow(r: DocumentRow): NoteDocument {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    userId: r.user_id,
    sourceNoteId: r.source_note_id,
    subject: r.subject,
    chapterNumber: r.chapter_number,
    language: r.language,
    content: r.content,
    revision: r.revision,
    updatedAt: r.updated_at,
  };
}

/**
 * Load one document, enforcing ownership by id + user_id + tenant_id.
 * Throws 404 when not found or not owned (do not leak existence across users).
 */
export async function loadDocumentById(
  id: string,
  userId: string,
  tenantId: string
): Promise<NoteDocument> {
  const rows = (await sql`
    SELECT d.id, d.tenant_id, d.user_id, d.source_note_id, d.subject,
           d.chapter_number, d.language, d.content, d.revision, d.updated_at
    FROM user_note_documents d
    JOIN users u ON d.user_id = u.id
    WHERE d.id = ${id} AND d.user_id = ${userId} AND d.tenant_id = ${tenantId}
      AND u.deletion_requested_at IS NULL
  `) as unknown as DocumentRow[];

  if (rows.length === 0) {
    throw new AppError('NOT_FOUND', 'Document not found or access denied', 404);
  }
  return mapRow(rows[0]);
}

/**
 * Create-or-load the student's single document for a subject/chapter/language
 * inside the active tenant. Optionally seeds content from a global source note.
 */
export async function createOrLoadDocument(params: {
  userId: string;
  tenantId: string;
  subject: 'mathematics' | 'science';
  chapterNumber: number;
  language: 'en' | 'hi';
  seedContent?: string;
  sourceNoteId?: string | null;
}): Promise<{ document: NoteDocument; created: boolean }> {
  const { userId, tenantId, subject, chapterNumber, language } = params;

  // Return existing document if present.
  const existing = (await sql`
    SELECT d.id, d.tenant_id, d.user_id, d.source_note_id, d.subject,
           d.chapter_number, d.language, d.content, d.revision, d.updated_at
    FROM user_note_documents d
    WHERE d.user_id = ${userId} AND d.tenant_id = ${tenantId}
      AND d.subject = ${subject} AND d.chapter_number = ${chapterNumber}
      AND d.language = ${language}
  `) as unknown as DocumentRow[];

  if (existing.length > 0) {
    return { document: mapRow(existing[0]), created: false };
  }

  // Insert new document scoped to a verified, non-deleted user.
  const seed = (params.seedContent ?? '').trim();
  const rows = (await sql`
    INSERT INTO user_note_documents (tenant_id, user_id, source_note_id, subject, chapter_number, language, content, revision)
    SELECT ${tenantId}, ${userId}, ${params.sourceNoteId ?? null}, ${subject}, ${chapterNumber}, ${language}, ${seed}, 1
    FROM users u
    WHERE u.id = ${userId} AND u.deletion_requested_at IS NULL
    ON CONFLICT (tenant_id, user_id, subject, chapter_number, language) DO NOTHING
    RETURNING id, tenant_id, user_id, source_note_id, subject, chapter_number, language, content, revision, updated_at
  `) as unknown as DocumentRow[];

  if (rows.length === 0) {
    // A concurrent request may have created the same scoped document after the
    // initial lookup. Load it instead of surfacing a uniqueness violation.
    const raced = (await sql`
      SELECT d.id, d.tenant_id, d.user_id, d.source_note_id, d.subject,
             d.chapter_number, d.language, d.content, d.revision, d.updated_at
      FROM user_note_documents d
      JOIN users u ON d.user_id = u.id
      WHERE d.user_id = ${userId} AND d.tenant_id = ${tenantId}
        AND d.subject = ${subject} AND d.chapter_number = ${chapterNumber}
        AND d.language = ${language} AND u.deletion_requested_at IS NULL
    `) as unknown as DocumentRow[];
    if (raced.length > 0) return { document: mapRow(raced[0]), created: false };
    throw new AppError('FORBIDDEN', 'Access denied or account pending deletion', 403);
  }

  const document = mapRow(rows[0]);

  // Record the initial revision when seeded so Undo has a baseline.
  if (seed) {
    await sql`
      INSERT INTO user_note_document_versions (document_id, revision, content)
      VALUES (${document.id}, ${document.revision}, ${document.content})
      ON CONFLICT (document_id, revision) DO NOTHING
    `;
  }

  return { document, created: true };
}

/**
 * Optimistic-concurrency manual save. Updates only when the stored revision
 * matches expectedRevision AND ownership holds (id + user_id + tenant_id).
 * Archives the prior content as a version before incrementing.
 * Throws 409 on a stale revision (leaving the newer document untouched).
 */
export async function saveManualEdit(params: {
  id: string;
  userId: string;
  tenantId: string;
  content: string;
  expectedRevision: number;
}): Promise<NoteDocument> {
  const { id, userId, tenantId, content, expectedRevision } = params;

  // Ensure the document exists & is owned first (distinguish 404 vs 409).
  const current = await loadDocumentById(id, userId, tenantId);

  if (current.revision !== expectedRevision) {
    throw new AppError('CONFLICT', 'Document was modified elsewhere', 409);
  }

  // Archive the current (soon-to-be-previous) revision for Undo.
  await sql`
    INSERT INTO user_note_document_versions (document_id, revision, content)
    VALUES (${id}, ${current.revision}, ${current.content})
    ON CONFLICT (document_id, revision) DO NOTHING
  `;

  const rows = (await sql`
    UPDATE user_note_documents
    SET content = ${content}, revision = revision + 1, updated_at = now()
    WHERE id = ${id} AND user_id = ${userId} AND tenant_id = ${tenantId}
      AND revision = ${expectedRevision}
    RETURNING id, tenant_id, user_id, source_note_id, subject, chapter_number, language, content, revision, updated_at
  `) as unknown as DocumentRow[];

  if (rows.length === 0) {
    // Lost the race between load and update.
    throw new AppError('CONFLICT', 'Document was modified elsewhere', 409);
  }
  return mapRow(rows[0]);
}

/**
 * Atomically promote AI-generated/edited content to the next revision, archiving
 * the prior content. Used by the streamed generate/regenerate/command paths
 * after the stream completes successfully.
 */
export async function commitRevision(params: {
  id: string;
  userId: string;
  tenantId: string;
  content: string;
  expectedRevision: number;
}): Promise<NoteDocument> {
  const { id, userId, tenantId, content, expectedRevision } = params;

  const current = await loadDocumentById(id, userId, tenantId);
  if (current.revision !== expectedRevision) {
    throw new AppError('CONFLICT', 'Document was modified elsewhere', 409);
  }

  await sql`
    INSERT INTO user_note_document_versions (document_id, revision, content)
    VALUES (${id}, ${current.revision}, ${current.content})
    ON CONFLICT (document_id, revision) DO NOTHING
  `;

  const rows = (await sql`
    UPDATE user_note_documents
    SET content = ${content}, revision = revision + 1, updated_at = now()
    WHERE id = ${id} AND user_id = ${userId} AND tenant_id = ${tenantId}
      AND revision = ${expectedRevision}
    RETURNING id, tenant_id, user_id, source_note_id, subject, chapter_number, language, content, revision, updated_at
  `) as unknown as DocumentRow[];

  if (rows.length === 0) {
    throw new AppError('CONFLICT', 'Document was modified elsewhere', 409);
  }
  return mapRow(rows[0]);
}

/**
 * Undo: restore the most recent archived version older than the current
 * revision, committing it as a new revision. Returns null when nothing to undo.
 */
export async function undoDocument(params: {
  id: string;
  userId: string;
  tenantId: string;
}): Promise<NoteDocument | null> {
  const { id, userId, tenantId } = params;
  const current = await loadDocumentById(id, userId, tenantId);

  const versions = (await sql`
    SELECT content, revision
    FROM user_note_document_versions
    WHERE document_id = ${id} AND revision < ${current.revision}
    ORDER BY revision DESC
    LIMIT 1
  `) as unknown as Array<{ content: string; revision: number }>;

  if (versions.length === 0) return null;

  return commitRevision({
    id,
    userId,
    tenantId,
    content: versions[0].content,
    expectedRevision: current.revision,
  });
}
