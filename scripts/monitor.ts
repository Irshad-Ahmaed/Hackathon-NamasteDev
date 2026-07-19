#!/usr/bin/env tsx
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

import { sql } from '../lib/db';
import { logger } from '../lib/logger';

async function runMonitoringChecks() {
  logger.info('Starting monitoring and health checks on events database...');
  let hasAlerts = false;

  try {
    // 1. Error rate > 2% over 15 minutes
    const errorCheck = (await sql`
      SELECT 
        COUNT(*)::integer as total,
        COUNT(CASE WHEN outcome = 'error' OR event_type = 'chat_message_failed' THEN 1 END)::integer as errors
      FROM events
      WHERE created_at >= now() - interval '15 minutes'
    `) as unknown as Array<{ total: number; errors: number }>;
    const total15m = errorCheck[0]?.total || 0;
    const errors15m = errorCheck[0]?.errors || 0;
    const errorRate = total15m > 0 ? (errors15m / total15m) * 100 : 0;
    
    logger.info({ event: 'metric_error_rate', total: total15m, errors: errors15m, ratePercent: errorRate });
    if (errorRate > 2.0) {
      logger.error(`ALERT: High error rate in last 15 minutes! Current: ${errorRate.toFixed(2)}%, threshold: 2.0%`);
      hasAlerts = true;
    }

    // 2. Retrieval miss rate (low_confidence outcome) > 10% over 1 hour
    const missCheck = (await sql`
      SELECT 
        COUNT(*)::integer as total,
        COUNT(CASE WHEN outcome = 'low_confidence' THEN 1 END)::integer as misses
      FROM events
      WHERE created_at >= now() - interval '1 hour'
        AND event_type = 'chat_message'
    `) as unknown as Array<{ total: number; misses: number }>;
    const total1h = missCheck[0]?.total || 0;
    const misses1h = missCheck[0]?.misses || 0;
    const missRate = total1h > 0 ? (misses1h / total1h) * 100 : 0;

    logger.info({ event: 'metric_retrieval_miss_rate', total: total1h, misses: misses1h, ratePercent: missRate });
    if (missRate > 10.0) {
      logger.warn(`ALERT: High retrieval miss rate in last hour! Current: ${missRate.toFixed(2)}%, threshold: 10.0%`);
      hasAlerts = true;
    }

    // 3. P95 chat latency > 12 seconds over last hour
    const latencyCheck = (await sql`
      SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) as p95
      FROM events
      WHERE created_at >= now() - interval '1 hour'
        AND duration_ms IS NOT NULL
    `) as unknown as Array<{ p95: string | number | null }>;
    const p95LatencyMs = parseFloat(latencyCheck[0]?.p95 as string || '0');
    const p95LatencySec = p95LatencyMs / 1000;

    logger.info({ event: 'metric_latency_p95', p95LatencySec });
    if (p95LatencySec > 12.0) {
      logger.warn(`ALERT: High P95 chat latency in last hour! Current: ${p95LatencySec.toFixed(2)}s, threshold: 12.0s`);
      hasAlerts = true;
    }

    // 4. Moderation block spike (> 5 in 10 minutes)
    const modCheck = (await sql`
      SELECT COUNT(*)::integer as blocks
      FROM events
      WHERE created_at >= now() - interval '10 minutes'
        AND outcome = 'blocked'
    `) as unknown as Array<{ blocks: number }>;
    const blocks10m = modCheck[0]?.blocks || 0;
    logger.info({ event: 'metric_moderation_blocks', blocks: blocks10m });
    if (blocks10m > 5) {
      logger.error(`ALERT: Moderation block spike detected! Blocks: ${blocks10m} in 10 minutes, threshold: 5`);
      hasAlerts = true;
    }

    if (!hasAlerts) {
      logger.info('All database monitoring metrics are within safe operating parameters.');
    }
  } catch (error: unknown) {
    logger.error({
      event: 'monitoring_run_failed',
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

runMonitoringChecks().then(() => process.exit(0)).catch(() => process.exit(1));
