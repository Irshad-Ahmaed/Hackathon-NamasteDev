import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db';
import { fetchHistory } from '@/server/conversation-service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get('conversationId');

    if (!conversationId) {
      return NextResponse.json({ error: 'Missing conversationId' }, { status: 400 });
    }

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(conversationId)) {
      return NextResponse.json({ error: 'Invalid conversationId format' }, { status: 400 });
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

    // Resolve the conversation's tenant_id and verify user ownership
    const convoResult = (await sql`
      SELECT tenant_id 
      FROM conversations 
      WHERE id = ${conversationId} AND user_id = ${userId}
    `) as unknown as Array<{ tenant_id: string }>;

    if (convoResult.length === 0) {
      return NextResponse.json({ error: 'Conversation not found or access denied' }, { status: 404 });
    }

    const tenantId = convoResult[0].tenant_id;

    const messages = await fetchHistory(conversationId, userId, tenantId);

    const clientMessages = messages.map(msg => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      streaming: false,
      feedbackType: msg.feedbackType,
    }));

    return NextResponse.json(clientMessages);
  } catch (error) {
    console.error('[GET /api/chat/history] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
