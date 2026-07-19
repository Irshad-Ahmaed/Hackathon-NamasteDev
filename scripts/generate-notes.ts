#!/usr/bin/env tsx
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

import { sql } from '../lib/db';
import { qdrant, COLLECTION } from '../lib/qdrant';
import { models, createChatCompletion } from '../lib/openai';

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

async function getChaptersToProcess(): Promise<{ subject: 'mathematics' | 'science'; chapterNumber: number }[]> {
  // Query all ingestion sources that are verified or live to find available chapters
  const rows = (await sql`
    SELECT subject, title
    FROM ingestion_sources 
    WHERE status IN ('live', 'verified')
  `) as unknown as Array<{ subject: string; title: string }>;

  const chapters: { subject: 'mathematics' | 'science'; chapterNumber: number }[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (row.subject !== 'mathematics' && row.subject !== 'science') continue;
    
    // Extract chapter number from filename title e.g. "jemh101" -> 1
    const match = row.title.replace('.pdf', '').match(/(\d{2})$/);
    if (match) {
      const chapterNumber = parseInt(match[1], 10);
      if (!isNaN(chapterNumber)) {
        const key = `${row.subject}-${chapterNumber}`;
        if (!seen.has(key)) {
          seen.add(key);
          chapters.push({ subject: row.subject as 'mathematics' | 'science', chapterNumber });
        }
      }
    }
  }

  return chapters;
}

async function generateNotesForChapter(subject: 'mathematics' | 'science', chapterNumber: number, isLive: boolean) {
  console.log(`\nProcessing Chapter: ${subject} chapter ${chapterNumber}...`);

  // 1. Retrieve all reviewed chunks for that chapter from Qdrant
  const scrollResult = await qdrant.scroll(COLLECTION, {
    filter: {
      must: [
        { key: 'subject', match: { value: subject } },
        { key: 'chapterNumber', match: { value: chapterNumber } },
        { key: 'reviewed', match: { value: true } },
        { key: 'language', match: { value: 'en' } }
      ]
    },
    limit: 1000
  });

  const points = scrollResult.points;
  if (!points || points.length === 0) {
    console.warn(`[Warning] No reviewed chunks found for ${subject} chapter ${chapterNumber}. Skipping notes generation.`);
    return;
  }

  console.log(`Found ${points.length} reviewed chunks. Ordering and compiling outline...`);

  // 2. Sort by chunkIndex to ensure textbook order
  points.sort((a, b) => {
    const idxA = (a.payload?.chunkIndex as number) ?? 0;
    const idxB = (b.payload?.chunkIndex as number) ?? 0;
    return idxA - idxB;
  });

  const chapterTitle = (points[0]?.payload?.chapterTitle as string) || `Chapter ${chapterNumber}`;
  const chapterText = points.map(p => p.payload?.text || '').join('\n\n');

  console.log(`Generating study notes with ${models.chat}...`);

  // 3. Call OpenAI non-streaming chat completion with structured notes-generation prompt
  const notesPrompt = `Create structured study notes for NCERT Class 10 ${subject} Chapter ${chapterNumber}: ${chapterTitle}.
Include: key definitions, formulas (LaTeX), important concepts, worked examples summary.
Format as markdown. Maximum 1200 words.`;

  const completion = await createChatCompletion({
    model: models.chat,
    messages: [
      { role: 'system', content: 'You are StudyNotes+, an expert CBSE Class 10 AI Tutor for Math and Science.' },
      { role: 'user', content: `Here is the source textbook text:\n\n${chapterText}\n\nTask:\n${notesPrompt}` }
    ],
    temperature: 0.3
  });

  const content = completion.choices[0]?.message?.content || '';
  if (!content) {
    throw new Error('LLM response returned empty content');
  }

  const status = isLive ? 'live' : 'draft';
  const promptVersion = 'v1';

  // 4. Upsert notes into database
  console.log(`Saving notes to DB as status: '${status}'...`);
  await sql`
    INSERT INTO notes (subject, chapter_number, chapter_title, language, content, prompt_version, status)
    VALUES (${subject}, ${chapterNumber}, ${chapterTitle}, 'en', ${content}, ${promptVersion}, ${status})
    ON CONFLICT (subject, chapter_number, language, status) 
    DO UPDATE SET 
      content = EXCLUDED.content,
      chapter_title = EXCLUDED.chapter_title,
      prompt_version = EXCLUDED.prompt_version,
      generated_at = now()
  `;

  console.log(`Successfully completed notes generation for ${subject} chapter ${chapterNumber}.`);
}

async function main() {
  const args = parseArgs();
  const subject = args.subject as 'mathematics' | 'science' | undefined;
  const chapterStr = args.chapter as string | undefined;
  const processAll = !!args.all;
  const isLive = !!args.live;

  if (!processAll && (!subject || !chapterStr)) {
    console.error('Usage:');
    console.error('  npx tsx scripts/generate-notes.ts --subject [mathematics|science] --chapter [number] [--live]');
    console.error('  npx tsx scripts/generate-notes.ts --all [--live]');
    process.exit(1);
  }

  try {
    if (processAll) {
      console.log('Fetching all verification-eligible chapters...');
      const chapters = await getChaptersToProcess();
      console.log(`Found ${chapters.length} chapters to process.`);
      
      for (const ch of chapters) {
        await generateNotesForChapter(ch.subject, ch.chapterNumber, isLive);
      }
    } else {
      if (subject !== 'mathematics' && subject !== 'science') {
        console.error('Error: Subject must be "mathematics" or "science".');
        process.exit(1);
      }
      const chapterNumber = parseInt(chapterStr!, 10);
      if (isNaN(chapterNumber)) {
        console.error('Error: Chapter must be a valid integer.');
        process.exit(1);
      }
      await generateNotesForChapter(subject, chapterNumber, isLive);
    }
    console.log('\nNotes generation process finished successfully.');
  } catch (error) {
    console.error('\nOperation failed with error:', error);
    process.exit(1);
  }
}

main();
