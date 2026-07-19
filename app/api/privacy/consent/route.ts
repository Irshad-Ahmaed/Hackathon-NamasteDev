import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const clerkIdHash = crypto.createHash('sha256').update(clerkId).digest('hex');

  try {
    const { parentEmail } = await req.json();
    
    // Simple email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!parentEmail || typeof parentEmail !== 'string' || !emailRegex.test(parentEmail)) {
      return NextResponse.json({ error: 'A valid parent email is required' }, { status: 400 });
    }

    // Update user in DB
    const result = (await sql`
      UPDATE users 
      SET consent_state = 'given', 
          consent_timestamp = now(), 
          parent_email = ${parentEmail},
          updated_at = now()
      WHERE clerk_id = ${clerkId}
      RETURNING id, consent_state
    `) as Record<string, unknown>[];

    if (!result.length) {
      return NextResponse.json({ error: 'User not found in database' }, { status: 404 });
    }

    logger.info({ event: 'consent_given', clerkIdHash });

    return NextResponse.json({ 
      success: true, 
      message: 'Parental consent stored successfully.' 
    });
  } catch (err: unknown) {
    logger.error({ event: 'consent_store_failed', clerkIdHash, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  try {
    const user = (await sql`
      SELECT consent_state, parent_email 
      FROM users 
      WHERE clerk_id = ${clerkId}
    `) as Record<string, unknown>[];

    if (!user.length) {
      return NextResponse.json({ consent_state: 'pending' });
    }

    return NextResponse.json({ 
      consent_state: user[0].consent_state,
      parent_email: user[0].parent_email
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
