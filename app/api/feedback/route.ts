import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';
import { decryptText } from '@/lib/privacy-utils';
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

    // Validate messageId is a proper UUID before sending to postgres to avoid NeonDbError 22P02
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(messageId)) {
      return NextResponse.json({ error: 'Invalid message ID format' }, { status: 400 });
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

    // Check if feedback already exists for this message and user to prevent duplicates
    const existing = (await sql`
      SELECT id, type FROM feedback 
      WHERE message_id = ${messageId} AND user_id = ${userId}
    `) as unknown as Array<{ id: string; type: string }>;

    if (existing.length > 0) {
      const match = existing[0];
      if (match.type === type) {
        return NextResponse.json({ error: 'Feedback already submitted for this message' }, { status: 409 });
      }

      await sql`
        UPDATE feedback 
        SET type = ${type}, reported_at = now()
        WHERE id = ${match.id}
      `;
      logger.info({ event: 'feedback_updated', clerkIdHash, messageId, type });
      return NextResponse.json({ success: true, message: 'Feedback updated successfully' });
    }

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

export async function GET() {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = (await sql`
      SELECT role FROM users WHERE clerk_id = ${clerkId} AND deletion_requested_at IS NULL
    `) as unknown as Array<{ role: string }>;

    if (user.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const role = user[0].role;
    if (!['teacher', 'school_admin', 'super_admin'].includes(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch unresolved feedback items and join with messages to decrypt content
    const feedbackItems = (await sql`
      SELECT f.id, f.message_id, f.type, f.reported_at, f.resolution, m.content as message_content, m.encryption_version
      FROM feedback f
      LEFT JOIN messages m ON f.message_id = m.id
      WHERE f.reviewed_at IS NULL
      ORDER BY f.reported_at DESC
      LIMIT 50
    `) as unknown as Array<{
      id: string;
      message_id: string | null;
      type: string;
      reported_at: string;
      resolution: string | null;
      message_content: string | null;
      encryption_version: string | null;
    }>;

    const decryptedItems = feedbackItems.map(item => {
      let content = item.message_content || '';
      if (item.message_content && item.encryption_version) {
        try {
          content = decryptText(item.message_content, item.encryption_version);
        } catch {
          content = '[Decryption Failed]';
        }
      }
      return {
        id: item.id,
        messageId: item.message_id,
        type: item.type,
        reportedAt: item.reported_at,
        resolution: item.resolution,
        messageContent: content
      };
    });

    return NextResponse.json(decryptedItems);
  } catch (error) {
    console.error('[GET /api/feedback] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = (await sql`
      SELECT role FROM users WHERE clerk_id = ${clerkId} AND deletion_requested_at IS NULL
    `) as unknown as Array<{ role: string }>;

    if (user.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const role = user[0].role;
    if (!['teacher', 'school_admin', 'super_admin'].includes(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { feedbackId, resolution } = body;

    if (!feedbackId || !resolution) {
      return NextResponse.json({ error: 'Missing feedbackId or resolution' }, { status: 400 });
    }

    const result = (await sql`
      UPDATE feedback
      SET reviewed_at = now(), resolution = ${resolution}
      WHERE id = ${feedbackId}
      RETURNING id
    `) as unknown as Array<{ id: string }>;

    if (result.length === 0) {
      return NextResponse.json({ error: 'Feedback item not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Feedback resolved successfully' });
  } catch (error) {
    console.error('[PATCH /api/feedback] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
