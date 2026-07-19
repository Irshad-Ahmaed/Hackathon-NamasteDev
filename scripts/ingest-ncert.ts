#!/usr/bin/env tsx
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { sql } from '../lib/db';
import { openai, models, estimateCostUsd } from '../lib/openai';
import { qdrant, COLLECTION, ChunkPayload } from '../lib/qdrant';
import { extractPdf } from '../lib/pdf-extractor';
import { chunkChapter } from '../lib/chunker';

// Simple argument parser
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

async function verifyChapterIngestion(subject: string, chapterNumber: number) {
  console.log('Running quality and validation checks...');
  
  // 1. Resolve collection name from alias
  const aliasesResult = await qdrant.getAliases();
  const activeCollection = aliasesResult.aliases.find(a => a.alias_name === COLLECTION)?.collection_name;
  if (!activeCollection) {
    throw new Error(`Cannot verify: Alias "${COLLECTION}" is not configured in Qdrant.`);
  }

  // 2. Query Qdrant for this chapter's vectors
  const searchResult = await qdrant.scroll(activeCollection, {
    filter: {
      must: [
        { key: 'subject', match: { value: subject } },
        { key: 'chapterNumber', match: { value: chapterNumber } }
      ]
    },
    limit: 100
  });

  const count = searchResult.points.length;
  console.log(`- Total chunks found in vector DB: ${count}`);

  if (count < 5) {
    console.error(`[FAIL] Expected at least 5 chunks for chapter, found only ${count}.`);
    return false;
  }
  if (count > 500) {
    console.error(`[FAIL] Suspiciously high chunk count (${count}).`);
    return false;
  }

  // 3. Verify metadata payload properties
  for (const point of searchResult.points) {
    const payload = point.payload as ChunkPayload | undefined;
    if (!payload) {
      console.error('[FAIL] Found vector with missing payload.');
      return false;
    }
    const requiredKeys: Array<keyof ChunkPayload> = ['subject', 'chapterNumber', 'pageStart', 'language', 'reviewed'];
    for (const key of requiredKeys) {
      if (payload[key] === undefined) {
        console.error(`[FAIL] Chunk payload missing required metadata key: "${key}"`);
        return false;
      }
    }
    if (payload.reviewed !== false) {
      console.error('[FAIL] New chunk is marked as reviewed=true (must default to false).');
      return false;
    }
  }

  console.log('[PASS] Quality and metadata checks completed successfully.');
  return true;
}

async function main() {
  const args = parseArgs();
  
  const subject = args.subject as 'mathematics' | 'science';
  const filePath = args.file as string;
  const chapterStr = args.chapter as string;
  const language = (args.language as 'en' | 'hi') || 'en';
  const dryRun = !!args['dry-run'];

  if (!subject || !filePath || !chapterStr) {
    console.error('Usage: npx tsx scripts/ingest-ncert.ts --subject [mathematics|science] --file [path/to/pdf] --chapter [number] [--language en|hi] [--dry-run]');
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

  try {
    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      console.error(`Error: File not found at path "${resolvedPath}"`);
      process.exit(1);
    }

    console.log(`Processing file: ${resolvedPath}...`);
    const fileBuffer = fs.readFileSync(resolvedPath);
    const contentHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const documentId = crypto.randomUUID();

    // 1. Idempotency Check in Postgres
    if (!dryRun) {
      const existing = (await sql`
        SELECT id FROM ingestion_sources 
        WHERE content_hash = ${contentHash}
      `) as unknown as Array<{ id: string }>;
      if (existing.length > 0) {
        console.log(`[Idempotent] File with hash ${contentHash.slice(0, 10)}... already ingested and live. Skipping.`);
        process.exit(0);
      }
    }

    // 2. Extract PDF text
    console.log('Extracting text from PDF pages...');
    const pages = await extractPdf(fileBuffer);
    console.log(`Extracted ${pages.length} pages.`);

    // 3. Chunk the chapter
    console.log('Chunking text into overlapping segments...');
    const baseTitle = path.basename(resolvedPath, '.pdf');
    const chunks = chunkChapter(pages);
    console.log(`Created ${chunks.length} overlapping chunks.`);

    if (chunks.length === 0) {
      console.error('Error: No text chunks generated from PDF. Verify the PDF contents.');
      process.exit(1);
    }

    // 4. Generate Embeddings & Upsert to Qdrant
    console.log('Generating embeddings in batches of 100...');
    
    // Resolve versioned collection name from Qdrant alias
    let targetCollection = '';
    if (!dryRun) {
      const aliasesResult = await qdrant.getAliases();
      const activeCollection = aliasesResult.aliases.find(a => a.alias_name === COLLECTION)?.collection_name;
      if (!activeCollection) {
        throw new Error(`Alias "${COLLECTION}" not found. Please run scripts/setup-qdrant.ts first.`);
      }
      targetCollection = activeCollection;
    }
    const batchSize = 100;
    const points: Array<{ id: string; vector: number[]; payload: ChunkPayload }> = [];
    let totalInputTokens = 0;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      console.log(`- Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(chunks.length / batchSize)}...`);
      
      const embeddingResponse = await openai.embeddings.create({
        model: models.embedding,
        input: batch.map(c => c.text),
      });

      totalInputTokens += embeddingResponse.usage.prompt_tokens;

      for (let j = 0; j < batch.length; j++) {
        const chunk = batch[j];
        const vector = embeddingResponse.data[j].embedding;
        const pointId = crypto.randomUUID();

        // Metadata conforming exactly to ChunkPayload type
        const payload = {
          documentId,
          sourceTitle: baseTitle,
          sourceVersion: process.env.CURRICULUM_VERSION || '2024-ncert',
          subject,
          chapterNumber,
          chapterTitle: baseTitle,
          sectionTitle: chunk.sectionTitle,
          pageStart: chunk.pageStart,
          pageEnd: chunk.pageEnd,
          chunkIndex: chunk.chunkIndex,
          contentHash: crypto.createHash('sha256').update(chunk.text).digest('hex'),
          contentType: chunk.contentType,
          language,
          curriculumVersion: process.env.CURRICULUM_VERSION || '2024-ncert',
          reviewed: false, // Must remain false until admin review
          text: chunk.text, // Store ONLY the chunk excerpt
          officialSourceUrl: `https://ncert.nic.in/textbook.php?${subject === 'mathematics' ? 'jemh1' : 'jesc1'}=${chapterNumber - 1}`, // Sample official mapping
        };

        points.push({
          id: pointId,
          vector,
          payload,
        });
      }
    }

    const estimatedCost = estimateCostUsd(models.embedding, totalInputTokens, 0);
    console.log(`Embedding Generation Completed. Tokens used: ${totalInputTokens}. Estimated cost: $${estimatedCost.toFixed(5)}`);

    if (dryRun) {
      console.log('[Dry Run] Embedding generated successfully. Qdrant upsert and database logging skipped.');
      process.exit(0);
    }

    // Upsert vectors to Qdrant
    console.log(`Upserting ${points.length} points to Qdrant collection: ${targetCollection}...`);
    await qdrant.upsert(targetCollection, {
      wait: true,
      points,
    });

    // Write source file status to database
    console.log('Writing ingestion record to database...');
    await sql`
      INSERT INTO ingestion_sources (title, subject, language, version, content_hash, chunk_count, status)
      VALUES (${baseTitle}, ${subject}, ${language}, ${process.env.CURRICULUM_VERSION || '2024-ncert'}, ${contentHash}, ${chunks.length}, 'pending')
      ON CONFLICT (content_hash) DO UPDATE 
      SET chunk_count = ${chunks.length}, ingested_at = now()
    `;

    // Run Validation Checks
    const validationPassed = await verifyChapterIngestion(subject, chapterNumber);
    if (!validationPassed) {
      console.warn('[WARNING] Ingestion validation failed. Please check the logs.');
    } else {
      console.log('Ingestion completed and validated successfully!');
    }
  } catch (error) {
    console.error('Ingestion failed with error:', error);
    process.exit(1);
  }
}

main();
