import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db';
import { decryptText } from '@/lib/privacy-utils';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const user = (await sql`SELECT id, email FROM users WHERE clerk_id = ${clerkId} AND deletion_requested_at IS NULL`) as unknown as Array<{ id: string; email: string }>;
  if (!user.length) return NextResponse.json({ error: 'User not found or account pending deletion' }, { status: 404 });
  const userId = user[0].id;

  const conversations = (await sql`
    SELECT id, subject, chapter_id, created_at 
    FROM conversations 
    WHERE user_id = ${userId}
  `) as unknown as Array<{ id: string; subject: string; chapter_id: string | null; created_at: string }>;

  const rawMessages = (await sql`
    SELECT m.id, m.conversation_id, m.role, m.content, m.encryption_version, m.created_at, m.model
    FROM messages m
    JOIN conversations c ON m.conversation_id = c.id
    WHERE c.user_id = ${userId}
    ORDER BY m.created_at ASC
  `) as unknown as Array<{
    id: string;
    conversation_id: string;
    role: string;
    content: string | null;
    encryption_version: string;
    created_at: string;
    model: string | null;
  }>;

  const messages = rawMessages.map(m => {
    try {
      return { 
        id: m.id,
        conversationId: m.conversation_id,
        role: m.role,
        content: m.content ? decryptText(m.content, m.encryption_version) : '',
        createdAt: m.created_at,
        model: m.model 
      };
    } catch {
      return { 
        id: m.id,
        conversationId: m.conversation_id,
        role: m.role,
        content: '[Decryption Failed]',
        createdAt: m.created_at,
        model: m.model 
      };
    }
  });

  return NextResponse.json({
    user: { id: userId, email: user[0].email },
    conversations,
    messages
  });
}
