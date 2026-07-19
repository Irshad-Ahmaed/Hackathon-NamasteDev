'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence, MotionConfig } from 'motion/react';
import { Streamdown } from 'streamdown';
import { createMathPlugin } from '@streamdown/math';
import { X, Copy, Check, BookOpen, Edit3, Eye, Download, Save, Bold, Italic, List, Highlighter, Undo2, Loader2, AlertTriangle } from 'lucide-react';
import 'katex/dist/katex.min.css';

export interface NotesCanvasProps {
  isOpen: boolean;
  onClose: () => void;
  content: string;
  documentId: string | null;
  revision: number | null;
  onContentChange: (content: string) => void;
  onSave: () => void;
  onUndo: () => void;
  isGenerating: boolean;
  isAiEditing: boolean;
  saveState?: 'idle' | 'saving' | 'saved' | 'conflict';
  onReloadConflict?: () => void;
  onCopyMyChanges?: () => void;
  subject?: string;
  chapterId?: string;
}

const mathPlugin = createMathPlugin({ singleDollarTextMath: true });

const HIGHLIGHT_CLASS: Record<string, string> = {
  yellow: 'bg-yellow-200 text-slate-900 px-1 rounded',
  green: 'bg-green-200 text-slate-900 px-1 rounded',
  blue: 'bg-blue-200 text-slate-900 px-1 rounded',
  red: 'bg-red-200 text-slate-900 px-1 rounded',
};

/**
 * Convert the safe highlight conventions produced by the model / toolbar into
 * controlled <mark> elements with fixed classes. Streamdown sanitizes output,
 * so no arbitrary HTML/style from the model survives.
 *   ==text==            -> yellow inline highlight
 *   :::highlight-blue    -> blue block highlight
 *   content
 *   :::
 */
function renderSafeHighlights(md: string): string {
  let out = md;
  // Block highlights
  out = out.replace(
    /:::highlight-(yellow|green|blue|red)\s*\n([\s\S]*?)\n:::/g,
    (_m, color: string, body: string) =>
      `<mark class="${HIGHLIGHT_CLASS[color] || HIGHLIGHT_CLASS.yellow}">${body}</mark>`
  );
  // Inline ==highlight== (yellow)
  out = out.replace(/==([^=\n]+)==/g, (_m, body: string) => `<mark class="${HIGHLIGHT_CLASS.yellow}">${body}</mark>`);
  return out;
}

export function NotesCanvas({
  isOpen,
  onClose,
  content,
  documentId,
  revision,
  onContentChange,
  onSave,
  onUndo,
  isGenerating,
  isAiEditing,
  saveState = 'idle',
  onReloadConflict,
  onCopyMyChanges,
  subject,
  chapterId,
}: NotesCanvasProps) {
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<'view' | 'edit'>('view');

  const busy = isGenerating || isAiEditing;
  const displayContent = content;
  const rendered = renderSafeHighlights(displayContent);

  const handleCopy = () => {
    if (!displayContent) return;
    navigator.clipboard.writeText(displayContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadMarkdown = () => {
    const blob = new Blob([displayContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `study-notes-${subject || 'notes'}-ch-${chapterId || 'all'}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPDF = () => {
    const previewEl = document.getElementById('notes-preview-container');
    if (!previewEl) {
      alert('Please switch to Reading View to export the notes.');
      return;
    }
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Pop-up blocker is preventing PDF export. Please allow popups for this site.');
      return;
    }
    const title = `Study Notes - ${subject === 'mathematics' ? 'Mathematics' : 'Science'} Chapter ${chapterId || ''}`;
    // previewEl.innerHTML comes from Streamdown's sanitized render, so it is safe to print.
    printWindow.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; max-width: 850px; margin: 40px auto; padding: 20px; line-height: 1.6; }
            h1,h2,h3,h4 { color: #111; font-weight: 700; margin-top: 1.6em; margin-bottom: 0.6em; }
            h1 { font-size: 2.2em; border-bottom: 2px solid #eaeaea; padding-bottom: 12px; margin-top: 0; }
            h2 { font-size: 1.6em; border-bottom: 1px solid #f1f1f1; padding-bottom: 8px; }
            h3 { font-size: 1.25em; }
            p { margin: 1em 0; }
            code { background: #f4f4f5; padding: 2px 5px; border-radius: 4px; font-family: monospace; font-size: 0.9em; }
            pre { background: #f4f4f5; padding: 15px; border-radius: 8px; overflow-x: auto; border: 1px solid #e4e4e7; }
            pre code { background: transparent; padding: 0; }
            mark { padding: 2px 4px; border-radius: 4px; }
            ul, ol { padding-left: 24px; margin: 1em 0; }
            li { margin: 0.4em 0; }
            blockquote { border-left: 4px solid #e4e4e7; padding-left: 16px; color: #71717a; font-style: italic; margin: 1.5em 0; }
            table { width: 100%; border-collapse: collapse; margin: 1.5em 0; }
            th, td { border: 1px solid #e4e4e7; padding: 10px; text-align: left; }
            th { background: #f8f8f8; font-weight: 600; }
            .katex-display { margin: 1.2em 0; text-align: center; }
            .katex { font-size: 1.1em; line-height: 1.2; }
            @media print { body { margin: 0; padding: 0; font-size: 11pt; } @page { margin: 20mm; } pre, blockquote, table, figure { page-break-inside: avoid; } }
          </style>
          <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
        </head>
        <body>
          <h1>${title}</h1>
          <div class="prose">${previewEl.innerHTML}</div>
          <script>window.onload=function(){setTimeout(function(){window.print();window.close();},400);};</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const insertText = (before: string, after: string = '') => {
    const textarea = document.getElementById('notes-textarea') as HTMLTextAreaElement | null;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selection = textarea.value.substring(start, end);
    const replacement = before + selection + after;
    const next = textarea.value.substring(0, start) + replacement + textarea.value.substring(end);
    onContentChange(next);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + selection.length);
    }, 0);
  };

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
            />

            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 220 }}
              className="fixed top-0 right-0 h-full w-full md:w-[640px] bg-card/85 border-l border-white/10 backdrop-blur-2xl z-50 shadow-[-10px_0_50px_rgba(0,0,0,0.3)] flex flex-col text-foreground overflow-hidden"
            >
              {/* Header */}
              <div className="p-4 md:p-6 border-b border-white/5 flex flex-col gap-4 bg-card/45 backdrop-blur-md sticky top-0 z-10 print:hidden">
                <div className="flex justify-between items-center w-full">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold flex items-center gap-2 tracking-tight">
                        Study Canvas
                        {busy && (
                          <span className="flex h-2 w-2 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                          </span>
                        )}
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        {isGenerating ? 'Tutor is drafting notes...' : isAiEditing ? 'Applying your instruction...' : documentId ? `Your notes · rev ${revision ?? '—'}` : 'Your study notes draft'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Undo AI/manual change */}
                    {documentId && !busy && (
                      <button
                        onClick={onUndo}
                        className="p-2.5 rounded-xl bg-secondary/50 border border-white/5 hover:bg-secondary hover:text-primary transition-all text-muted-foreground"
                        title="Undo last change"
                      >
                        <Undo2 className="w-4 h-4" />
                      </button>
                    )}

                    {/* Save (manual edit) */}
                    {mode === 'edit' && documentId && (
                      <button
                        onClick={onSave}
                        disabled={saveState === 'saving' || busy}
                        className="px-3 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-500/30 text-emerald-300 text-xs font-semibold cursor-pointer flex items-center gap-1.5 transition-all disabled:opacity-50"
                        title="Save your edits"
                      >
                        {saveState === 'saving' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saveState === 'saved' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Save className="w-3.5 h-3.5" />}
                        <span>{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved!' : 'Save'}</span>
                      </button>
                    )}

                    {displayContent && (
                      <button
                        onClick={handleCopy}
                        className="p-2.5 rounded-xl bg-secondary/50 border border-white/5 hover:bg-secondary hover:text-primary transition-all text-muted-foreground flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
                        title="Copy notes to clipboard"
                      >
                        {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                    )}

                    {displayContent && (
                      <div className="relative group">
                        <button className="p-2.5 rounded-xl bg-secondary/50 border border-white/5 hover:bg-secondary hover:text-primary transition-all text-muted-foreground flex items-center gap-1.5 text-xs font-semibold cursor-pointer" title="Export options">
                          <Download className="w-4 h-4" />
                        </button>
                        <div className="absolute right-0 mt-1 hidden group-hover:block hover:block bg-neutral-900 border border-white/10 rounded-xl shadow-2xl p-1 z-50 text-xs w-36 text-left backdrop-blur-xl">
                          <button onClick={handleDownloadMarkdown} className="w-full text-left px-3 py-2 hover:bg-white/10 rounded-lg transition-colors flex items-center gap-2 text-foreground font-medium cursor-pointer">Markdown (.md)</button>
                          <button onClick={handleDownloadPDF} className="w-full text-left px-3 py-2 hover:bg-white/10 rounded-lg transition-colors flex items-center gap-2 text-foreground font-medium cursor-pointer">PDF Document</button>
                        </div>
                      </div>
                    )}

                    <button onClick={onClose} className="p-2.5 hover:bg-secondary rounded-xl text-muted-foreground hover:text-foreground transition-colors border border-transparent hover:border-white/5 cursor-pointer">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Conflict banner */}
                {saveState === 'conflict' && (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span className="flex-1">This document changed elsewhere. Your edits were not saved.</span>
                    <button onClick={onReloadConflict} className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 font-semibold">Reload</button>
                    <button onClick={onCopyMyChanges} className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 font-semibold">Copy my changes</button>
                  </div>
                )}

                {/* Tabs */}
                <div className="flex border border-white/10 rounded-xl p-0.5 bg-white/5 w-fit select-none">
                  <button onClick={() => setMode('view')} className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${mode === 'view' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                    <Eye className="w-3.5 h-3.5" /><span>Reading View</span>
                  </button>
                  <button
                    onClick={() => setMode('edit')}
                    disabled={busy}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-40 ${mode === 'edit' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    <Edit3 className="w-3.5 h-3.5" /><span>Edit Notes</span>
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col min-h-0 bg-black/[0.05]">
                {mode === 'view' || busy ? (
                  <div className="flex-1 p-6 md:p-8" id="notes-preview-container">
                    {displayContent ? (
                      <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-a:text-primary prose-pre:bg-secondary/40 prose-pre:border prose-pre:border-white/5">
                        <Streamdown plugins={{ math: mathPlugin }}>{rendered}</Streamdown>
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground space-y-3 opacity-60 print:hidden mt-20">
                        <div className="w-16 h-16 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
                          <BookOpen className="w-8 h-8" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm">Notes Canvas is empty</p>
                          <p className="text-xs mb-2">Switch to &quot;Generate Notes&quot; mode below and ask the tutor to draft study notes.</p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col min-h-0">
                    <div className="flex flex-wrap items-center gap-1.5 p-3 border-b border-white/5 bg-white/[0.01] shrink-0">
                      <button onClick={() => insertText('**', '**')} className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-all cursor-pointer" title="Bold"><Bold className="w-3.5 h-3.5" /></button>
                      <button onClick={() => insertText('*', '*')} className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-all cursor-pointer" title="Italic"><Italic className="w-3.5 h-3.5" /></button>
                      <button onClick={() => insertText('### ')} className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-all cursor-pointer text-[10px] font-mono font-bold" title="Heading 3">H3</button>
                      <button onClick={() => insertText('- ')} className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-all cursor-pointer" title="Bullet List"><List className="w-3.5 h-3.5" /></button>
                      <div className="w-px h-4 bg-white/10 mx-1" />
                      {/* Safe highlight conventions only — no inline HTML/style */}
                      <button onClick={() => insertText('==', '==')} className="p-1.5 rounded-lg hover:bg-white/5 transition-all cursor-pointer" title="Highlight Yellow"><Highlighter className="w-3.5 h-3.5 text-yellow-300" /></button>
                      <button onClick={() => insertText(':::highlight-green\n', '\n:::')} className="p-1.5 rounded-lg hover:bg-white/5 transition-all cursor-pointer" title="Highlight Green (block)"><Highlighter className="w-3.5 h-3.5 text-green-300" /></button>
                      <button onClick={() => insertText(':::highlight-blue\n', '\n:::')} className="p-1.5 rounded-lg hover:bg-white/5 transition-all cursor-pointer" title="Highlight Blue (block)"><Highlighter className="w-3.5 h-3.5 text-blue-300" /></button>
                      <button onClick={() => insertText(':::highlight-red\n', '\n:::')} className="p-1.5 rounded-lg hover:bg-white/5 transition-all cursor-pointer" title="Highlight Red (block)"><Highlighter className="w-3.5 h-3.5 text-red-300" /></button>
                    </div>
                    <textarea
                      id="notes-textarea"
                      value={displayContent}
                      onChange={(e) => onContentChange(e.target.value)}
                      placeholder="Add, highlight, or edit notes in markdown here..."
                      className="flex-1 w-full p-6 bg-transparent text-foreground placeholder:text-muted-foreground/50 border-none resize-none focus:outline-none focus:ring-0 text-sm md:text-base font-mono leading-relaxed overflow-y-auto no-scrollbar"
                    />
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
