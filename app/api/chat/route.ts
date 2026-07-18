import { NextRequest, NextResponse } from 'next/server';
import { executeChatPipeline } from '@/lib/rag/chat-service';
import { ChatRequestSchema } from '@/lib/schemas';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { enforceRateLimits } from '@/lib/rate-limit';

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

    const requestData = result.data;

    // 3. Resolve internal User UUID and active Tenant ID safely
    const activeTenantHeader = req.headers.get('x-active-tenant-id');

    const memberships = (await sql`
      SELECT u.id as user_uuid, u.deletion_requested_at, m.tenant_id, m.is_primary
      FROM users u
      JOIN tenant_memberships m ON u.id = m.user_id
      WHERE u.clerk_id = ${clerkId}
    `) as unknown as Array<{ user_uuid: string; deletion_requested_at: string | null; tenant_id: string; is_primary: boolean }>;

    if (memberships.length === 0) {
      return NextResponse.json({
        error: 'Finishing setup... Please wait a moment and try again.',
        code: 'SETUP_INCOMPLETE'
      }, { status: 409 });
    }

    const firstMembership = memberships[0];

    if (firstMembership.deletion_requested_at) {
      return NextResponse.json({ error: 'Account deletion in progress.', code: 'FORBIDDEN' }, { status: 403 });
    }

    const internalUserId = firstMembership.user_uuid;
    let tenantId: string;

    if (activeTenantHeader) {
      const match = memberships.find(m => m.tenant_id === activeTenantHeader);
      if (!match) {
        return NextResponse.json({ error: 'Access denied to selected workspace.', code: 'FORBIDDEN' }, { status: 403 });
      }
      tenantId = match.tenant_id;
    } else {
      const primary = memberships.find(m => m.is_primary) ?? firstMembership;
      tenantId = primary.tenant_id;
    }

    // 4. Rate Limiting
    const ip = req.headers.get('x-forwarded-for') ?? '127.0.0.1';
    const useReasoning = requestData.mode === 'solve';
    try {
      await enforceRateLimits(internalUserId, ip, useReasoning);
    } catch (rlErr: unknown) {
      const err = rlErr as Error;
      if (err.message === 'IP_RATE_LIMIT_EXCEEDED' || err.message === 'USER_DAILY_LIMIT_EXCEEDED' || err.message === 'REASONING_DAILY_LIMIT_EXCEEDED') {
        return NextResponse.json({ error: 'Rate limit exceeded. Please try again later.' }, { status: 429 });
      }
      throw rlErr;
    }

    // 5. Execute Chat Pipeline (returns ReadableStream)
    const stream = await executeChatPipeline({
      userId: internalUserId,
      tenantId,
      request: requestData,
    });

    // 6. Return stream
    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
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

