import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db';
import { qdrant, COLLECTION } from '@/lib/qdrant';
import { models, createChatCompletion } from '@/lib/openai';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // 1. Authenticate user session
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Resolve internal User UUID
    const user = (await sql`
      SELECT id FROM users WHERE clerk_id = ${clerkId} AND deletion_requested_at IS NULL
    `) as unknown as Array<{ id: string }>;

    if (user.length === 0) {
      return NextResponse.json({ error: 'User not found or account pending deletion' }, { status: 404 });
    }

    // 2. Parse & validate query params
    const { searchParams } = new URL(req.url);
    const subject = searchParams.get('subject');
    const chapterStr = searchParams.get('chapter');
    const language = searchParams.get('language') || 'en';

    if (!subject || !chapterStr) {
      return NextResponse.json({ error: 'Missing subject or chapter parameter' }, { status: 400 });
    }

    if (subject !== 'mathematics' && subject !== 'science') {
      return NextResponse.json({ error: 'Invalid subject parameter' }, { status: 400 });
    }

    const chapterNumber = parseInt(chapterStr, 10);
    if (isNaN(chapterNumber)) {
      return NextResponse.json({ error: 'Invalid chapter parameter' }, { status: 400 });
    }

    if (language !== 'en' && language !== 'hi') {
      return NextResponse.json({ error: 'Invalid language parameter' }, { status: 400 });
    }

    // 3. Query notes table for all matching statuses in a single query
    const notesList = (await sql`
      SELECT content, chapter_title, generated_at, status
      FROM notes
      WHERE subject = ${subject}
        AND chapter_number = ${chapterNumber}
        AND language = ${language}
        AND status IN ('live', 'reviewed', 'draft')
    `) as unknown as Array<{ content: string; chapter_title: string; generated_at: string; status: string }>;

    if (notesList.length > 0) {
      // Prioritize: 'live' > 'reviewed' > 'draft'
      const statusPriority: Record<string, number> = { live: 3, reviewed: 2, draft: 1 };
      notesList.sort((a, b) => (statusPriority[b.status] || 0) - (statusPriority[a.status] || 0));

      return NextResponse.json({
        chapterTitle: notesList[0].chapter_title,
        content: notesList[0].content,
        generatedAt: notesList[0].generated_at,
        subject,
        chapterNumber
      });
    }

    // 5. Generate notes on-demand if not found in database
    console.log(`Notes not found for ${subject} chapter ${chapterNumber}. Generating on-demand...`);

    const scrollResult = await qdrant.scroll(COLLECTION, {
      filter: {
        must: [
          { key: 'subject', match: { value: subject } },
          { key: 'chapterNumber', match: { value: chapterNumber } },
          { key: 'reviewed', match: { value: true } },
          { key: 'language', match: { value: language } }
        ]
      },
      limit: 1000
    });

    const points = scrollResult.points;
    if (!points || points.length === 0) {
      return NextResponse.json({ error: 'No reviewed source content found for notes generation.' }, { status: 404 });
    }

    // Sort chunks to align text in order
    points.sort((a, b) => {
      const idxA = (a.payload?.chunkIndex as number) ?? 0;
      const idxB = (b.payload?.chunkIndex as number) ?? 0;
      return idxA - idxB;
    });

    const chapterTitle = (points[0]?.payload?.chapterTitle as string) || `Chapter ${chapterNumber}`;
    const chapterText = points.map(p => p.payload?.text || '').join('\n\n');

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
      return NextResponse.json({ error: 'Failed to generate notes content.' }, { status: 500 });
    }

    // Cache the note in the database as 'draft'
    await sql`
      INSERT INTO notes (subject, chapter_number, chapter_title, language, content, prompt_version, status)
      VALUES (${subject}, ${chapterNumber}, ${chapterTitle}, ${language}, ${content}, 'v1', 'draft')
      ON CONFLICT (subject, chapter_number, language, status) 
      DO UPDATE SET 
        content = EXCLUDED.content,
        chapter_title = EXCLUDED.chapter_title,
        prompt_version = EXCLUDED.prompt_version,
        generated_at = now()
    `;

    return NextResponse.json({
      chapterTitle,
      content,
      generatedAt: new Date().toISOString(),
      subject,
      chapterNumber
    });

  } catch (error) {
    console.error('[GET /api/notes] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
