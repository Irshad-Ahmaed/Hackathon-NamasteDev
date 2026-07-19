#!/usr/bin/env tsx
/**
 * Minimal migration runner.
 *
 * Usage:
 *   npx tsx scripts/run-migration.ts db/migrations/004_user_note_documents.sql
 *
 * Executes each semicolon-terminated statement in the given .sql file against
 * DATABASE_URL. Intended for simple DDL migrations without dollar-quoted bodies.
 * The neon HTTP driver runs one statement per call, so we split and run in order.
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import fs from 'fs';
import path from 'path';
import { sql } from '../lib/db';

function splitStatements(source: string): string[] {
  // Strip line comments, then split on semicolons. Safe for plain DDL only.
  const withoutComments = source
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  return withoutComments
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function main() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error('Usage: npx tsx scripts/run-migration.ts <path-to-sql-file>');
    process.exit(1);
  }

  const filePath = path.resolve(process.cwd(), fileArg);
  if (!fs.existsSync(filePath)) {
    console.error(`Migration file not found: ${filePath}`);
    process.exit(1);
  }

  const source = fs.readFileSync(filePath, 'utf8');
  const statements = splitStatements(source);
  console.log(`Applying ${statements.length} statement(s) from ${fileArg}...`);

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const preview = stmt.replace(/\s+/g, ' ').slice(0, 80);
    try {
      // Invoke the neon tagged-template function with a single literal chunk and
      // no interpolations. This runs the raw DDL statement using the same code
      // path as the app's `sql` helper (which is known to connect successfully).
      const templateChunks = Object.assign([stmt], { raw: [stmt] }) as unknown as TemplateStringsArray;
      await (sql as unknown as (s: TemplateStringsArray) => Promise<unknown>)(templateChunks);
      console.log(`  [${i + 1}/${statements.length}] OK: ${preview}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Make re-runs idempotent-ish: skip "already exists" errors.
      if (/already exists/i.test(message)) {
        console.log(`  [${i + 1}/${statements.length}] SKIP (exists): ${preview}`);
        continue;
      }
      console.error(`  [${i + 1}/${statements.length}] FAILED: ${preview}`);
      console.error(`    ${message}`);
      process.exit(1);
    }
  }

  console.log('Migration complete.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
