import 'server-only';
import { qdrant, COLLECTION } from '../qdrant';
import { models, createStreamingChatCompletion } from '../openai';
import { CitationMetadata } from '../schemas';
import {
  buildNotesGenerationPrompt,
  buildNotesEditPrompt,
} from '../rag/prompt';

// MVP limits (also enforced at the API boundary).
export const NOTE_DOCUMENT_CHAR_LIMIT = 24000;
export const NOTE_INSTRUCTION_CHAR_LIMIT = 1000;

export type NoteSubject = 'mathematics' | 'science';
export type NoteLanguage = 'en' | 'hi';

export interface ApprovedChapterContext {
  chapterTitle: string;
  chapterText: string;
  citations: CitationMetadata[];
  chunkCount: number;
}

/**
 * Fetch approved (reviewed) NCERT chunks for a chapter from Qdrant and assemble
 * ordered source text plus citation metadata. Server-only; the browser must not
 * call this path directly.
 */
export async function getApprovedChapterContext(
  subject: NoteSubject,
  chapterNumber: number,
  language: NoteLanguage
): Promise<ApprovedChapterContext | null> {
  const scrollResult = await qdrant.scroll(COLLECTION, {
    filter: {
      must: [
        { key: 'subject', match: { value: subject } },
        { key: 'chapterNumber', match: { value: chapterNumber } },
        { key: 'reviewed', match: { value: true } },
        { key: 'language', match: { value: language } },
      ],
    },
    limit: 1000,
    with_payload: true,
  });

  const points = scrollResult.points;
  if (!points || points.length === 0) return null;

  points.sort((a, b) => {
    const idxA = (a.payload?.chunkIndex as number) ?? 0;
    const idxB = (b.payload?.chunkIndex as number) ?? 0;
    return idxA - idxB;
  });

  const chapterTitle = (points[0]?.payload?.chapterTitle as string) || `Chapter ${chapterNumber}`;
  const chapterText = points.map(p => (p.payload?.text as string) || '').join('\n\n');

  // Build a small set of representative citations (first few ordered chunks).
  const citations: CitationMetadata[] = points.slice(0, 5).map((p) => {
    const meta = (p.payload as Record<string, unknown>) || {};
    return {
      pointId: String(meta.pointId || p.id || ''),
      sourceUrl: String(meta.sourceUrl || meta.officialSourceUrl || ''),
      chapterTitle: String(meta.chapterTitle || chapterTitle),
      pages: Array.isArray(meta.pages) ? (meta.pages as number[]) : [],
      relevanceScore: 1,
    };
  });

  return { chapterTitle, chapterText, citations, chunkCount: points.length };
}

/**
 * Streaming generation for the notes canvas. Yields text deltas and returns
 * the citations used. The caller is responsible for persistence.
 */
export async function streamNotesGeneration(
  subject: NoteSubject,
  chapterNumber: number,
  chapterTitle: string,
  chapterText: string
) {
  return createStreamingChatCompletion({
    model: models.chat,
    messages: buildNotesGenerationPrompt(subject, chapterNumber, chapterTitle, chapterText),
    stream: true,
    stream_options: { include_usage: true },
  });
}

// --- Command grounding classification --------------------------------------

export type CommandClass = 'transform' | 'knowledge';

const KNOWLEDGE_INTENT = [
  /\badd\b/i,
  /\bexample/i,
  /\bdefine|definition/i,
  /\bderive|derivation/i,
  /\bfact/i,
  /\bexplain/i,
  /\bexam question|quiz|mcq/i,
  /\belaborate|expand/i,
  /\bmore (detail|info)/i,
];

/**
 * Classify an instruction as a transform (formatting/reorder/shorten/remove) or
 * a knowledge command (adds new factual content, requires NCERT retrieval).
 * Note: this classifies the *instruction's intent* to decide retrieval; it is
 * NOT the chat routing decision (which is driven by Generate Notes mode).
 */
export function classifyCommand(instruction: string): CommandClass {
  return KNOWLEDGE_INTENT.some(rx => rx.test(instruction)) ? 'knowledge' : 'transform';
}

export interface StreamEditParams {
  documentContent: string;
  instruction: string;
  subject: NoteSubject;
  chapterNumber: number;
  language: NoteLanguage;
}

export interface StreamEditResult {
  stream: Awaited<ReturnType<typeof createStreamingChatCompletion>>;
  commandClass: CommandClass;
  citations: CitationMetadata[];
}

/**
 * Prepare a streamed AI edit of a document. Knowledge commands retrieve approved
 * NCERT context and require the model to cite; transform commands work from the
 * stored document alone without retrieval.
 */
export async function streamNotesEdit(params: StreamEditParams): Promise<StreamEditResult> {
  const { documentContent, instruction, subject, chapterNumber, language } = params;
  const commandClass = classifyCommand(instruction);

  let contextText = '';
  let citations: CitationMetadata[] = [];

  if (commandClass === 'knowledge') {
    const ctx = await getApprovedChapterContext(subject, chapterNumber, language);
    if (ctx) {
      contextText = ctx.chapterText;
      citations = ctx.citations;
    }
  }

  const stream = await createStreamingChatCompletion({
    model: models.chat,
    messages: buildNotesEditPrompt(documentContent, instruction, commandClass, contextText),
    stream: true,
    stream_options: { include_usage: true },
    temperature: 0.2,
  });

  return { stream, commandClass, citations };
}
