import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clerkIdHash = crypto.createHash('sha256').update(clerkId).digest('hex');

    const body = await req.json();
    const { messageId, type } = body;

    if (!messageId || !type) {
      return NextResponse.json({ error: 'Missing messageId or type' }, { status: 400 });
    }

    if (!['incorrect', 'inappropriate', 'helpful'].includes(type)) {
      return NextResponse.json({ error: 'Invalid feedback type' }, { status: 400 });
    }

    // Resolve internal User UUID
    const user = (await sql`
      SELECT id FROM users WHERE clerk_id = ${clerkId} AND deletion_requested_at IS NULL
    `) as unknown as Array<{ id: string }>;

    if (user.length === 0) {
      return NextResponse.json({ error: 'User not found or account pending deletion' }, { status: 404 });
    }

    const userId = user[0].id;

    // Verify the message exists and belongs to a conversation owned by the user
    const messageCheck = (await sql`
      SELECT m.id 
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      WHERE m.id = ${messageId} AND c.user_id = ${userId}
    `) as unknown as Array<{ id: string }>;

    if (messageCheck.length === 0) {
      return NextResponse.json({ error: 'Message not found or access denied' }, { status: 404 });
    }

    // Insert feedback
    await sql`
      INSERT INTO feedback (message_id, user_id, type)
      VALUES (${messageId}, ${userId}, ${type})
    `;

    logger.info({ event: 'feedback_submitted', clerkIdHash, messageId, type });

    return NextResponse.json({ success: true, message: 'Feedback submitted successfully' });
  } catch (error) {
    console.error('[POST /api/feedback] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
