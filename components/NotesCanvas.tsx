'use client';

import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence, MotionConfig } from 'motion/react';
import { Streamdown, defaultRehypePlugins } from 'streamdown';
import { createMathPlugin } from '@streamdown/math';
import { X, Copy, Check, BookOpen, Edit3, Eye, Download, Save, Bold, Italic, List, Highlighter, Undo2, Loader2, AlertTriangle } from 'lucide-react';
import 'katex/dist/katex.min.css';

/**
 * Custom rehype plugin pipeline that extends Streamdown's default sanitize schema
 * to allow <mark class="note-highlight-*"> elements to pass through.
 *
 * Root cause: Streamdown's defaultRehypePlugins.sanitize schema (based on GitHub's
 * rehype-sanitize) does NOT include 'mark' in tagNames, and does NOT allow 'className'
 * on mark. The `allowedTags` prop only adds to tagNames but never adds className to
 * attributes, so marks always render without their class (default browser yellow).
 */
const ALLOWED_MARK_CLASSES = [
  'note-highlight-yellow',
  'note-highlight-green',
  'note-highlight-blue',
  'note-highlight-red',
];

// Build the sanitize plugin with mark support
const [sanitizeFn, defaultSanitizeSchema] = defaultRehypePlugins.sanitize as [unknown, Record<string, unknown>];
const notesRehypePlugins: [unknown, unknown][] = [
  defaultRehypePlugins.raw,
  [
    sanitizeFn,
    {
      ...defaultSanitizeSchema,
      tagNames: [...((defaultSanitizeSchema.tagNames as string[]) || []), 'mark'],
      attributes: {
        ...((defaultSanitizeSchema.attributes as Record<string, unknown>) || {}),
        // Only allow our specific controlled class names on mark
        mark: [['className', ...ALLOWED_MARK_CLASSES]],
      },
    },
  ],
  defaultRehypePlugins.harden,
] as [unknown, unknown][];


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
  yellow: 'note-highlight-yellow',
  green: 'note-highlight-green',
  blue: 'note-highlight-blue',
  red: 'note-highlight-red',
};

/**
 * Convert the safe highlight conventions produced by the model / toolbar into
 * controlled mark elements. Streamdown's `allowedTags` below permits only a
 * fixed class name; global CSS owns the actual colors.
 *
 * We process BEFORE Streamdown so Streamdown never sees the raw `==` tokens:
 *   ==text==              -> yellow highlight (note: process colored variants FIRST)
 *   ==green|text==        -> green highlight
 *   ==blue|text==         -> blue highlight
 *   ==red|text==          -> red highlight
 *   ==yellow|text==       -> yellow highlight (explicit)
 *   :::highlight-blue\n   -> blue block highlight
 *   content
 *   :::
 *
 * IMPORTANT: colored variants must be matched before plain `==text==`.
 */
function renderSafeHighlights(md: string): string {
  let out = md;
  // Block highlights (fenced :::highlight-color ... :::)
  out = out.replace(
    /:::highlight-(yellow|green|blue|red)\s*\n([\s\S]*?)\n:::/g,
    (_m, color: string, body: string) =>
      `<mark class="${HIGHLIGHT_CLASS[color] || HIGHLIGHT_CLASS.yellow}">${body}</mark>`
  );
  // Inline coloured highlights: ==color|body== — must run BEFORE plain ==body==
  out = out.replace(
    /==(yellow|green|blue|red)\|([^=\n]+)==/g,
    (_m, color: string, body: string) =>
      `<mark class="${HIGHLIGHT_CLASS[color] || HIGHLIGHT_CLASS.yellow}">${body}</mark>`
  );
  // Inline plain yellow highlights: ==body==
  // Guard against already-replaced <mark> tags by only matching pairs not containing <
  out = out.replace(/==([^=\n<]+)==/g, (_m, body: string) => `<mark class="${HIGHLIGHT_CLASS.yellow}">${body}</mark>`);
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
  const [isExportOpen, setIsExportOpen] = useState(false);
  // Store textarea selection before toolbar button click steals focus
  const savedSelection = useRef<{ start: number; end: number } | null>(null);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isExportOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setIsExportOpen(false);
      }
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [isExportOpen]);

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
    setIsExportOpen(false);
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
    setIsExportOpen(false);
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
    const printDocument = printWindow.document;
    printDocument.title = title;

    // Build the print page with DOM nodes rather than document.write. This
    // guarantees the rendered note content exists before the print dialog opens.
    const printStyles = printDocument.createElement('style');
    printStyles.textContent = `
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; max-width: 850px; margin: 40px auto; padding: 20px; line-height: 1.6; }
      h1,h2,h3,h4 { color: #111; font-weight: 700; margin-top: 1.6em; margin-bottom: 0.6em; }
      h1 { font-size: 2.2em; border-bottom: 2px solid #eaeaea; padding-bottom: 12px; margin-top: 0; }
      h2 { font-size: 1.6em; border-bottom: 1px solid #f1f1f1; padding-bottom: 8px; }
      h3 { font-size: 1.25em; }
      p { margin: 1em 0; }
      code { background: #f4f4f5; padding: 2px 5px; border-radius: 4px; font-family: monospace; font-size: 0.9em; }
      pre { background: #f4f4f5; padding: 15px; border-radius: 8px; overflow-x: auto; border: 1px solid #e4e4e7; }
      pre code { background: transparent; padding: 0; }
      mark { padding: 2px 4px; border-radius: 4px; font-weight: 600; }
      #notes-print-target .note-highlight-yellow { background: #fef08a !important; color: #713f12 !important; }
      #notes-print-target .note-highlight-green { background: #bbf7d0 !important; color: #166534 !important; }
      #notes-print-target .note-highlight-blue { background: #bfdbfe !important; color: #1d4ed8 !important; }
      #notes-print-target .note-highlight-red { background: #fecaca !important; color: #b91c1c !important; }
      ul { list-style-type: disc; padding-left: 24px; margin: 1em 0; }
      ol { list-style-type: decimal; padding-left: 24px; margin: 1em 0; }
      li { margin: 0.4em 0; }
      blockquote { border-left: 4px solid #e4e4e7; padding-left: 16px; color: #71717a; font-style: italic; margin: 1.5em 0; }
      table { width: 100%; border-collapse: collapse; margin: 1.5em 0; }
      th, td { border: 1px solid #e4e4e7; padding: 10px; text-align: left; }
      th { background: #f8f8f8; font-weight: 600; }
      .katex-display { margin: 1.2em 0; text-align: center; }
      .katex { font-size: 1.1em; line-height: 1.2; }
      @media print { body { margin: 0; padding: 0; font-size: 11pt; } @page { margin: 20mm; } pre, blockquote, table, figure { page-break-inside: avoid; } }
    `;
    document.querySelectorAll('link[rel="stylesheet"]').forEach((node) => {
      const link = printDocument.createElement('link');
      link.rel = 'stylesheet';
      link.href = (node as HTMLLinkElement).href;
      printDocument.head.appendChild(link);
    });
    // Append after copied app styles so the print-specific highlight override
    // wins over the global print reset in app/globals.css.
    printDocument.head.appendChild(printStyles);

    const heading = printDocument.createElement('h1');
    heading.textContent = title;
    const content = previewEl.cloneNode(true) as HTMLElement;
    content.id = 'notes-print-target';
    content.className = 'notes-print-content';
    printDocument.body.replaceChildren(heading, content);

    const printWhenReady = () => {
      window.setTimeout(() => {
        printWindow.focus();
        printWindow.print();
        printWindow.close();
      }, 500);
    };
    if (printDocument.readyState === 'complete') printWhenReady();
    else printWindow.addEventListener('load', printWhenReady, { once: true });
  };

  /** Save current textarea selection before a toolbar button steals focus. */
  const saveSelection = () => {
    const textarea = document.getElementById('notes-textarea') as HTMLTextAreaElement | null;
    if (textarea) {
      savedSelection.current = { start: textarea.selectionStart, end: textarea.selectionEnd };
    }
  };

  const insertText = (before: string, after: string = '') => {
    const textarea = document.getElementById('notes-textarea') as HTMLTextAreaElement | null;
    if (!textarea) return;
    // Use saved selection if textarea lost focus due to button click
    const sel = savedSelection.current ?? { start: textarea.selectionStart, end: textarea.selectionEnd };
    savedSelection.current = null;
    const { start, end } = sel;
    const selection = textarea.value.substring(start, end);
    const replacement = before + selection + after;
    const next = textarea.value.substring(0, start) + replacement + textarea.value.substring(end);
    onContentChange(next);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + selection.length);
    }, 0);
  };

  const makeBulletList = () => {
    const textarea = document.getElementById('notes-textarea') as HTMLTextAreaElement | null;
    if (!textarea) return;

    // Use saved selection if textarea lost focus due to button click
    const sel = savedSelection.current ?? { start: textarea.selectionStart, end: textarea.selectionEnd };
    savedSelection.current = null;
    const { start, end } = sel;

    const text = textarea.value;
    // Find start of first selected line
    const lineStart = start === 0 ? 0 : text.lastIndexOf('\n', start - 1) + 1;
    // Find end of last selected line (inclusive)
    const lineEndIndex = text.indexOf('\n', end);
    const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex;

    const selectedLines = text.slice(lineStart, lineEnd);
    const bullets = selectedLines
      .split('\n')
      .map(line => {
        // Leave truly blank lines alone; prefix all others with '- '
        const stripped = line.replace(/^\s*(?:[-*+]\s+|\d+\.\s+)?/, '');
        return stripped ? `- ${stripped}` : line;
      })
      .join('\n');

    onContentChange(text.slice(0, lineStart) + bullets + text.slice(lineEnd));
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(lineStart, lineStart + bullets.length);
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
              className="fixed top-0 right-0 h-full w-full md:w-[640px] bg-card/85 border-l border-white/10 backdrop-blur-2xl z-50 shadow-[-10px_0_50px_rgba(0,0,0,0.3)] flex flex-col text-foreground overflow-hidden
                         lg:static lg:z-10 lg:h-auto lg:w-auto lg:flex-1 lg:min-w-0 lg:m-4 lg:my-6 lg:mr-6 lg:ml-0 lg:rounded-[32px] lg:border lg:shadow-2xl"
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
                      <div ref={exportMenuRef} className="relative">
                        <button
                          type="button"
                          onClick={() => setIsExportOpen(open => !open)}
                          aria-expanded={isExportOpen}
                          className="p-2.5 rounded-xl bg-secondary/50 border border-white/5 hover:bg-secondary hover:text-primary transition-all text-muted-foreground flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
                          title="Export options"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        {isExportOpen && <div className="absolute right-0 mt-1 bg-neutral-900 border border-white/10 rounded-xl shadow-2xl p-1 z-50 text-xs w-40 text-left backdrop-blur-xl">
                          <button onClick={handleDownloadMarkdown} className="w-full text-left px-3 py-2 hover:bg-white/10 rounded-lg transition-colors flex items-center gap-2 text-foreground font-medium cursor-pointer">Markdown (.md)</button>
                          <button onClick={handleDownloadPDF} className="w-full text-left px-3 py-2 hover:bg-white/10 rounded-lg transition-colors flex items-center gap-2 text-foreground font-medium cursor-pointer">PDF Document</button>
                        </div>}
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
                      <div className="notes-markdown prose prose-sm md:prose-base dark:prose-invert max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-a:text-primary prose-pre:bg-secondary/40 prose-pre:border prose-pre:border-white/5">
                        <Streamdown
                          plugins={{ math: mathPlugin }}
                          rehypePlugins={notesRehypePlugins as Parameters<typeof Streamdown>[0]['rehypePlugins']}
                        >
                          {rendered}
                        </Streamdown>
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
                    <div
                      className="flex flex-wrap items-center gap-1.5 p-3 border-b border-white/5 bg-white/[0.01] shrink-0"
                      // Prevent buttons from stealing textarea focus before we save selection
                      onMouseDown={saveSelection}
                    >
                      <button onMouseDown={saveSelection} onClick={() => insertText('**', '**')} className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-all cursor-pointer" title="Bold"><Bold className="w-3.5 h-3.5" /></button>
                      <button onMouseDown={saveSelection} onClick={() => insertText('*', '*')} className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-all cursor-pointer" title="Italic"><Italic className="w-3.5 h-3.5" /></button>
                      <button onMouseDown={saveSelection} onClick={() => insertText('### ')} className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-all cursor-pointer text-[10px] font-mono font-bold" title="Heading 3">H3</button>
                      <button onMouseDown={saveSelection} onClick={makeBulletList} className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-all cursor-pointer" title="Make selected lines a bullet list"><List className="w-3.5 h-3.5" /></button>
                      <div className="w-px h-4 bg-white/10 mx-1" />
                      {/* Safe highlight conventions — stored selection prevents focus-loss race */}
                      <button onMouseDown={saveSelection} onClick={() => insertText('==', '==')} className="p-1.5 rounded-lg hover:bg-white/5 transition-all cursor-pointer" title="Highlight Yellow"><Highlighter className="w-3.5 h-3.5 text-yellow-300" /></button>
                      <button onMouseDown={saveSelection} onClick={() => insertText('==green|', '==')} className="p-1.5 rounded-lg hover:bg-white/5 transition-all cursor-pointer" title="Highlight Green"><Highlighter className="w-3.5 h-3.5 text-green-300" /></button>
                      <button onMouseDown={saveSelection} onClick={() => insertText('==blue|', '==')} className="p-1.5 rounded-lg hover:bg-white/5 transition-all cursor-pointer" title="Highlight Blue"><Highlighter className="w-3.5 h-3.5 text-blue-300" /></button>
                      <button onMouseDown={saveSelection} onClick={() => insertText('==red|', '==')} className="p-1.5 rounded-lg hover:bg-white/5 transition-all cursor-pointer" title="Highlight Red"><Highlighter className="w-3.5 h-3.5 text-red-300" /></button>
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
