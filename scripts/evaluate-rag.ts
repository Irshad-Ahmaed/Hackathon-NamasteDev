#!/usr/bin/env tsx
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

import fs from 'fs';
import path from 'path';
import { openai, models } from '../lib/openai';
import { qdrant, COLLECTION, ChunkPayload } from '../lib/qdrant';

interface BenchmarkQuestion {
  id: string;
  subject: string;
  expectedChapter: number;
  keyConceptInChunk: string;
  question: string;
}

interface RetrievedPointInfo {
  rank: number;
  score: number;
  chapterNumber?: number;
  pageStart?: number;
  contentType?: string;
  excerpt: string;
}

interface EvalResult {
  questionId: string;
  question: string;
  expectedChapter: number;
  retrieved: RetrievedPointInfo[];
  hit: boolean;
  hitRank: number | null;
}

// Simple argument parser
function parseArgs() {
  const args: Record<string, string> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const nextVal = argv[i + 1];
      if (nextVal && !nextVal.startsWith('--')) {
        args[key] = nextVal;
        i++;
      }
    }
  }
  return args;
}

async function main() {
  const args = parseArgs();
  const mode = args.mode || 'pilot'; // default to pilot
  const subjectFilter = args.subject;

  const benchmarkFile = mode === 'full' ? 'benchmark-full.json' : 'benchmark-pilot.json';
  const benchmarkPath = path.resolve(__dirname, `../tests/retrieval/${benchmarkFile}`);

  if (!fs.existsSync(benchmarkPath)) {
    console.error(`Error: Benchmark file not found at "${benchmarkPath}"`);
    process.exit(1);
  }

  console.log(`Loading benchmark: ${benchmarkFile}...`);
  const benchmark = JSON.parse(fs.readFileSync(benchmarkPath, 'utf8'));
  let questions: BenchmarkQuestion[] = benchmark.questions;

  console.log(`Running evaluation...`);

  // Resolve target collection
  const aliasesResult = await qdrant.getAliases();
  const targetCollection = aliasesResult.aliases.find(a => a.alias_name === COLLECTION)?.collection_name;
  if (!targetCollection) {
    console.error(`Error: Alias "${COLLECTION}" not found. Ensure setup-qdrant.ts was run.`);
    process.exit(1);
  }

  // Scroll Qdrant to find which chapters actually have ingested chunks
  console.log('Scanning Qdrant to detect ingested chapters...');
  const scrollResult = await qdrant.scroll(targetCollection, {
    limit: 10000,
    with_payload: ['subject', 'chapterNumber']
  });

  const ingestedChapters = new Set<string>();
  for (const point of scrollResult.points) {
    const payload = point.payload as ChunkPayload | undefined;
    if (payload?.subject && payload?.chapterNumber) {
      ingestedChapters.add(`${payload.subject}-${payload.chapterNumber}`);
    }
  }

  console.log(`Ingested chapters detected in Qdrant:`, Array.from(ingestedChapters));

  if (subjectFilter) {
    questions = questions.filter((q) => q.subject === subjectFilter);
  }

  // Filter benchmark questions to only include ingested chapters
  questions = questions.filter((q) => ingestedChapters.has(`${q.subject}-${q.expectedChapter}`));

  if (questions.length === 0) {
    console.error('Error: No benchmark questions match the ingested chapters. Ingest some chapters first.');
    process.exit(1);
  }

  console.log(`Running evaluation on ${questions.length} queries matching ingested chapters...`);

  let totalQueries = 0;
  let hits = 0;
  let sumRR = 0;
  const chapterAccuracy: Record<string, { total: number; hits: number }> = {};
  const results: EvalResult[] = [];

  for (const q of questions) {
    totalQueries++;
    console.log(`[${totalQueries}/${questions.length}] evaluating: "${q.question}"`);

    // 1. Generate Query Embedding
    const embeddingResponse = await openai.embeddings.create({
      model: models.embedding,
      input: q.question,
    });
    const queryVector = embeddingResponse.data[0].embedding;

    // 2. Query Qdrant
    const searchResponse = await qdrant.query(targetCollection, {
      query: queryVector,
      filter: {
        must: [
          { key: 'subject', match: { value: q.subject } },
          // Note: In pilot/eval mode, we search both reviewed and unreviewed chunks 
          // to verify retrieval accuracy before marking them live.
        ]
      },
      limit: 3,
      with_payload: true,
    });

    const retrievedPoints = searchResponse.points;

    // 3. Match against expectations
    let firstHitRank = 0;
    let hitFound = false;

    for (let r = 0; r < retrievedPoints.length; r++) {
      const payload = retrievedPoints[r].payload as ChunkPayload | undefined;
      if (!payload) continue;

      const isCorrectChapter = payload.chapterNumber === q.expectedChapter;
      
      // Concept matching: check if all alphanumeric keywords are present (case-insensitive)
      const keywords = q.keyConceptInChunk
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(k => k.length >= 1);
      
      const conceptMatched = keywords.length > 0 && keywords.every(kw => 
        payload.text.toLowerCase().includes(kw)
      );

      if (isCorrectChapter && conceptMatched) {
        if (!hitFound) {
          firstHitRank = r + 1;
          hitFound = true;
        }
      }
    }

    if (hitFound) {
      hits++;
      sumRR += (1 / firstHitRank);
    }

    // Track chapter specific metrics
    const chapterKey = `${q.subject}-ch${q.expectedChapter}`;
    if (!chapterAccuracy[chapterKey]) {
      chapterAccuracy[chapterKey] = { total: 0, hits: 0 };
    }
    chapterAccuracy[chapterKey].total++;
    if (hitFound) {
      chapterAccuracy[chapterKey].hits++;
    }

    results.push({
      questionId: q.id,
      question: q.question,
      expectedChapter: q.expectedChapter,
      retrieved: retrievedPoints.map((p, idx) => {
        const payload = p.payload as ChunkPayload | undefined;
        return {
          rank: idx + 1,
          score: p.score,
          chapterNumber: payload?.chapterNumber,
          pageStart: payload?.pageStart,
          contentType: payload?.contentType,
          excerpt: payload?.text ? payload.text.slice(0, 150) + "..." : "..."
        };
      }),
      hit: hitFound,
      hitRank: firstHitRank || null,
    });
  }

  const accuracy = totalQueries > 0 ? (hits / totalQueries) : 0;
  const mrr = totalQueries > 0 ? (sumRR / totalQueries) : 0;
  const accuracyPercentage = (accuracy * 100).toFixed(1);

  // Identify weak chapters (accuracy < 85%)
  const weakChapters: string[] = [];
  for (const [key, metrics] of Object.entries(chapterAccuracy)) {
    const chAccuracy = metrics.hits / metrics.total;
    if (chAccuracy < 0.85) {
      weakChapters.push(`${key} (${(chAccuracy * 100).toFixed(1)}% accuracy)`);
    }
  }

  const evalReport = {
    evaluatedAt: new Date().toISOString(),
    mode,
    totalQueries,
    accuracy,
    mrr,
    chapterMetrics: chapterAccuracy,
    weakChapters,
    results,
  };

  const resultsPath = path.resolve(__dirname, '../tests/retrieval/latest-eval-results.json');
  fs.mkdirSync(path.dirname(resultsPath), { recursive: true });
  fs.writeFileSync(resultsPath, JSON.stringify(evalReport, null, 2));

  console.log('\n======================================');
  console.log(`Evaluation Results (${mode} mode)`);
  console.log(`Total queries: ${totalQueries}`);
  console.log(`Top-3 Accuracy (Hit Rate): ${accuracyPercentage}%`);
  console.log(`MRR (Mean Reciprocal Rank): ${mrr.toFixed(3)}`);
  console.log('======================================');
  
  if (weakChapters.length > 0) {
    console.warn('Weak chapters requiring optimization/re-chunking:');
    weakChapters.forEach(c => console.warn(`- ${c}`));
  } else {
    console.log('All chapters meet the 85% accuracy target!');
  }

  if (accuracy >= 0.85) {
    console.log('\n[PASS] Retrieval benchmark exit metric satisfied!');
    process.exit(0);
  } else {
    console.error('\n[FAIL] Top-3 accuracy is below the 85% exit gate metric.');
    process.exit(1);
  }
}

main();
