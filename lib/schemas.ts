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
  mode: z.enum(['explain', 'solve', 'notes', 'quiz']),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

// Explicitly reject anything that looks like a system prompt injection.
export function detectPromptInjection(message: string): boolean {
  const injectionPatterns = [
    /ignore previous instructions/i,
    /you are now/i,
    /system:/i,
    /\[INST\]/i,
    /OPENAI_API_KEY/i,
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

export type StreamEvent = StreamInitEvent | StreamTokenEvent | StreamErrorEvent;
