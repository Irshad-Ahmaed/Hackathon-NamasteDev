// Use pino -- NOT winston. Winston uses Node.js fs/stream internally in ways
// that conflict with Next.js webpack bundling and Edge runtimes.
import pino from 'pino';

export const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  // In development: pipe output to pino-pretty for readable logs
  // In production: pino emits newline-delimited JSON (works with Datadog, Loki, etc.)
});

// Standard request log shape -- log this on every /api/chat call
export type RequestLog = {
  requestId: string;
  userIdHash: string;         // sha256(userId) -- never raw ID
  route: string;
  subject: string;
  chapterId?: string;
  mode: string;
  statusCode: number;
  durationMs: number;
  retrievalTopScore?: number;
  retrievedChunkCount?: number;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
  outcome: 'success' | 'low_confidence' | 'blocked' | 'error';
};
