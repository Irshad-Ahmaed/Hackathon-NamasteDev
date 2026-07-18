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
import { UserButton } from '@clerk/nextjs';

const mathPlugin = createMathPlugin({ singleDollarTextMath: true });
 
// Message component wrapped in React.memo to prevent re-rendering historical messages
const ChatMessage = React.memo(({ message, onFeedback, feedbackStatus }: { 
  message: Message; 
  onFeedback?: (messageId: string, type: 'incorrect' | 'inappropriate' | 'helpful') => void;
  feedbackStatus?: string;
}) => {
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
  let lastAssistant: Message | undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      lastAssistant = messages[i];
      break;
    }
  }
  
  const derivedNotesContent = activeMessage && mode === 'notes'
    ? activeMessage.content 
    : (lastAssistant ? lastAssistant.content : '');

  return (
    <div className="flex flex-col h-screen bg-background relative overflow-hidden">
      {/* Animated Gradient Background and Dot Grid */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/5 blur-[120px] mix-blend-screen opacity-70 animate-[pulse_10s_infinite_alternate]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[45%] h-[45%] rounded-full bg-blue-500/5 blur-[100px] mix-blend-screen opacity-60 animate-[pulse_12s_infinite_alternate]" />
        
        {/* Dotted Grid Pattern */}
        <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]" style={{
          backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
          backgroundSize: '24px 24px'
        }} />
      </div>

      {/* Header */}
      <header className="flex-none flex items-center justify-between p-4 border-b border-white/5 bg-background/40 backdrop-blur-md z-20">
        <div className="font-bold text-xl flex items-center gap-2 whitespace-nowrap">
          <span className="text-primary">✦</span> StudyNotes+
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsNotesOpen(true)}
            className="px-4 py-2 bg-secondary text-secondary-foreground text-sm font-medium rounded-full hover:bg-secondary/80 transition-colors shadow-sm whitespace-nowrap"
          >
            Notes Canvas
          </button>
          <UserButton />
        </div>
      </header>

      {/* Main Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 flex flex-col gap-2 relative z-10">
        {messages.length === 0 ? (
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
              message={msg} 
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
                  className="px-5 bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold rounded-xl shadow transition-colors flex items-center justify-center"
                >
                  Stop
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!inputText.trim()}
                  className="px-6 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold rounded-xl shadow disabled:opacity-40 transition-all flex items-center justify-center"
                >
                  Send
                </button>
              )}
            </div>

            {/* Integrated Controls Row */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/5 text-xs text-muted-foreground">
              <div className="flex flex-wrap items-center gap-2">
                {/* Subject Selector */}
                <select 
                  value={subject} 
                  onChange={(e) => {
                    setSubject(e.target.value as Subject);
                    setChapterId(undefined);
                  }}
                  className="bg-secondary/40 text-foreground border border-white/5 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer hover:bg-secondary/60 transition-colors"
                >
                  <option value="mathematics">📐 Mathematics</option>
                  <option value="science">🔬 Science</option>
                </select>

                {/* Chapter Selector */}
                <select
                  value={chapterId || ''}
                  onChange={(e) => setChapterId(e.target.value || undefined)}
                  className="bg-secondary/40 text-foreground border border-white/5 rounded-lg px-2.5 py-1.5 max-w-[180px] md:max-w-xs focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer hover:bg-secondary/60 transition-colors truncate"
                >
                  <option value="">📚 All Chapters</option>
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
                      <option value="science-ch01">Ch 1: Chemical Reactions</option>
                      <option value="science-ch02">Ch 2: Acids, Bases, Salts</option>
                      <option value="science-ch03">Ch 3: Metals & Non-Metals</option>
                      <option value="science-ch04">Ch 4: Carbon Compounds</option>
                      <option value="science-ch05">Ch 5: Life Processes</option>
                      <option value="science-ch06">Ch 6: Control & Coordination</option>
                      <option value="science-ch07">Ch 7: How do Organisms Reproduce?</option>
                      <option value="science-ch08">Ch 8: Heredity</option>
                    </>
                  )}
                </select>
                
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
              </div>

              <div className="font-mono text-[10px] opacity-60">
                {inputText.length} / 2000
              </div>
            </div>
          </form>
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
