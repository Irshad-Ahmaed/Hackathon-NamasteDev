import { z } from 'zod';

export const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1, 'Message cannot be empty').max(2000, 'Message is too long'),
});

export const ChatRequestSchema = z.object({
  message: z.string().min(1, 'Question cannot be empty').max(2000, 'Question is too long'),
  subject: z.enum(['mathematics', 'science']),
  language: z.enum(['en', 'hi']),
  conversationId: z.string().uuid().optional(),
  chapterId: z.string().optional(),
  mode: z.enum(['explain', 'solve', 'notes', 'quiz', 'general']),
  // When present in notes mode, the chat stream persists a revision to this
  // private document and emits a `note_document_saved` event before closing.
  noteDocumentId: z.string().uuid().optional(),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

// MVP content-size limits (mirrored in the notes generation service).
export const NOTE_DOCUMENT_CHAR_LIMIT = 24000;
export const NOTE_INSTRUCTION_CHAR_LIMIT = 1000;

// --- Note document API contracts -------------------------------------------

export const CreateNoteDocumentSchema = z.object({
  subject: z.enum(['mathematics', 'science']),
  chapterNumber: z.number().int().positive(),
  language: z.enum(['en', 'hi']).default('en'),
});
export type CreateNoteDocumentRequest = z.infer<typeof CreateNoteDocumentSchema>;

export const SaveNoteDocumentSchema = z.object({
  content: z.string().max(NOTE_DOCUMENT_CHAR_LIMIT, 'Document is too large'),
  expectedRevision: z.number().int().positive(),
});
export type SaveNoteDocumentRequest = z.infer<typeof SaveNoteDocumentSchema>;

export const NoteCommandSchema = z.object({
  instruction: z.string().min(1, 'Instruction cannot be empty').max(NOTE_INSTRUCTION_CHAR_LIMIT, 'Instruction is too long'),
  expectedRevision: z.number().int().positive(),
});
export type NoteCommandRequest = z.infer<typeof NoteCommandSchema>;

export function detectPromptInjection(message: string): boolean {
  const injectionPatterns = [
    /ignore.*instructions/i,
    /you are now/i,
    /system:/i,
    /\[INST\]/i,
    /api_key/i,
    /api key/i,
    /context window/i,
    /disregard/i,
    /system prompt/i,
  ];
  return injectionPatterns.some(p => p.test(message));
}

// P1-012 Stream-Friendly Citation Contract
export interface CitationMetadata {
  pointId: string;
  sourceUrl: string;
  chapterTitle: string;
  pages: number[];
  relevanceScore: number;
}

export interface StreamInitEvent {
  type: 'init';
  conversationId: string;
  citations: CitationMetadata[];
  outcome: 'success' | 'refusal';
  assistantMessageId?: string;
}

export interface StreamTokenEvent {
  type: 'token';
  content: string;
}

export interface StreamErrorEvent {
  type: 'error';
  message: string;
  code: string;
}

// Emitted exactly once, immediately before a successful notes stream closes,
// after the server has atomically persisted the new document revision.
// `done` (transport-level) does NOT imply persistence; only this event does.
export interface NoteDocumentSavedEvent {
  type: 'note_document_saved';
  documentId: string;
  revision: number;
  operation: 'generate' | 'regenerate' | 'command';
  citations: CitationMetadata[];
}

export type StreamEvent =
  | StreamInitEvent
  | StreamTokenEvent
  | StreamErrorEvent
  | NoteDocumentSavedEvent;
