import { NextRequest, NextResponse } from 'next/server';
import { executeChatPipeline } from '@/lib/rag/chat-service';
import { ChatRequestSchema } from '@/lib/schemas';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db';
import { AppError } from '@/lib/errors';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate user session
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse & validate body
    const body = await req.json();
    const result = ChatRequestSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: 'Invalid request', details: result.error.flatten() }, { status: 400 });
    }

    const { messages, conversationId } = result.data;
    // We default to mathematics, but this could be dynamically passed from the client depending on the UI
    const subject = 'mathematics'; 

    // 3. Resolve user internal UUID and active tenantId from Postgres
    const userRows = (await sql`
      SELECT u.id, m.tenant_id 
      FROM users u
      JOIN tenant_memberships m ON u.id = m.user_id
      WHERE u.clerk_id = ${clerkId} AND m.is_primary = true
    `) as unknown as Array<{ id: string; tenant_id: string }>;

    if (userRows.length === 0) {
      return NextResponse.json({ error: 'User account not fully provisioned or setup incomplete' }, { status: 409 });
    }

    const { id: internalUserId, tenant_id: tenantId } = userRows[0];

    // 4. Verify user account is not pending DPDP erasure
    const erasureCheck = (await sql`
      SELECT 1 FROM users WHERE id = ${internalUserId} AND deletion_requested_at IS NOT NULL
    `) as unknown as Array<unknown>;

    if (erasureCheck.length > 0) {
      return NextResponse.json({ error: 'Account pending deletion. Access denied.' }, { status: 403 });
    }

    // 5. Execute Chat Pipeline (returns ReadableStream)
    const stream = await executeChatPipeline({
      userId: internalUserId,
      tenantId,
      conversationId,
      messages,
      subject,
    });

    // 6. Return stream
    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('[POST /api/chat] Error:', error);
    
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
