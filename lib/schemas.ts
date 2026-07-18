import { z } from 'zod';

export const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1, 'Message cannot be empty').max(2000, 'Message is too long'),
});

export const ChatRequestSchema = z.object({
  messages: z.array(ChatMessageSchema).min(1, 'At least one message is required'),
  // We can add optional thread/conversation ID for continuation
  conversationId: z.string().uuid().optional(),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

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
