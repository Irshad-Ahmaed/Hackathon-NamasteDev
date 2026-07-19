import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function DELETE() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const clerkIdHash = crypto.createHash('sha256').update(clerkId).digest('hex');

  const user = (await sql`SELECT id FROM users WHERE clerk_id = ${clerkId}`) as unknown as Array<{ id: string }>;
  if (!user.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const userId = user[0].id;

  try {
    const result = (await sql`
      WITH user_update AS (
        UPDATE users 
        SET deletion_requested_at = now() 
        WHERE id = ${userId}
        RETURNING id
      )
      INSERT INTO deletion_jobs (user_id, clerk_id)
      SELECT id, ${clerkId} FROM user_update
      ON CONFLICT (user_id) DO UPDATE 
      SET status = 'pending', attempts = 0, updated_at = now()
      RETURNING id
    `) as unknown as Array<{ id: string }>;

    if (result.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    logger.info({ event: 'account_deletion_queued', clerkIdHash });
    return NextResponse.json({ 
      success: true, 
      message: 'Account deletion request queued successfully. Data deletion is being processed.' 
    });
  } catch (err: unknown) {
    const error = err as Error;
    logger.error({ event: 'account_deletion_queue_failed', clerkIdHash, err: error.message || String(error) });
    return NextResponse.json({ error: 'Failed to request deletion. Please try again.' }, { status: 500 });
  }
}
