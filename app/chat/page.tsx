'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Streamdown } from 'streamdown';
import { createMathPlugin } from '@streamdown/math';
import 'katex/dist/katex.min.css';

import { useChat } from '@/hooks/useChat';
import type { Message } from '@/hooks/useChat';
import { useSubjectFilter, Subject, Mode } from '@/hooks/useSubjectFilter';
import type { CitationMetadata as Citation } from '@/lib/schemas';
import { NotesCanvas } from '@/components/NotesCanvas';
import { ChatPanel } from '@/components/ChatPanel';
import type { ConversationItem } from '@/components/ChatPanel';

const mathPlugin = createMathPlugin({ singleDollarTextMath: true });

type FeedbackType = 'helpful' | 'incorrect' | 'inappropriate';

// Message component wrapped in React.memo to prevent re-rendering historical messages
const ChatMessage = React.memo(({ message, onFeedback, feedbackStatus }: {
  message: Message;
  onFeedback?: (messageId: string, type: FeedbackType) => void;
  feedbackStatus?: string;
}) => {
  const activeFeedback = message.feedbackType;
  const statusLabel = feedbackStatus || (activeFeedback ? (
    activeFeedback === 'helpful' ? '✓ Helpful' : activeFeedback === 'incorrect' ? '✓ Marked incorrect' : '✓ Reported'
  ) : '');

  return (
    <div className={`p-4 my-2 rounded-xl ${message.role === 'user' ? 'bg-primary text-primary-foreground ml-auto max-w-[80%]' : 'bg-muted/70 text-foreground mr-auto max-w-[100%] border border-white/5 backdrop-blur-md shadow-sm'}`}>
      <div className="font-semibold text-sm mb-1 opacity-70">
        {message.role === 'user' ? 'You' : 'Tutor'}
      </div>
      <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none">
        {message.streaming && !message.content ? (
          <div className="animate-pulse flex space-x-2 items-center text-muted-foreground italic">
            <span>Tutor is thinking...</span>
          </div>
        ) : (
          <Streamdown plugins={{ math: mathPlugin }}>{message.content}</Streamdown>
        )}
      </div>
      {message.citations && message.citations.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border flex flex-wrap gap-2">
          {message.citations.map((cit: Citation, i: number) => (
            <a
              key={i}
              href={cit.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs bg-secondary hover:bg-secondary/80 text-secondary-foreground py-1 px-2 rounded transition-colors"
            >
              {cit.chapterTitle} (Pg {cit.pages?.[0] || '?'})
            </a>
          ))}
        </div>
      )}
      {message.role === 'assistant' && !message.streaming && onFeedback && (
        <div className="mt-3 pt-2 border-t border-border/50 flex flex-wrap items-center gap-4 text-xs">
          {/* Helpful button — turns solid blue when active */}
          <button
            onClick={() => onFeedback(message.id, 'helpful')}
            title="Helpful"
            disabled={!!activeFeedback}
            className={`transition-all duration-200 font-medium flex items-center cursor-pointer text-lg ${
              activeFeedback === 'helpful'
                ? 'opacity-100 drop-shadow-[0_0_6px_rgba(59,130,246,0.8)] scale-110'
                : activeFeedback
                ? 'opacity-25 cursor-default'
                : 'opacity-60 hover:opacity-100 hover:drop-shadow-[0_0_6px_rgba(59,130,246,0.6)] hover:scale-110'
            }`}
          >
            👍
          </button>
          {/* Incorrect button — turns solid amber when active */}
          <button
            onClick={() => onFeedback(message.id, 'incorrect')}
            title="This is incorrect"
            disabled={!!activeFeedback}
            className={`transition-all duration-200 font-medium flex items-center cursor-pointer text-lg ${
              activeFeedback === 'incorrect'
                ? 'opacity-100 drop-shadow-[0_0_6px_rgba(245,158,11,0.8)] scale-110'
                : activeFeedback
                ? 'opacity-25 cursor-default'
                : 'opacity-60 hover:opacity-100 hover:drop-shadow-[0_0_6px_rgba(245,158,11,0.6)] hover:scale-110'
            }`}
          >
            👎
          </button>
          {/* Report button — turns solid red when active */}
          <button
            onClick={() => onFeedback(message.id, 'inappropriate')}
            title="Report answer"
            disabled={!!activeFeedback}
            className={`transition-all duration-200 font-medium flex items-center cursor-pointer text-lg ${
              activeFeedback === 'inappropriate'
                ? 'opacity-100 drop-shadow-[0_0_6px_rgba(239,68,68,0.8)] scale-110'
                : activeFeedback
                ? 'opacity-25 cursor-default'
                : 'opacity-60 hover:opacity-100 hover:drop-shadow-[0_0_6px_rgba(239,68,68,0.6)] hover:scale-110'
            }`}
          >
            🚩
          </button>
          {statusLabel && (
            <span className={`font-normal italic ml-auto ${
              activeFeedback ? 'text-green-400' : 'text-slate-400'
            }`}>{statusLabel}</span>
          )}
        </div>
      )}
    </div>
  );
});
ChatMessage.displayName = 'ChatMessage';

const CHAPTER_NAMES: Record<Subject, Record<number, string>> = {
  mathematics: {
    1: 'Ch 1: Real Numbers',
    2: 'Ch 2: Polynomials',
    3: 'Ch 3: Linear Equations',
    4: 'Ch 4: Quadratic Equations',
    5: 'Ch 5: Arithmetic Progressions',
    6: 'Ch 6: Triangles',
    7: 'Ch 7: Coordinate Geometry',
    8: 'Ch 8: Introduction to Trigonometry',
    9: 'Ch 9: Some Applications of Trigonometry',
    10: 'Ch 10: Circles',
    11: 'Ch 11: Areas Related to Circles',
    12: 'Ch 12: Surface Areas and Volumes',
    13: 'Ch 13: Statistics',
    14: 'Ch 14: Probability'
  },
  science: {
    1: 'Ch 1: Chemical Reactions',
    2: 'Ch 2: Acids, Bases, Salts',
    3: 'Ch 3: Metals & Non-Metals',
    4: 'Ch 4: Carbon Compounds',
    5: 'Ch 5: Life Processes',
    6: 'Ch 6: Control & Coordination',
    7: 'Ch 7: How do Organisms Reproduce?',
    8: 'Ch 8: Heredity',
    9: 'Ch 9: Light - Reflection & Refraction',
    10: 'Ch 10: Human Eye and Colourful World',
    11: 'Ch 11: Electricity',
    12: 'Ch 12: Magnetic Effects of Electric Current',
    13: 'Ch 13: Our Environment'
  }
};

export default function ChatPage() {
  const { subject, setSubject, chapterId, setChapterId, mode, setMode } = useSubjectFilter();
  const { 
    messages, 
    sendMessage, 
    streaming, 
    cancel, 
    conversationId, 
    setConversationId, 
    setMessages 
  } = useChat(subject, 'en', chapterId);
  const [inputText, setInputText] = useState('');
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState<Record<string, string>>({});
  const [availableChapters, setAvailableChapters] = useState<{ mathematics: number[], science: number[] }>({ mathematics: [], science: [] });

  // --- Interactive notes document state (owned by the page) ---
  const [noteDoc, setNoteDoc] = useState<{ documentId: string; revision: number } | null>(null);
  const [noteContent, setNoteContent] = useState('');
  const [noteSaveState, setNoteSaveState] = useState<'idle' | 'saving' | 'saved' | 'conflict'>('idle');
  const [isAiEditing, setIsAiEditing] = useState(false);

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const chatViewportRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    Promise.resolve().then(() => {
      setIsSidebarOpen(window.innerWidth >= 768);
    });
  }, []);

  // Reset the active notes document when the subject or chapter changes so one
  // chapter's document never bleeds into another.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNoteDoc(null);
    setNoteContent('');
    setNoteSaveState('idle');
  }, [subject, chapterId]);

  // Parental consent states
  const [consentState, setConsentState] = useState<'pending' | 'given' | 'loading'>('loading');
  const [parentEmail, setParentEmail] = useState('');
  const [consentError, setConsentError] = useState('');
  const [submittingConsent, setSubmittingConsent] = useState(false);

  const loadConversationsList = useCallback(async () => {
    try {
      // Yield to the event loop so that state changes inside the effect run asynchronously,
      // avoiding Next.js/React eslint warnings.
      await Promise.resolve();
      setLoadingConversations(true);
      const res = await fetch('/api/chat/conversations');
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch (e) {
      console.error('Failed to load conversations', e);
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  useEffect(() => {
    // Check consent status
    fetch('/api/privacy/consent')
      .then(res => res.json())
      .then(data => {
        if (data.consent_state) {
          setConsentState(data.consent_state);
        } else {
          setConsentState('pending');
        }
      })
      .catch(() => {
        setConsentState('pending');
      });

    fetch('/api/chapters')
      .then(res => res.json())
      .then(data => {
        if (!data.error) setAvailableChapters(data);
      })
      .catch(console.error);

    Promise.resolve().then(() => {
      loadConversationsList();
    });
  }, [loadConversationsList]);

  // Re-fetch conversation list when conversationId changes (e.g. when we start a new conversation and get an ID)
  useEffect(() => {
    if (conversationId) {
      Promise.resolve().then(() => {
        loadConversationsList();
      });
    }
  }, [conversationId, loadConversationsList]);

  // Open conversations at the newest message and keep the viewport at the
  // bottom while a response is streaming. The frame waits for the message DOM
  // to finish rendering before measuring scrollHeight.
  useEffect(() => {
    if (loadingHistory || messages.length === 0) return;
    const frame = window.requestAnimationFrame(() => {
      const viewport = chatViewportRef.current;
      if (viewport) viewport.scrollTop = viewport.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, loadingHistory]);

  const selectConversation = async (convo: ConversationItem) => {
    try {
      setLoadingHistory(true);
      const res = await fetch(`/api/chat/history?conversationId=${convo.id}`);
      if (res.ok) {
        const historyMessages = await res.json();
        
        // 1. Update filter context first
        setSubject(convo.subject);
        setChapterId(convo.chapterId);
        
        // 2. Set the messages and active ID
        setMessages(historyMessages);
        setConversationId(convo.id);
        
        setIsSidebarOpen(false); // Close sidebar on mobile
      }
    } catch (e) {
      console.error('Failed to load conversation history', e);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setConversationId(undefined);
    setChapterId(undefined);
  };

  const handleRenameConversation = async (id: string, newTitle: string) => {
    try {
      const res = await fetch('/api/chat/conversations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: id, title: newTitle }),
      });
      if (res.ok) {
        setConversations(prev => prev.map(c => 
          c.id === id ? { ...c, title: newTitle } : c
        ));
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to rename conversation');
      }
    } catch (err) {
      console.error('Error renaming conversation:', err);
      alert('Network error. Please try again.');
    }
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      const res = await fetch(`/api/chat/conversations?conversationId=${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        if (conversationId === id) {
          handleNewChat();
        }
        setConversations(prev => prev.filter(c => c.id !== id));
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to delete conversation');
      }
    } catch (err) {
      console.error('Error deleting conversation:', err);
      alert('Network error. Please try again.');
    }
  };



  const handleConsentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setConsentError('');
    setSubmittingConsent(true);

    try {
      const res = await fetch('/api/privacy/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentEmail })
      });

      if (res.ok) {
        setConsentState('given');
      } else {
        const data = await res.json().catch(() => ({}));
        setConsentError(data.error || 'Failed to submit consent. Please try again.');
      }
    } catch {
      setConsentError('Network error. Please try again.');
    } finally {
      setSubmittingConsent(false);
    }
  };


  const handleFeedback = React.useCallback(async (messageId: string, type: FeedbackType) => {
    // Guard: only real DB UUIDs can be rated. Messages without saved IDs are silently skipped.
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(messageId)) {
      setFeedbackStatus(prev => ({ ...prev, [messageId]: 'Cannot rate this message yet' }));
      return;
    }
    try {
      setFeedbackStatus(prev => ({ ...prev, [messageId]: 'Submitting...' }));
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, type })
      });
      if (res.ok) {
        // Persist the feedback type directly to the message state in memory
        setMessages(prev => prev.map(m =>
          m.id === messageId ? { ...m, feedbackType: type } : m
        ));
        // Clear transient status since derived state will now display the feedback type
        setFeedbackStatus(prev => {
          const next = { ...prev };
          delete next[messageId];
          return next;
        });
      } else {
        const err = await res.json().catch(() => ({}));
        setFeedbackStatus(prev => ({ ...prev, [messageId]: `Error: ${err.error || 'Failed to submit'}` }));
      }
    } catch {
      setFeedbackStatus(prev => ({ ...prev, [messageId]: 'Network error. Please try again.' }));
    }
  }, [setMessages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (streaming || isAiEditing || !inputText.trim()) return;

    if (mode !== 'notes') {
      sendMessage(inputText, { mode });
      setInputText('');
      return;
    }

    // --- Generate Notes mode: the input controls the active document ---
    void handleNotesSend(inputText);
    setInputText('');
  };

  // Stable id generator for transient note-action messages (crypto UUID when available).
  const generateNoteId = React.useCallback((): string => {
    return typeof window !== 'undefined' && window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : `note-${Date.now().toString(36)}`;
  }, []);

  // Ensure the private document exists for the current subject/chapter, returning it.
  const ensureNoteDocument = React.useCallback(async (): Promise<{ documentId: string; revision: number; content: string } | null> => {
    const chapNum = chapterId ? parseInt(chapterId, 10) : NaN;
    if (isNaN(chapNum)) {
      alert('Please select a specific chapter before generating notes.');
      return null;
    }
    if (noteDoc) return { ...noteDoc, content: noteContent };

    const res = await fetch('/api/note-documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, chapterNumber: chapNum, language: 'en' }),
    });
    if (!res.ok) {
      alert('Could not open your notes document. Please try again.');
      return null;
    }
    const data = await res.json();
    const doc = { documentId: data.documentId, revision: data.revision };
    setNoteDoc(doc);
    setNoteContent(data.content || '');
    return { ...doc, content: data.content || '' };
  }, [chapterId, subject, noteDoc, noteContent]);

  const handleNotesSend = async (instruction: string) => {
    setIsNotesOpen(true);
    const doc = await ensureNoteDocument();
    if (!doc) return;

    // If the document has no content yet, first message generates it via the
    // chat generation path. Otherwise, later messages revise it via commands.
    if (!doc.content.trim()) {
      sendMessage(instruction, {
        mode: 'notes',
        noteDocumentId: doc.documentId,
        onNoteDocumentSaved: (evt) => {
          setNoteDoc({ documentId: evt.documentId, revision: evt.revision });
          const summary = `Created notes in the canvas and applied your request: ${instruction}`;
          // Finalize the streaming notes-summary bubble with the concise summary
          // instead of leaving the full raw notes markdown in the chat pane.
          setMessages(prev => prev.map(m =>
            (m.role === 'assistant' && m.notesSummary && m.streaming)
              ? { ...m, content: summary, streaming: false }
              : m
          ));
          // Pull the authoritative saved content into the controlled canvas so
          // it persists after the transient chat stream ends.
          void reloadNoteDocument(evt.documentId);
        },
      });
      return;
    }

    // Revise the active document through the server-authoritative command endpoint.
    const messageId = generateNoteId();
    const summary = 'Applying your request to the notes canvas...';
    setMessages(prev => [
      ...prev,
      { id: `user-${messageId}`, role: 'user', content: instruction },
      { id: messageId, role: 'assistant', content: summary, notesSummary: true },
    ]);
    await runNoteCommand(doc.documentId, doc.revision, instruction, messageId);
  };

  const runNoteCommand = async (documentId: string, expectedRevision: number, instruction: string, summaryMessageId: string) => {
    setIsAiEditing(true);
    setNoteSaveState('idle');
    try {
      const res = await fetch(`/api/note-documents/${documentId}/commands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction, expectedRevision }),
      });
      if (res.status === 409) {
        setNoteSaveState('conflict');
        setMessages(prev => prev.map(message => message.id === summaryMessageId
          ? { ...message, content: 'The notes changed elsewhere, so this request was not applied.' }
          : message));
        return;
      }
      if (!res.ok || !res.body) {
        alert('The edit could not be applied. Please try again.');
        setMessages(prev => prev.map(message => message.id === summaryMessageId
          ? { ...message, content: 'The request could not be applied to the notes canvas.' }
          : message));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let saved = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') continue;
          try {
            const evt = JSON.parse(raw);
            if (evt.type === 'token') {
              // Keep the current document visible while the server applies the
              // command. Replacing it token-by-token makes a small formatting
              // change look like the whole note was rewritten.
            } else if (evt.type === 'note_document_saved') {
              saved = true;
              setNoteDoc({ documentId: evt.documentId, revision: evt.revision });
              const summary = `Applied your request to the notes canvas: ${instruction}`;
              setMessages(prev => prev.map(message => message.id === summaryMessageId
                ? { ...message, content: summary }
                : message));
            }
          } catch { /* ignore malformed */ }
        }
      }
      if (!saved) {
        // Stream ended without a persistence event: keep prior saved content.
        await reloadNoteDocument(documentId);
        const summary = 'The request could not be confirmed as saved to the notes canvas.';
        setMessages(prev => prev.map(message => message.id === summaryMessageId
          ? { ...message, content: summary }
          : message));
      } else {
        await reloadNoteDocument(documentId);
      }
    } catch {
      await reloadNoteDocument(documentId);
      setMessages(prev => prev.map(message => message.id === summaryMessageId
        ? { ...message, content: 'The request could not be applied to the notes canvas.' }
        : message));
    } finally {
      setIsAiEditing(false);
    }
  };

  const reloadNoteDocument = async (documentId: string) => {
    const res = await fetch(`/api/note-documents/${documentId}`);
    if (res.ok) {
      const data = await res.json();
      setNoteDoc({ documentId: data.documentId, revision: data.revision });
      setNoteContent(data.content || '');
    }
  };

  const handleNoteSave = async () => {
    if (!noteDoc) return;
    setNoteSaveState('saving');
    try {
      const res = await fetch(`/api/note-documents/${noteDoc.documentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: noteContent, expectedRevision: noteDoc.revision }),
      });
      if (res.status === 409) {
        setNoteSaveState('conflict');
        return;
      }
      if (!res.ok) {
        setNoteSaveState('idle');
        alert('Save failed. Please try again.');
        return;
      }
      const data = await res.json();
      setNoteDoc({ documentId: data.documentId, revision: data.revision });
      setNoteContent(data.content);
      setNoteSaveState('saved');
      setTimeout(() => setNoteSaveState('idle'), 2000);
    } catch {
      setNoteSaveState('idle');
      alert('Network error while saving.');
    }
  };

  const handleNoteUndo = async () => {
    if (!noteDoc) return;
    setIsAiEditing(true);
    try {
      const res = await fetch(`/api/note-documents/${noteDoc.documentId}/undo`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setNoteDoc({ documentId: data.documentId, revision: data.revision });
        setNoteContent(data.content);
      }
    } finally {
      setIsAiEditing(false);
    }
  };

  const handleConflictReload = () => {
    if (noteDoc) void reloadNoteDocument(noteDoc.documentId);
    setNoteSaveState('idle');
  };
  const handleConflictCopyMine = () => {
    navigator.clipboard.writeText(noteContent);
    setNoteSaveState('idle');
  };

  const activeMessage = messages.find(m => m.streaming && m.role === 'assistant');

  // While notes are being generated (first message / regenerate), the stream
  // lands in the chat assistant message; mirror it into the canvas preview.
  // Otherwise the canvas is controlled by the page's noteContent state.
  const isGeneratingNotes = !!(streaming && mode === 'notes');
  let lastNotesAssistant: Message | undefined;
  if (mode === 'notes') {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        lastNotesAssistant = messages[i];
        break;
      }
    }
  }
  const canvasContent = isGeneratingNotes
    ? (activeMessage?.content ?? lastNotesAssistant?.content ?? noteContent)
    : noteContent;

  return (
    <div className="flex flex-row h-screen bg-background relative overflow-hidden w-full">
      {/* Animated Gradient Background and Dot Grid */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/5 blur-[120px] mix-blend-screen opacity-70 animate-[pulse_10s_infinite_alternate]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[45%] h-[45%] rounded-full bg-blue-500/5 blur-[100px] mix-blend-screen opacity-60 animate-[pulse_12s_infinite_alternate]" />

        {/* Center Whitish Fog */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[70%] h-[60%] rounded-full bg-white/10 dark:bg-white/[0.04] blur-[130px] mix-blend-overlay" />

        {/* Dotted Grid Pattern */}
        <div className="absolute inset-0 opacity-[0.12] dark:opacity-[0.22]" style={{
          backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
          backgroundSize: '24px 24px'
        }} />
      </div>

      {/* Sidebar Panel Component */}
      <ChatPanel
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        loadingConversations={loadingConversations}
        conversations={conversations}
        conversationId={conversationId}
        selectConversation={selectConversation}
        handleNewChat={handleNewChat}
        chapterNames={CHAPTER_NAMES}
        onRenameConversation={handleRenameConversation}
        onDeleteConversation={handleDeleteConversation}
        setIsNotesOpen={setIsNotesOpen}
      />

      {/* Sidebar Mobile Overlay */}
      {isSidebarOpen && (
        <div 
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-45 md:hidden"
        />
      )}

      {/* Main Chat Area Wrapper */}
      <div className={`flex flex-col relative overflow-hidden z-10 bg-white/5 backdrop-blur-xl border border-white/10 rounded-[32px] shadow-2xl transition-all duration-300 m-4 md:my-6 min-w-0 ${
        isSidebarOpen ? 'md:ml-3' : 'md:ml-6'
      } ${
        // When the notes canvas is open, split the content area at lg: chat and
        // canvas each take half of the space beside the sidebar. Below lg the
        // canvas overlays the chat instead of splitting it.
        isNotesOpen ? 'flex-1 md:mr-3' : 'flex-1 md:mr-6'
      }`}>
        {/* Main Chat Area */}
        <main ref={chatViewportRef} className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 flex flex-col gap-2 relative z-10 no-scrollbar">
          {loadingHistory ? (
            <div className="m-auto flex flex-col items-center justify-center space-y-2 opacity-60">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-medium">Loading history...</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="m-auto text-center space-y-4 max-w-lg">
              <div className="text-4xl">👋</div>
              <h2 className="text-2xl font-bold">Hello! Let&apos;s study.</h2>
              <p className="text-muted-foreground">
                Select your subject and ask any question from the CBSE Class 10 syllabus.
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                message={msg.role === 'assistant' && msg.notesSummary && msg.streaming
                  ? { ...msg, content: 'Updating the notes canvas...' }
                  : msg}
                onFeedback={handleFeedback}
                feedbackStatus={feedbackStatus[msg.id]}
              />
            ))
          )}
      </main>

      {/* Input Footer */}
      <footer className="flex-none p-4 md:pb-6 relative z-10 bg-transparent">
        <div className="max-w-4xl mx-auto rounded-2xl border border-white/10 bg-card/60 backdrop-blur-xl p-3 shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
          <form onSubmit={handleSend} className="space-y-3">
            {/* Input Row */}
            <div className="flex gap-2">
              <input
                type="text"
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                placeholder="Ask your tutor anything..."
                maxLength={2000}
                className="flex-1 p-3 rounded-xl border-none bg-secondary/50 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50 text-sm md:text-base transition-all"
                disabled={streaming}
              />

              {streaming ? (
                <button
                  type="button"
                  onClick={cancel}
                  title="Stop generating"
                  className="p-3 bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold rounded-xl shadow transition-colors flex items-center justify-center cursor-pointer aspect-square"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                    <path fillRule="evenodd" d="M4.5 7.5a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3v-9Z" clipRule="evenodd" />
                  </svg>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!inputText.trim()}
                  title="Send message"
                  className="p-3 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold rounded-xl shadow disabled:opacity-40 transition-all flex items-center justify-center cursor-pointer aspect-square"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                    <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                  </svg>
                </button>
              )}
            </div>

            {/* Integrated Controls Row */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/5 text-xs text-muted-foreground">
              <div className="flex flex-wrap items-center gap-2">

                {/* General Chat mode badge — shown instead of Subject/Chapter selectors */}
                {mode === 'general' ? (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/15 border border-violet-500/30 text-violet-300 font-medium text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse inline-block" />
                    General Chat — no curriculum restrictions
                  </span>
                ) : (
                  <>
                    {/* Subject Selector */}
                    <select
                      value={subject}
                      onChange={(e) => {
                        setSubject(e.target.value as Subject);
                        setChapterId(undefined);
                        setMessages([]);
                        setConversationId(undefined);
                      }}
                      className="bg-secondary/40 text-foreground border border-white/5 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer hover:bg-secondary/60 transition-colors"
                    >
                      <option value="mathematics">📐 Mathematics</option>
                      <option value="science">🔬 Science</option>
                    </select>

                    {/* Chapter Selector */}
                    <select
                      value={chapterId || ''}
                      onChange={(e) => {
                        setChapterId(e.target.value || undefined);
                        setMessages([]);
                        setConversationId(undefined);
                      }}
                      className="bg-secondary/40 text-foreground border border-white/5 rounded-lg px-2.5 py-1.5 max-w-[180px] md:max-w-xs focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer hover:bg-secondary/60 transition-colors truncate"
                    >
                      <option value="">📚 All Chapters</option>
                      {availableChapters[subject]?.map(chNum => (
                        <option key={chNum} value={String(chNum)}>
                          {CHAPTER_NAMES[subject][chNum] || `Ch ${chNum}`}
                        </option>
                      ))}
                    </select>
                  </>
                )}

                {/* Learning Mode Selector */}
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as Mode)}
                  className="bg-secondary/40 text-foreground border border-white/5 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer hover:bg-secondary/60 transition-colors"
                >
                  <option value="explain">💡 Explain Mode</option>
                  <option value="solve">📝 Solve Problem</option>
                  <option value="notes">📓 Generate Notes</option>
                  <option value="quiz">🎯 Quiz Me</option>
                  <option value="general">💬 General Chat</option>
                </select>

                {/* Generate Notes target chip */}
                {mode === 'notes' && (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 font-medium text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block" />
                    {chapterId
                      ? `Editing: ${subject === 'mathematics' ? 'Mathematics' : 'Science'}, ${CHAPTER_NAMES[subject][parseInt(chapterId, 10)] || `Chapter ${chapterId}`}`
                      : 'Select a chapter to edit notes'}
                  </span>
                )}
              </div>

              <div className="font-mono text-[10px] opacity-60">
                {inputText.length} / 2000
              </div>
            </div>
          </form>
        </div>
      </footer>
      </div>

      {/* Notes Canvas — inline split panel on lg, overlay below lg */}
      <NotesCanvas
        isOpen={isNotesOpen}
        onClose={() => setIsNotesOpen(false)}
        content={canvasContent}
        documentId={noteDoc?.documentId ?? null}
        revision={noteDoc?.revision ?? null}
        onContentChange={setNoteContent}
        onSave={handleNoteSave}
        onUndo={handleNoteUndo}
        isGenerating={isGeneratingNotes}
        isAiEditing={isAiEditing}
        saveState={noteSaveState}
        onReloadConflict={handleConflictReload}
        onCopyMyChanges={handleConflictCopyMine}
        subject={subject}
        chapterId={chapterId}
      />

      {/* Parental Consent Overlay Modal */}
      {consentState === 'pending' && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md">
          <div className="max-w-md w-full mx-4 p-6 rounded-2xl border border-white/10 bg-card/60 backdrop-blur-xl shadow-2xl space-y-6">
            <div className="text-center space-y-2">
              <span className="text-4xl">🛡️</span>
              <h2 className="text-2xl font-bold text-foreground">Parental Consent Required</h2>
              <p className="text-sm text-muted-foreground">
                To comply with child privacy regulations, we require a parent/guardian&apos;s email and consent before you start studying.
              </p>
            </div>

            <form onSubmit={handleConsentSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Parent/Guardian Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="parent@example.com"
                  value={parentEmail}
                  onChange={(e) => setParentEmail(e.target.value)}
                  className="w-full p-3 rounded-xl border border-white/10 bg-secondary/50 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50 text-sm"
                />
              </div>

              <div className="text-xs text-muted-foreground leading-relaxed bg-secondary/20 p-3 rounded-xl border border-white/5">
                By entering your email and clicking &quot;Agree & Proceed&quot;, you agree that your child may use StudyNotes+ and that we may collect and process information as described in our Privacy Policy.
              </div>

              {consentError && (
                <div className="text-xs text-destructive bg-destructive/10 p-2 rounded-lg border border-destructive/20">
                  {consentError}
                </div>
              )}

              <button
                type="submit"
                disabled={submittingConsent}
                className="w-full p-3 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold rounded-xl shadow disabled:opacity-50 transition-colors cursor-pointer text-sm"
              >
                {submittingConsent ? 'Submitting...' : 'Agree & Proceed'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
