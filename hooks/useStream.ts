'use client';
import { useState, useCallback, useRef } from 'react';

export type StreamEvent =
  | { type: 'init'; conversationId: string; citations: unknown[]; outcome: string; assistantMessageId?: string }
  | { type: 'token'; content: string }
  | { type: 'error'; code: string; message: string }
  | { type: 'done' };

// Low-level hook: reads SSE from a POST endpoint.
// Uses fetch() + ReadableStream -- NOT EventSource (EventSource only supports GET).
export function useStream() {
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const readStream = useCallback(async (
    url: string,
    body: object,
    onEvent: (event: StreamEvent) => void
  ) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming(true);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        onEvent({ type: 'error', code: String(res.status), message: err.error || err.message || 'Unknown error' });
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') break;
          try { onEvent(JSON.parse(raw) as StreamEvent); } catch { /* skip malformed */ }
        }
      }
      setStreaming(false);
      onEvent({ type: 'done' });
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        onEvent({ type: 'error', code: 'NETWORK_ERROR', message: 'Connection lost. Please try again.' });
      } else if (!(err instanceof Error)) {
        onEvent({ type: 'error', code: 'UNKNOWN_ERROR', message: 'An unknown error occurred.' });
      }
    } finally {
      setStreaming(false);
    }
  }, []);

  const cancel = useCallback(() => abortRef.current?.abort(), []);
  return { readStream, streaming, cancel };
}
