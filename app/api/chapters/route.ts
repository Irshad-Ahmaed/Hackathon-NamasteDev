import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rows = (await sql`
      SELECT subject, title
      FROM ingestion_sources 
      WHERE status IN ('live', 'verified')
    `) as unknown as Array<{ subject: string; title: string; chapter_number?: number | null }>;
    
    const chapters: Record<string, number[]> = {
      mathematics: [],
      science: []
    };

    for (const row of rows) {
      const subject = row.subject;
      if (!chapters[subject]) continue;

      let chapterNum: number | null = null;

      // Prefer an explicit chapter_number column if the DB has it
      if (row.chapter_number != null && !isNaN(row.chapter_number)) {
        chapterNum = row.chapter_number;
      } else {
        // Fall back: extract chapter number from filename title e.g. "jemh101" → 1, "jesc109" → 9
        // NCERT filenames end with a 3-digit code: first digit = volume, last 2 = chapter
        const match = row.title.replace('.pdf', '').match(/(\d{2})$/);
        if (match) {
          chapterNum = parseInt(match[1], 10);
        }
      }

      if (chapterNum != null && !isNaN(chapterNum) && !chapters[subject].includes(chapterNum)) {
        chapters[subject].push(chapterNum);
      }
    }

    // Sort chapters numerically
    chapters.mathematics.sort((a, b) => a - b);
    chapters.science.sort((a, b) => a - b);

    return NextResponse.json(chapters);
  } catch (error) {
    console.error('Failed to fetch available chapters:', error);
    return NextResponse.json({ error: 'Failed to fetch chapters' }, { status: 500 });
  }
}
