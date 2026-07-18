#!/usr/bin/env tsx
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

import { sql } from '../lib/db';
import { qdrant, COLLECTION } from '../lib/qdrant';

function parseArgs() {
  const args: Record<string, string | boolean> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const nextVal = argv[i + 1];
      if (nextVal && !nextVal.startsWith('--')) {
        args[key] = nextVal;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

async function main() {
  const args = parseArgs();
  const subject = args.subject as 'mathematics' | 'science';
  const chapterStr = args.chapter as string;
  const confirmed = !!args.confirmed;

  if (!subject || !chapterStr) {
    console.error('Usage: npx tsx scripts/mark-chapter-live.ts --subject [mathematics|science] --chapter [number] [--confirmed]');
    process.exit(1);
  }

  const chapterNumber = parseInt(chapterStr, 10);
  if (isNaN(chapterNumber)) {
    console.error('Error: Chapter must be a valid integer.');
    process.exit(1);
  }

  if (subject !== 'mathematics' && subject !== 'science') {
    console.error('Error: Subject must be "mathematics" or "science".');
    process.exit(1);
  }

  if (!confirmed) {
    console.error('Error: Action requires human confirmation. Please run with --confirmed flag.');
    console.log('Ensure you have spot-checked 10 random chunks from the chapter and that evaluate-rag.ts passes.');
    process.exit(1);
  }

  try {
    // 1. Resolve active collection
    const aliasesResult = await qdrant.getAliases();
    const activeCollection = aliasesResult.aliases.find(a => a.alias_name === COLLECTION)?.collection_name;
    if (!activeCollection) {
      throw new Error(`Alias "${COLLECTION}" is not configured in Qdrant.`);
    }

    console.log(`Marking chunks as reviewed for ${subject} chapter ${chapterNumber} in Qdrant collection ${activeCollection}...`);

    // 2. We scroll to find all points matching this chapter and subject
    const scrollResult = await qdrant.scroll(activeCollection, {
      filter: {
        must: [
          { key: 'subject', match: { value: subject } },
          { key: 'chapterNumber', match: { value: chapterNumber } }
        ]
      },
      limit: 1000 // Scroll up to 1000 chunks
    });

    const pointIds = scrollResult.points.map(p => p.id);
    if (pointIds.length === 0) {
      console.warn('No chunks found matching specified chapter and subject in vector database.');
    } else {
      console.log(`Found ${pointIds.length} chunks. Updating payload 'reviewed: true' in Qdrant...`);
      
      // Batch update payload in Qdrant
      await qdrant.setPayload(activeCollection, {
        payload: { reviewed: true },
        points: pointIds
      });

      console.log(`Successfully updated ${pointIds.length} vectors in Qdrant.`);
    }

    // Use a regex match to avoid matching chapter 13 when trying to mark chapter 3 live.
    // Matches chapter number with optional leading zeroes, bounded by non-digits.
    const pattern = `(^|[^0-9])0*${chapterNumber}([^0-9]|$)`;
    console.log(`Updating Postgres database ingestion source status to verified with pattern: ${pattern}`);
    await sql`
      UPDATE ingestion_sources
      SET status = 'verified'
      WHERE subject = ${subject} AND title ~ ${pattern}
    `;

    console.log('Postgres update complete.');
    console.log(`All chunks for ${subject} Chapter ${chapterNumber} are now verified and live in production search!`);

  } catch (error) {
    console.error('Operation failed with error:', error);
    process.exit(1);
  }
}

main();
