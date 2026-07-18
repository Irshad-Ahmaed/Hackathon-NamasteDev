import { sql } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { encryptText, decryptText } from '@/lib/privacy-utils';

export async function createConversation(
  tenantId: string,
  userId: string,
  subject: 'mathematics' | 'science',
  chapterId?: string
): Promise<string> {
  const rows = (await sql`
    INSERT INTO conversations (tenant_id, user_id, subject, chapter_id)
    SELECT ${tenantId}, ${userId}, ${subject}, ${chapterId || null}
    FROM users 
    WHERE id = ${userId} AND deletion_requested_at IS NULL
    RETURNING id
  `) as unknown as Array<{ id: string }>;
  if (rows.length === 0) {
    throw new AppError('FORBIDDEN', 'Access denied or account pending deletion', 403);
  }
  return rows[0].id;
}

export async function authorizeConversation(
  conversationId: string,
  userId: string,
  tenantId: string
): Promise<void> {
  const rows = (await sql`
    SELECT 1 FROM conversations c
    JOIN users u ON c.user_id = u.id
    WHERE c.id = ${conversationId} AND c.user_id = ${userId} AND c.tenant_id = ${tenantId}
      AND u.deletion_requested_at IS NULL
  `) as unknown as Array<Record<string, unknown>>;
  if (rows.length === 0) {
    throw new AppError('NOT_FOUND', 'Conversation not found, access denied, or account pending deletion', 404);
  }
}

export async function saveMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  userId: string,
  tenantId: string,
  metadata?: {
    subject?: string;
    chapterId?: string;
    mode?: string;
    outcome?: string;
    inputTokens?: number;
    outputTokens?: number;
    estimatedCostUsd?: number;
    retrievalTopScore?: number;
    retrievedChunkCount?: number;
    model?: string;
  }
): Promise<string> {
  // Always encrypt text at rest in DB
  const encryptedContent = encryptText(content);
  
  // Authorize conversation ownership in the same operation via an INSERT INTO SELECT statement.
  // This guarantees that even if a developer calls saveMessage elsewhere, the DB enforces access parity.
  const rows = (await sql`
    INSERT INTO messages (
      conversation_id, role, content, subject, chapter_id, mode, outcome,
      input_tokens, output_tokens, estimated_cost_usd, retrieval_top_score,
      retrieved_chunk_count, model, encryption_version
    )
    SELECT 
      ${conversationId}, ${role}, ${encryptedContent}, ${metadata?.subject || null},
      ${metadata?.chapterId || null}, ${metadata?.mode || null}, ${metadata?.outcome || null},
      ${metadata?.inputTokens || null}, ${metadata?.outputTokens || null},
      ${metadata?.estimatedCostUsd || null}, ${metadata?.retrievalTopScore || null},
      ${metadata?.retrievedChunkCount || null}, ${metadata?.model || null},
      ${process.env.ENCRYPTION_KEY_VERSION || 'v1'}
    FROM conversations c
    JOIN users u ON c.user_id = u.id
    WHERE c.id = ${conversationId} AND c.user_id = ${userId} AND c.tenant_id = ${tenantId}
      AND u.deletion_requested_at IS NULL
    RETURNING id
  `) as unknown as Array<{ id: string }>;

  if (rows.length === 0) {
    throw new AppError('FORBIDDEN', 'Conversation not found, access denied, or account pending deletion', 403);
  }
  return rows[0].id;
}

export async function fetchHistory(
  conversationId: string,
  userId: string,
  tenantId: string
): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
  await authorizeConversation(conversationId, userId, tenantId);
  const rows = (await sql`
    SELECT role, content, encryption_version FROM messages
    WHERE conversation_id = ${conversationId} AND content IS NOT NULL
    ORDER BY created_at ASC LIMIT 20
  `) as unknown as Array<{ role: string; content: string; encryption_version: string }>;
  return rows.map(r => ({
    role: r.role as 'user' | 'assistant',
    content: decryptText(r.content, r.encryption_version)
  }));
}
