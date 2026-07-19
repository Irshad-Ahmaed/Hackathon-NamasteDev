import { auth } from '@clerk/nextjs/server';
import { NextRequest } from 'next/server';
import { sql } from './db';
import { AppError } from './errors';

export interface ResolvedActor {
  clerkId: string;
  userId: string; // internal users.id UUID
  tenantId: string; // active, authorized tenant
}

/**
 * Resolves the authenticated Clerk user to an internal user UUID and an active,
 * authorized tenant. Mirrors the membership + `x-active-tenant-id` validation
 * used by /api/chat so every note-document endpoint shares one ownership model.
 *
 * Throws AppError with the same status-code semantics as /api/chat:
 * - 401 UNAUTHORIZED    : no Clerk session
 * - 409 SETUP_INCOMPLETE: user has no tenant membership yet (webhook still syncing)
 * - 403 FORBIDDEN       : account deletion in progress, or tenant not authorized
 */
export async function resolveActor(req: NextRequest): Promise<ResolvedActor> {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    throw new AppError('UNAUTHORIZED', 'Unauthorized', 401);
  }

  const activeTenantHeader = req.headers.get('x-active-tenant-id');

  const memberships = (await sql`
    SELECT u.id as user_uuid, u.deletion_requested_at, m.tenant_id, m.is_primary
    FROM users u
    JOIN tenant_memberships m ON u.id = m.user_id
    WHERE u.clerk_id = ${clerkId}
  `) as unknown as Array<{
    user_uuid: string;
    deletion_requested_at: string | null;
    tenant_id: string;
    is_primary: boolean;
  }>;

  if (memberships.length === 0) {
    throw new AppError('SETUP_INCOMPLETE', 'Finishing setup... Please wait a moment and try again.', 409);
  }

  const firstMembership = memberships[0];

  if (firstMembership.deletion_requested_at) {
    throw new AppError('FORBIDDEN', 'Account deletion in progress.', 403);
  }

  const userId = firstMembership.user_uuid;
  let tenantId: string;

  if (activeTenantHeader) {
    const match = memberships.find(m => m.tenant_id === activeTenantHeader);
    if (!match) {
      throw new AppError('FORBIDDEN', 'Access denied to selected workspace.', 403);
    }
    tenantId = match.tenant_id;
  } else {
    const primary = memberships.find(m => m.is_primary) ?? firstMembership;
    tenantId = primary.tenant_id;
  }

  return { clerkId, userId, tenantId };
}
