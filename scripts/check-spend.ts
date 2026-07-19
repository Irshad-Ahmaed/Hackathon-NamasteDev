#!/usr/bin/env tsx
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

import { sql } from '../lib/db';
import { logger } from '../lib/logger';

async function checkDailySpend() {
  const limit = parseFloat(process.env.DAILY_SPEND_LIMIT_USD || '10.0');
  
  try {
    const result = (await sql`
      SELECT COALESCE(SUM(estimated_cost_usd), 0) as total_cost,
             COUNT(*) as total_requests
      FROM events
      WHERE created_at >= now() - interval '24 hours'
    `) as Record<string, unknown>[];

    const totalCost = parseFloat(result[0].total_cost as string || '0');
    const totalRequests = parseInt(result[0].total_requests as string || '0');
    const avgCost = totalRequests > 0 ? totalCost / totalRequests : 0;

    logger.info({
      event: 'spend_report',
      totalCostUsd: totalCost,
      totalRequests,
      avgCostPerRequestUsd: avgCost,
      limitUsd: limit
    });

    if (totalCost > limit) {
      logger.error({
        event: 'spend_limit_exceeded',
        msg: `ALERT: OpenAI daily spend limit exceeded! Total: $${totalCost.toFixed(4)}, Limit: $${limit.toFixed(4)}`,
        totalCostUsd: totalCost,
        limitUsd: limit
      });
      return true; // Exceeded
    } else {
      logger.info('OpenAI spend limit check passed.');
      return false; // Under limit
    }
  } catch (error: unknown) {
    logger.error({
      event: 'spend_check_failed',
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

checkDailySpend().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
