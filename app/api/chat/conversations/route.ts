import { NextResponse, NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db';
import { decryptText } from '@/lib/privacy-utils';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Resolve internal User UUID
    const userResult = (await sql`
      SELECT id, deletion_requested_at FROM users 
      WHERE clerk_id = ${clerkId}
    `) as unknown as Array<{ id: string; deletion_requested_at: string | null }>;

    if (userResult.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const user = userResult[0];
    if (user.deletion_requested_at) {
      return NextResponse.json({ error: 'Account deletion in progress.' }, { status: 403 });
    }

    const userId = user.id;

    // Fetch conversations with the last message text and its encryption version
    const conversations = (await sql`
      SELECT 
        c.id, 
        c.subject, 
        c.chapter_id, 
        c.title,
        c.created_at,
        m.content as last_message_content,
        m.encryption_version as last_message_encryption_version,
        m.created_at as last_message_time
      FROM conversations c
      LEFT JOIN LATERAL (
        SELECT content, encryption_version, created_at
        FROM messages 
        WHERE conversation_id = c.id
        ORDER BY created_at DESC 
        LIMIT 1
      ) m ON true
      WHERE c.user_id = ${userId}
      ORDER BY COALESCE(m.created_at, c.created_at) DESC
      LIMIT 50
    `) as unknown as Array<{
      id: string;
      subject: 'mathematics' | 'science';
      chapter_id: string | null;
      title: string | null;
      created_at: string;
      last_message_content: string | null;
      last_message_encryption_version: string | null;
      last_message_time: string | null;
    }>;

    const list = conversations.map(convo => {
      let lastMessage = '';
      if (convo.last_message_content && convo.last_message_encryption_version) {
        try {
          lastMessage = decryptText(convo.last_message_content, convo.last_message_encryption_version);
        } catch {
          lastMessage = '[Decrypted Failed]';
        }
      }
      return {
        id: convo.id,
        subject: convo.subject,
        chapterId: convo.chapter_id || undefined,
        title: convo.title || undefined,
        createdAt: convo.created_at,
        lastMessage: lastMessage.slice(0, 60) + (lastMessage.length > 60 ? '...' : ''),
        lastMessageTime: convo.last_message_time || convo.created_at,
      };
    });

    return NextResponse.json(list);
  } catch (error) {
    console.error('[GET /api/chat/conversations] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { conversationId, title } = await req.json();
    if (!conversationId || typeof title !== 'string') {
      return NextResponse.json({ error: 'Missing conversationId or valid title' }, { status: 400 });
    }

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(conversationId)) {
      return NextResponse.json({ error: 'Invalid conversationId format' }, { status: 400 });
    }

    // Resolve internal User UUID
    const userResult = (await sql`
      SELECT id FROM users WHERE clerk_id = ${clerkId} AND deletion_requested_at IS NULL
    `) as unknown as Array<{ id: string }>;

    if (userResult.length === 0) {
      return NextResponse.json({ error: 'User not found or pending deletion' }, { status: 404 });
    }

    const userId = userResult[0].id;

    // Update conversation title (ensure ownership)
    const result = (await sql`
      UPDATE conversations 
      SET title = ${title.trim()}
      WHERE id = ${conversationId} AND user_id = ${userId}
      RETURNING id
    `) as unknown as Array<{ id: string }>;

    if (result.length === 0) {
      return NextResponse.json({ error: 'Conversation not found or access denied' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[PATCH /api/chat/conversations] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Support both URL search parameters and JSON body for flexibility
    let conversationId: string | null = null;
    if (req.method === 'DELETE') {
      const { searchParams } = new URL(req.url);
      conversationId = searchParams.get('conversationId');
    }
    
    if (!conversationId) {
      try {
        const body = await req.json();
        conversationId = body.conversationId;
      } catch {
        // Body reading failed or empty
      }
    }

    if (!conversationId) {
      return NextResponse.json({ error: 'Missing conversationId' }, { status: 400 });
    }

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(conversationId)) {
      return NextResponse.json({ error: 'Invalid conversationId format' }, { status: 400 });
    }

    // Resolve internal User UUID
    const userResult = (await sql`
      SELECT id FROM users WHERE clerk_id = ${clerkId} AND deletion_requested_at IS NULL
    `) as unknown as Array<{ id: string }>;

    if (userResult.length === 0) {
      return NextResponse.json({ error: 'User not found or pending deletion' }, { status: 404 });
    }

    const userId = userResult[0].id;

    // Delete conversation (ownership checked in query)
    const result = (await sql`
      DELETE FROM conversations 
      WHERE id = ${conversationId} AND user_id = ${userId}
      RETURNING id
    `) as unknown as Array<{ id: string }>;

    if (result.length === 0) {
      return NextResponse.json({ error: 'Conversation not found or access denied' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/chat/conversations] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
