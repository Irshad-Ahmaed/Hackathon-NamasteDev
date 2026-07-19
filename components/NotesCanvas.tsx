'use client';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, MotionConfig } from 'motion/react';
import { Streamdown } from 'streamdown';
import { createMathPlugin } from '@streamdown/math';
import { X, Copy, Check, BookOpen, Loader2 } from 'lucide-react';
import 'katex/dist/katex.min.css';

interface NotesCanvasProps {
  isOpen: boolean;
  onClose: () => void;
  content: string; // The streaming or finalized chat markdown content
  isGenerating?: boolean;
  subject?: string;
  chapterId?: string;
}

// Enable single-dollar inline math since LLM prompts instruct to use $equation$
const mathPlugin = createMathPlugin({ singleDollarTextMath: true });

export function NotesCanvas({ isOpen, onClose, content, isGenerating, subject, chapterId }: NotesCanvasProps) {
  const [copied, setCopied] = useState(false);
  const [dbContent, setDbContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset DB notes when subject, chapter, or open state changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDbContent(null);
    setError(null);
  }, [subject, chapterId, isOpen]);

  const handleCopy = (textToCopy: string) => {
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLoadNotes = async () => {
    if (!subject || !chapterId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/notes?subject=${subject}&chapter=${chapterId}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load notes');
      }
      const data = await res.json();
      setDbContent(data.content);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // If currently generating notes in chat, prioritize showing streaming chat content.
  // Otherwise, fallback to loaded dbContent or default content prop.
  const displayContent = isGenerating || !dbContent ? content : dbContent;

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop with modern blur */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity"
            />
            
            {/* Sliding Panel - Premium Glassmorphic Design */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 220 }}
              className="fixed top-0 right-0 h-full w-full md:w-[640px] bg-card/85 border-l border-white/10 backdrop-blur-2xl z-50 shadow-[-10px_0_50px_rgba(0,0,0,0.3)] flex flex-col text-foreground overflow-hidden"
            >
              {/* Header */}
              <div className="p-4 md:p-6 border-b border-white/5 flex justify-between items-center bg-card/40 backdrop-blur-md sticky top-0 z-10 print:hidden">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold flex items-center gap-2 tracking-tight">
                      Study Canvas
                      {isGenerating && (
                        <span className="flex h-2 w-2 relative">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                        </span>
                      )}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {isGenerating ? 'Tutor is drafting notes...' : dbContent ? 'Official Study Notes' : 'Your study notes draft'}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {/* Load Chapter Notes Button */}
                  {subject && chapterId && !isGenerating && !dbContent && (
                    <button
                      onClick={handleLoadNotes}
                      disabled={loading}
                      className="px-3 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold cursor-pointer flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Loading...</span>
                        </>
                      ) : (
                        <span>📚 Load Chapter Notes</span>
                      )}
                    </button>
                  )}

                  {displayContent && (
                    <>
                      {/* Save as PDF Button */}
                      <button
                        onClick={handlePrint}
                        className="p-2.5 rounded-xl bg-secondary/50 border border-white/5 hover:bg-secondary hover:text-primary transition-all text-muted-foreground flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
                        title="Save notes as PDF"
                      >
                        🖨️ Print PDF
                      </button>

                      {/* Copy Notes Button */}
                      <button 
                        onClick={() => handleCopy(displayContent)} 
                        className="p-2.5 rounded-xl bg-secondary/50 border border-white/5 hover:bg-secondary hover:text-primary transition-all text-muted-foreground flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
                        title="Copy notes to clipboard"
                      >
                        {copied ? (
                          <>
                            <Check className="w-4 h-4 text-emerald-400" />
                            <span className="text-emerald-400">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </>
                  )}
                  <button 
                    onClick={onClose} 
                    className="p-2.5 hover:bg-secondary rounded-xl text-muted-foreground hover:text-foreground transition-colors border border-transparent hover:border-white/5 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              
              {/* Content Area */}
              <div className="flex-1 p-6 md:p-8 overflow-y-auto" id="notes-print-target">
                {error && (
                  <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-xl print:hidden">
                    Error loading notes: {error}
                  </div>
                )}

                {displayContent ? (
                  <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-a:text-primary prose-pre:bg-secondary/40 prose-pre:border prose-pre:border-white/5">
                    <Streamdown plugins={{ math: mathPlugin }}>{displayContent}</Streamdown>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground space-y-3 opacity-60 print:hidden">
                    <div className="w-16 h-16 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
                      <BookOpen className="w-8 h-8" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Notes Canvas is empty</p>
                      <p className="text-xs mb-2">Switch to &quot;Generate Notes&quot; mode below and ask the tutor to draft study notes.</p>
                      {subject && chapterId && (
                        <p className="text-xs text-primary font-medium">Or click the &quot;Load Chapter Notes&quot; button above to fetch official notes.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
