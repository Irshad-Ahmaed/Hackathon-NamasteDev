'use client';

import React, { useState, useEffect } from 'react';
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
  const { messages, sendMessage, streaming, cancel } = useChat(subject, 'en', chapterId);
  const [inputText, setInputText] = useState('');
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState<Record<string, string>>({});
  const [availableChapters, setAvailableChapters] = useState<{ mathematics: number[], science: number[] }>({ mathematics: [], science: [] });
  
  // Parental consent states
  const [consentState, setConsentState] = useState<'pending' | 'given' | 'loading'>('loading');
  const [parentEmail, setParentEmail] = useState('');
  const [consentError, setConsentError] = useState('');
  const [submittingConsent, setSubmittingConsent] = useState(false);

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
  }, []);

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

  // Derive notes content only when in 'notes' mode — avoids showing quiz/explain answers in the Notes Canvas.
  // We walk backwards to find the most recent assistant message that was generated in notes mode.
  let lastNotesAssistant: Message | undefined;
  if (mode === 'notes') {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        lastNotesAssistant = messages[i];
        break;
      }
    }
  }

  const derivedNotesContent = activeMessage && mode === 'notes'
    ? activeMessage.content
    : (lastNotesAssistant ? lastNotesAssistant.content : '');

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

