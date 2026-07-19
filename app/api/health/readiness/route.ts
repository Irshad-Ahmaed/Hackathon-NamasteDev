import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { Redis } from '@upstash/redis';
import { qdrant } from '@/lib/qdrant';



export async function GET(req: NextRequest) {
  const secretHeader = req.headers.get('x-monitor-secret');
  const monitorSecret = process.env.MONITOR_SECRET;

  if (!monitorSecret || !secretHeader || secretHeader !== monitorSecret) {
    return Response.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const checks: Record<string, string> = {};
  let status = 200;

  // 1. Check Postgres (Neon) liveness
  try {
    await sql`SELECT 1`;
    checks.db = 'ok';
  } catch (e: unknown) {
    checks.db = 'failed: ' + (e instanceof Error ? e.message : String(e));
    status = 503;
  }

  // 2. Check Redis (Upstash) liveness
  try {
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      checks.redis = 'skipped (not configured)';
    } else {
      const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
      await redis.ping();
      checks.redis = 'ok';
    }
  } catch (e: unknown) {
    checks.redis = 'failed: ' + (e instanceof Error ? e.message : String(e));
    status = 503;
  }

  // 3. Check Qdrant liveness using getCollections
  try {
    const collections = await qdrant.getCollections();
    const ok = Array.isArray(collections.collections);
    checks.qdrant = ok ? 'ok' : 'failed';
    if (!ok) status = 503;
  } catch (e: unknown) {
    checks.qdrant = 'failed: ' + (e instanceof Error ? e.message : String(e));
    status = 503;
  }

  return Response.json(
    {
      status: status === 200 ? 'healthy' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    },
    { status }
  );
}
