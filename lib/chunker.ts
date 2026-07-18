export type TextChunk = {
  text: string;
  chunkIndex: number;
  pageStart: number;
  pageEnd: number;
  sectionTitle: string | null;
  contentType: 'text' | 'equation' | 'definition' | 'example';
};

const TARGET_CHUNK_TOKENS = 500;     // aim for middle of 400–700 range
const OVERLAP_TOKENS = 100;          // aim for middle of 80–120 range
const CHARS_PER_TOKEN = 4;           // rough approximation for English text

const TARGET_CHUNK_CHARS = TARGET_CHUNK_TOKENS * CHARS_PER_TOKEN;
const OVERLAP_CHARS = OVERLAP_TOKENS * CHARS_PER_TOKEN;
const MIN_CHUNK_CHARS = 100 * CHARS_PER_TOKEN;
const MAX_CHUNK_CHARS = 800 * CHARS_PER_TOKEN;

export function chunkChapter(
  pages: Array<{ pageNumber: number; text: string }>
): TextChunk[] {
  const chunks: TextChunk[] = [];
  let chunkIndex = 0;

  // Process pages and aggregate text with page markers
  // We want to keep track of page numbers for each character
  type CharInfo = { char: string; page: number };
  const chars: CharInfo[] = [];

  for (const page of pages) {
    const pageText = page.text;
    for (let i = 0; i < pageText.length; i++) {
      chars.push({ char: pageText[i], page: page.pageNumber });
    }
    // Add space and page boundary indicator
    chars.push({ char: ' ', page: page.pageNumber });
  }

  // Helper to extract text and pages from character slice
  const getSliceData = (start: number, end: number): { text: string; pageStart: number; pageEnd: number } => {
    const sliceChars = chars.slice(start, end);
    const text = sliceChars.map(c => c.char).join('').trim();
    const pageStart = sliceChars[0]?.page ?? 1;
    const pageEnd = sliceChars[sliceChars.length - 1]?.page ?? pageStart;
    return { text, pageStart, pageEnd };
  };

  let cursor = 0;
  const totalLength = chars.length;

  while (cursor < totalLength) {
    // Determine end of chunk
    let end = Math.min(cursor + TARGET_CHUNK_CHARS, totalLength);

    // Try to align end to sentence boundary (. or ? or ! followed by space)
    if (end < totalLength) {
      let boundaryFound = false;
      for (let i = end; i > Math.max(cursor + MIN_CHUNK_CHARS, end - 200); i--) {
        const c = chars[i]?.char;
        const nextC = chars[i + 1]?.char;
        if ((c === '.' || c === '?' || c === '!') && (nextC === ' ' || nextC === '\n' || nextC === undefined)) {
          end = i + 1;
          boundaryFound = true;
          break;
        }
      }
      // If no boundary found nearby, force split at space if possible
      if (!boundaryFound) {
        for (let i = end; i > Math.max(cursor + MIN_CHUNK_CHARS, end - 100); i--) {
          if (chars[i]?.char === ' ') {
            end = i;
            break;
          }
        }
      }
    }

    const { text, pageStart, pageEnd } = getSliceData(cursor, end);

    if (text.length > 0) {
      // Determine content type
      let contentType: TextChunk['contentType'] = 'text';
      const cleanLower = text.toLowerCase();
      
      if (text.includes('$') || text.includes('\\(') || text.includes('\\[') || text.includes('\\begin{')) {
        contentType = 'equation';
      } else if (cleanLower.startsWith('definition:') || cleanLower.includes('defined as') || cleanLower.includes('is called')) {
        contentType = 'definition';
      } else if (cleanLower.startsWith('example') || cleanLower.startsWith('solved example') || cleanLower.startsWith('q.')) {
        contentType = 'example';
      }

      // Find section title by scanning for headers in the chunk
      let sectionTitle: string | null = null;
      const headerMatch = text.match(/(?:^|\n)(?:(?:[1-9]\d*(?:\.\d+)*\s+[A-Z][a-zA-Z\s]+)|(?:##\s+[^\n]+))/);
      if (headerMatch) {
        sectionTitle = headerMatch[0].replace('##', '').trim();
      }

      chunks.push({
        text,
        chunkIndex: chunkIndex++,
        pageStart,
        pageEnd,
        sectionTitle,
        contentType
      });
    }

    // Move cursor with overlap
    cursor = Math.max(cursor + 1, end - OVERLAP_CHARS);
  }

  // Post-processing: merge tiny trailing chunks (< MIN_CHUNK_CHARS) with the previous chunk if possible
  if (chunks.length > 1) {
    const lastChunk = chunks[chunks.length - 1];
    if (lastChunk.text.length < MIN_CHUNK_CHARS) {
      const prevChunk = chunks[chunks.length - 2];
      const combinedText = prevChunk.text + " " + lastChunk.text;
      if (combinedText.length <= MAX_CHUNK_CHARS) {
        prevChunk.text = combinedText;
        prevChunk.pageEnd = lastChunk.pageEnd;
        chunks.pop(); // Remove the last chunk
      }
    }
  }

  return chunks;
}
