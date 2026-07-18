#!/usr/bin/env tsx
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

import { sql } from '../lib/db';
import { logger } from '../lib/logger';

async function main() {
  const threshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
  
  try {
    // Delete conversations older than 30 days. Cascade will delete corresponding messages.
    const result = (await sql`
      DELETE FROM conversations 
      WHERE created_at < ${threshold}
      RETURNING id
    `) as unknown as Array<{ id: string }>;
    
    logger.info({ event: 'cleanup_chats_success', deletedCount: result.length });
  } catch (err) {
    logger.error({ event: 'cleanup_chats_failed', err });
    process.exit(1);
  }
}

main().then(() => process.exit(0));
