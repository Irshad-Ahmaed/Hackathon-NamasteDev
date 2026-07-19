import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';

import crypto from 'crypto';

// This route is PUBLIC -- must NOT be protected by clerkMiddleware auth check.
// Clerk sends signed events here when users are created, updated, or deleted.
// Verification via svix signature prevents spoofed requests.
export async function POST(req: Request) {
  const headersList = await headers();
  const svixId = headersList.get('svix-id');
  const svixTimestamp = headersList.get('svix-timestamp');
  const svixSignature = headersList.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return Response.json({ error: 'Missing svix headers' }, { status: 400 });
  }

  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    logger.error('Missing CLERK_WEBHOOK_SECRET environment variable');
    return Response.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const body = await req.text();
  const wh = new Webhook(secret);

  let event: { type: string; data: { id: string; email_addresses?: Array<{ email_address: string }>; [key: string]: unknown } };
  try {
    event = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as { type: string; data: { id: string; email_addresses?: Array<{ email_address: string }>; [key: string]: unknown } };
  } catch (err) {
    logger.warn({ event: 'clerk_webhook_signature_invalid', err });
    return Response.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const { type, data } = event;

  // Hashed Clerk user ID for secure anonymized logging
  const clerkIdHash = crypto.createHash('sha256').update(data.id).digest('hex');

  // UPSERT pattern -- idempotent, safe on duplicate deliveries
  if (type === 'user.created' || type === 'user.updated') {
    // Provide a unique placeholder for phone-only signups to avoid UNIQUE constraint violations
    const email = data.email_addresses?.[0]?.email_address ?? `${data.id}@placeholder.clerk.com`;

    // Query user first to handle idempotence safely
    const existingUser = await sql`
      SELECT id FROM users WHERE clerk_id = ${data.id}
    ` as unknown[];

    if (existingUser.length > 0) {
      await sql`
        UPDATE users SET email = ${email}, updated_at = now()
        WHERE clerk_id = ${data.id}
      `;
    } else {
      // Transactional provision of user + workspace:
      // Insert tenant, user, and link via membership atomically using CTE.
      // If any step fails, SVIX webhook fails and Clerk will retry.
      await sql`
        WITH new_tenant AS (
          INSERT INTO tenants (name, type, plan_tier)
          VALUES ('Personal Workspace', 'individual', 'free')
          RETURNING id
        ),
        new_user AS (
          INSERT INTO users (clerk_id, email, updated_at)
          VALUES (${data.id}, ${email}, now())
          RETURNING id
        )
        INSERT INTO tenant_memberships (tenant_id, user_id, role, is_primary)
        SELECT new_tenant.id, new_user.id, 'student', true
        FROM new_tenant, new_user
        ON CONFLICT DO NOTHING
      `;
    }
    logger.info({ event: 'clerk_user_synced', clerkIdHash, type });
  }

  if (type === 'user.deleted') {
    // Soft delete: mark deletion_requested_at and queue a background erasure job.
    // If the cron worker already deleted the row, this safely does nothing.
    await sql`
      WITH user_update AS (
        UPDATE users 
        SET deletion_requested_at = now() 
        WHERE clerk_id = ${data.id}
        RETURNING id, clerk_id
      )
      INSERT INTO deletion_jobs (user_id, clerk_id)
      SELECT id, clerk_id FROM user_update
      ON CONFLICT (user_id) DO UPDATE 
      SET status = 'pending', attempts = 0, updated_at = now()
    `;
    logger.info({ event: 'clerk_user_deletion_requested', clerkIdHash });
  }

  return Response.json({ received: true });
}
