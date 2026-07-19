'use client';
import { useState, useCallback } from 'react';
import { useStream } from './useStream';
import type { CitationMetadata as Citation } from '@/lib/schemas';

export type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  outcome?: string;
  streaming?: boolean;
  feedbackType?: 'helpful' | 'incorrect' | 'inappropriate';
};

export function useChat(subject: string, language: 'en' | 'hi', chapterId?: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const { readStream, streaming, cancel } = useStream();



  const sendMessage = useCallback(async (
    text: string,
    options: {
      mode: string;
      noteDocumentId?: string;
      onNoteDocumentSaved?: (evt: { documentId: string; revision: number; operation: 'generate' | 'regenerate' | 'command'; citations: Citation[] }) => void;
    }
  ) => {
    if (!text.trim() || streaming) return; // no-op if already streaming

    // Safe UUID generation fallback for SSR/non-secure contexts
    const generateId = () => {
      return typeof window !== 'undefined' && window.crypto?.randomUUID 
        ? window.crypto.randomUUID() 
        : Math.random().toString(36).substring(2) + Date.now().toString(36);
    };

    const userMsg: Message = { id: generateId(), role: 'user', content: text };
    const assistantId = generateId();
    setMessages(prev => [
      ...prev,
      userMsg,
      { id: assistantId, role: 'assistant', content: '', streaming: true },
    ]);

    let accumulated = '';
    let activeId = assistantId;
    await readStream('/api/chat', {
      message: text, subject, language, conversationId,
      chapterId, mode: options.mode, noteDocumentId: options.noteDocumentId,
    }, (event) => {
      if (event.type === 'init') {
        setConversationId(event.conversationId);
        if (event.assistantMessageId) {
          activeId = event.assistantMessageId;
        }
        setMessages(prev => prev.map(m =>
          (m.id === assistantId || m.id === activeId)
            ? { ...m, id: activeId, citations: event.citations as Citation[], outcome: event.outcome }
            : m
        ));
      } else if (event.type === 'token') {
        accumulated += event.content;
        setMessages(prev => prev.map(m =>
          m.id === activeId ? { ...m, content: accumulated } : m
        ));
      } else if (event.type === 'note_document_saved') {
        // Persistence signal: only now is the document revision authoritative.
        options.onNoteDocumentSaved?.({
          documentId: event.documentId,
          revision: event.revision,
          operation: event.operation,
          citations: (event.citations as Citation[]) ?? [],
        });
      } else if (event.type === 'error') {
        setMessages(prev => prev.map(m =>
          m.id === activeId ? { ...m, content: event.message, streaming: false } : m
        ));
      } else if (event.type === 'done') {
        // Transport-level completion only; not a persistence signal.
        setMessages(prev => prev.map(m =>
          m.id === activeId ? { ...m, streaming: false } : m
        ));
      }
    });
  }, [subject, language, conversationId, chapterId, streaming, readStream]);

  return { messages, sendMessage, streaming, cancel, conversationId, setConversationId, setMessages };
}
