import { NextResponse, NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';
import { clerkClient } from '@clerk/nextjs/server';
import crypto from 'crypto';
import { CRISIS_REVIEW_DATE } from '@/lib/errors';

function hash(id: string): string {
  return crypto.createHash('sha256').update(id).digest('hex');
}

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (new Date() > new Date(CRISIS_REVIEW_DATE)) {
    logger.warn({ 
      event: 'crisis_helpline_review_overdue', 
      message: `The CRISIS_REVIEW_DATE (${CRISIS_REVIEW_DATE}) has passed. Please verify the helpline numbers in environment variables and update the date.` 
    });
  }

  const clerk = await clerkClient();

  try {
    // 1. Claim pending or failed jobs with SKIP LOCKED (supports concurrent workers)
    const claimedJobs = (await sql`
      UPDATE deletion_jobs
      SET status = 'processing', attempts = attempts + 1, locked_at = now(), updated_at = now()
      WHERE id IN (
        SELECT id FROM deletion_jobs
        WHERE (
          status IN ('pending', 'failed') OR 
          (status = 'processing' AND locked_at < now() - interval '15 minutes')
        ) 
        AND attempts < 5
        FOR UPDATE SKIP LOCKED
        LIMIT 10
      )
      RETURNING id, user_id, clerk_id, attempts
    `) as unknown as Array<{ id: string; user_id: string; clerk_id: string; attempts: number }>;

    for (const job of claimedJobs) {
      const { id: jobId, user_id: userId, clerk_id: clerkId, attempts } = job;
      const clerkIdHash = hash(clerkId);
      const userIdHash = hash(userId);

      try {
        // 2. Query personal B2C 'individual' workspace tenants associated with this user
        const personalTenants = (await sql`
          SELECT t.id FROM tenants t
          JOIN tenant_memberships m ON t.id = m.tenant_id
          WHERE m.user_id = ${userId} AND t.type = 'individual'
        `) as unknown as Array<{ id: string }>;

        // 3. Clean up personal tenants (billing omitted for MVP as per ticket)
        for (const tenant of personalTenants) {
          await sql`
            DELETE FROM tenants WHERE id = ${tenant.id}
          `;
        }

        // 4. Delete the Clerk user account FIRST
        // If this fails, the local DB records (users, conversations) remain intact
        // allowing the job to be retried safely.
        try {
          await clerk.users.deleteUser(clerkId);
        } catch (clerkErr: unknown) {
          // Idempotency: Treat 404/not found as success so local cleanup can finish
          const err = clerkErr as { status?: number; statusCode?: number; message?: string };
          const is404 = 
            err.status === 404 || 
            err.statusCode === 404 || 
            err.message?.toLowerCase().includes('not found') || 
            err.message?.toLowerCase().includes('404');

          if (!is404) {
            throw clerkErr;
          }
          logger.info({ event: 'clerk_user_already_deleted', clerkIdHash });
        }

        // 5. Cascade delete the local user row LAST (only after Clerk confirms deletion)
        // Enforces full cascade cleanup of memberships, conversations, messages, and the job itself.
        await sql`
          DELETE FROM users WHERE id = ${userId}
        `;

        logger.info({ event: 'account_deletion_processed_success', clerkIdHash, userIdHash });
      } catch (err: unknown) {
        const error = err as Error;
        logger.error({ 
          event: 'account_deletion_user_failed', 
          userIdHash, 
          clerkIdHash, 
          err: error.message || String(error)
        });

        // Alert on 5th failed attempt
        if (attempts >= 5) {
          logger.error({ event: 'account_deletion_permanently_failed_alert', userIdHash, clerkIdHash, jobId });
          // In production, integrate with Sentry/PagerDuty alerting here
        }

        // Set status to failed so the worker can retry it next time (up to 5 attempts)
        await sql`
          UPDATE deletion_jobs
          SET status = 'failed', locked_at = null, last_error = ${error.message || 'Unknown error'}, updated_at = now()
          WHERE id = ${jobId}
        `;
      }
    }
    
    return NextResponse.json({ processed: claimedJobs.length });
  } catch (err: unknown) {
    const error = err as Error;
    logger.error({ event: 'process_account_deletions_failed', err: error.message || String(error) });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
