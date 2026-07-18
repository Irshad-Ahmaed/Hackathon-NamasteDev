'use client';

import React, { useState } from 'react';
import { Streamdown } from 'streamdown';
import { createMathPlugin } from '@streamdown/math';
import 'katex/dist/katex.min.css';

import { useChat } from '@/hooks/useChat';
import type { Message } from '@/hooks/useChat';
import { useSubjectFilter, Subject, Mode } from '@/hooks/useSubjectFilter';
import type { CitationMetadata as Citation } from '@/lib/schemas';
import { NotesCanvas } from '@/components/NotesCanvas';

const mathPlugin = createMathPlugin({ singleDollarTextMath: true });

// Message component wrapped in React.memo to prevent re-rendering historical messages
const ChatMessage = React.memo(({ message, onFeedback, feedbackStatus }: { 
  message: Message; 
  onFeedback?: (messageId: string, type: 'incorrect' | 'inappropriate' | 'helpful') => void;
  feedbackStatus?: string;
}) => {
  return (
    <div className={`p-4 my-2 rounded-xl ${message.role === 'user' ? 'bg-primary text-primary-foreground ml-auto max-w-[80%]' : 'bg-muted text-foreground mr-auto max-w-[100%]'}`}>
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
          <button 
            onClick={() => onFeedback(message.id, 'helpful')}
            className="hover:text-blue-500 transition-colors text-slate-500 font-medium flex items-center gap-1 cursor-pointer"
          >
            👍 Helpful
          </button>
          <button 
            onClick={() => onFeedback(message.id, 'incorrect')}
            className="hover:text-amber-500 transition-colors text-slate-500 font-medium flex items-center gap-1 cursor-pointer"
          >
            👎 This is incorrect
          </button>
          <button 
            onClick={() => onFeedback(message.id, 'inappropriate')}
            className="hover:text-red-500 transition-colors text-slate-500 font-medium flex items-center gap-1 cursor-pointer"
          >
            🚩 Report answer
          </button>
          {feedbackStatus && (
            <span className="text-slate-400 font-normal italic ml-auto">{feedbackStatus}</span>
          )}
        </div>
      )}
    </div>
  );
});
ChatMessage.displayName = 'ChatMessage';

export default function ChatPage() {
  const { subject, setSubject, chapterId, setChapterId, mode, setMode } = useSubjectFilter();
  const { messages, sendMessage, streaming, cancel } = useChat(subject, 'en', chapterId);
  const [inputText, setInputText] = useState('');
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState<Record<string, string>>({});

  const handleFeedback = React.useCallback(async (messageId: string, type: 'incorrect' | 'inappropriate' | 'helpful') => {
    try {
      setFeedbackStatus(prev => ({ ...prev, [messageId]: 'Submitting...' }));
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, type })
      });
      if (res.ok) {
        setFeedbackStatus(prev => ({ 
          ...prev, 
          [messageId]: `Feedback submitted: ${type === 'helpful' ? 'Helpful' : type === 'incorrect' ? 'Incorrect' : 'Reported'}` 
        }));
      } else {
        const err = await res.json().catch(() => ({}));
        setFeedbackStatus(prev => ({ ...prev, [messageId]: `Error: ${err.error || 'Failed to submit'}` }));
      }
    } catch {
      setFeedbackStatus(prev => ({ ...prev, [messageId]: 'Network error. Please try again.' }));
    }
  }, []);
  
  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (streaming || !inputText.trim()) return;
    
    // If asking for notes, open the canvas and let the chat display it there
    if (mode === 'notes') {
      setIsNotesOpen(true);
    }
    
    sendMessage(inputText, { mode });
    setInputText('');
  };
  
  const activeMessage = messages.find(m => m.streaming && m.role === 'assistant');

  // Derive notes content directly from conversation history to avoid duplicate state and cascading renders
  const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
  const derivedNotesContent = activeMessage && mode === 'notes'
    ? activeMessage.content 
    : (lastAssistant ? lastAssistant.content : '');

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="flex-none flex items-center justify-between p-4 border-b bg-card text-card-foreground shadow-sm overflow-x-auto">
        <div className="font-bold text-xl flex items-center gap-2 whitespace-nowrap">
          <span className="text-primary">✦</span> CBSE Tutor
        </div>
        
        <div className="flex items-center gap-4 ml-4">
          <select 
            value={subject} 
            onChange={(e) => {
              setSubject(e.target.value as Subject);
              setChapterId(undefined); // Reset chapter when subject changes
            }}
            className="bg-secondary text-secondary-foreground text-sm rounded-md border-none p-2 focus:ring-2 focus:ring-ring"
          >
            <option value="mathematics">Mathematics</option>
            <option value="science">Science</option>
          </select>

          <select
            value={chapterId || ''}
            onChange={(e) => setChapterId(e.target.value || undefined)}
            className="bg-secondary text-secondary-foreground text-sm rounded-md border-none p-2 focus:ring-2 focus:ring-ring"
          >
            <option value="">All Chapters</option>
            {subject === 'mathematics' ? (
              <>
                <option value="math-ch01">Ch 1: Real Numbers</option>
                <option value="math-ch02">Ch 2: Polynomials</option>
                <option value="math-ch03">Ch 3: Linear Equations</option>
                <option value="math-ch04">Ch 4: Quadratic Equations</option>
                <option value="math-ch05">Ch 5: Arithmetic Progressions</option>
                <option value="math-ch06">Ch 6: Triangles</option>
                <option value="math-ch07">Ch 7: Coordinate Geometry</option>
                <option value="math-ch08">Ch 8: Introduction to Trigonometry</option>
              </>
            ) : (
              <>
                <option value="science-ch01">Ch 1: Chemical Reactions and Equations</option>
                <option value="science-ch02">Ch 2: Acids, Bases and Salts</option>
                <option value="science-ch03">Ch 3: Metals and Non-Metals</option>
                <option value="science-ch04">Ch 4: Carbon and its Compounds</option>
                <option value="science-ch05">Ch 5: Life Processes</option>
                <option value="science-ch06">Ch 6: Control and Coordination</option>
                <option value="science-ch07">Ch 7: How do Organisms Reproduce?</option>
                <option value="science-ch08">Ch 8: Heredity</option>
              </>
            )}
          </select>
          
          <select 
            value={mode} 
            onChange={(e) => setMode(e.target.value as Mode)}
            className="bg-secondary text-secondary-foreground text-sm rounded-md border-none p-2 focus:ring-2 focus:ring-ring"
          >
            <option value="explain">Explain</option>
            <option value="solve">Solve Problem</option>
            <option value="notes">Generate Notes</option>
            <option value="quiz">Quiz Me</option>
          </select>

          <button 
            onClick={() => setIsNotesOpen(true)}
            className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 transition-colors shadow-sm whitespace-nowrap"
          >
            Notes Canvas
          </button>
        </div>
      </header>

      {/* Main Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 flex flex-col gap-2">
        {messages.length === 0 ? (
          <div className="m-auto text-center space-y-4 max-w-lg">
            <div className="text-4xl">👋</div>
            <h2 className="text-2xl font-bold">Hello! Let&apos;s study.</h2>
            <p className="text-muted-foreground">
              Select your subject above and ask any question from the CBSE Class 10 syllabus.
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <ChatMessage 
              key={msg.id} 
              message={msg} 
              onFeedback={handleFeedback} 
              feedbackStatus={feedbackStatus[msg.id]} 
            />
          ))
        )}
      </main>

      {/* Input Footer */}
      <footer className="flex-none p-4 border-t bg-card">
        <form onSubmit={handleSend} className="max-w-4xl mx-auto flex gap-2">
          <input
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            placeholder="Ask a question..."
            maxLength={2000}
            className="flex-1 p-3 rounded-lg border bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-primary shadow-sm"
            disabled={streaming}
          />
          <button
            type="submit"
            disabled={!inputText.trim() || streaming}
            className="px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-lg shadow disabled:opacity-50 hover:bg-primary/90 transition-colors"
          >
            {streaming ? '...' : 'Send'}
          </button>
          {streaming && (
            <button
              type="button"
              onClick={cancel}
              className="px-4 py-3 bg-destructive text-destructive-foreground font-semibold rounded-lg shadow hover:bg-destructive/90 transition-colors"
            >
              Stop
            </button>
          )}
        </form>
        <div className="text-xs text-center text-muted-foreground mt-2">
          {inputText.length} / 2000
        </div>
      </footer>
      
      {/* Notes Canvas Overlay */}
      <NotesCanvas 
        isOpen={isNotesOpen} 
        onClose={() => setIsNotesOpen(false)} 
        content={derivedNotesContent} 
        isGenerating={streaming && mode === 'notes'}
      />
    </div>
  );
}
