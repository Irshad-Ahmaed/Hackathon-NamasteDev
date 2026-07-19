import { NextRequest, NextResponse } from 'next/server';
import { executeChatPipeline } from '@/lib/rag/chat-service';
import { ChatRequestSchema, ChatRequest } from '@/lib/schemas';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { enforceRateLimits } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();
  let internalUserId = '';
  let requestData: ChatRequest | null = null;

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

    requestData = result.data;

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

    internalUserId = firstMembership.user_uuid;
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
    // Take the first IP only — x-forwarded-for may be comma-separated (e.g. "1.2.3.4, 10.0.0.1")
    const rawIp = req.headers.get('x-forwarded-for') ?? '127.0.0.1';
    const ip = rawIp.split(',')[0].trim();
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
      requestId,
      startTime,
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

  } catch (error: unknown) {
    console.error('[POST /api/chat] Error:', error);
    
    const durationMs = Date.now() - startTime;
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    const isModerationBlocked = error instanceof AppError && error.code === 'MODERATION_BLOCKED';
    const outcome = isModerationBlocked ? 'blocked' : 'error';
    const userIdHash = internalUserId ? crypto.createHash('sha256').update(internalUserId).digest('hex') : 'anonymous';

    logger.error({
      requestId,
      userIdHash,
      route: '/api/chat',
      subject: requestData?.subject || 'unknown',
      chapterId: requestData?.chapterId,
      mode: requestData?.mode || 'unknown',
      statusCode,
      durationMs,
      outcome,
      error: error instanceof Error ? error.message : String(error),
    }, 'chat_request_complete');

    try {
      // Use correct event_type: 'chat_message_blocked' for moderation, 'chat_message_failed' for other errors
      const eventType = isModerationBlocked ? 'chat_message_blocked' : 'chat_message_failed';
      await sql`
        INSERT INTO events (user_id_hash, event_type, subject, chapter_id, mode, outcome, duration_ms, estimated_cost_usd)
        VALUES (${userIdHash}, ${eventType}, ${requestData?.subject || null}, ${requestData?.chapterId || null}, ${requestData?.mode || null}, ${outcome}, ${durationMs}, 0)
      `;
    } catch (dbErr) {
      console.error('Failed to log event to DB on route error:', dbErr);
    }

    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
