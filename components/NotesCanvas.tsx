'use client';
import { motion, AnimatePresence } from 'motion/react';
import { Streamdown } from 'streamdown';
import { createMathPlugin } from '@streamdown/math';
import 'katex/dist/katex.min.css';

interface NotesCanvasProps {
  isOpen: boolean;
  onClose: () => void;
  content: string; // The streaming or finalized markdown content
  isGenerating?: boolean;
}

// Enable single-dollar inline math since LLM prompts instruct to use $equation$
const mathPlugin = createMathPlugin({ singleDollarTextMath: true });

export function NotesCanvas({ isOpen, onClose, content, isGenerating }: NotesCanvasProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black z-40"
          />
          
          {/* Sliding Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 h-full w-full md:w-[600px] bg-white z-50 shadow-2xl overflow-y-auto flex flex-col"
          >
            <div className="p-4 border-b flex justify-between items-center sticky top-0 bg-white/90 backdrop-blur z-10">
              <h2 className="text-xl font-semibold flex items-center gap-2 text-slate-800">
                Chapter Notes
                {isGenerating && <span className="flex h-3 w-3 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                </span>}
              </h2>
              <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-slate-600">
                ✕
              </button>
            </div>
            
            <div className="p-6 prose prose-blue max-w-none text-slate-800">
              {/* Streamdown handles incomplete markdown and math tags cleanly */}
              <Streamdown plugins={{ math: mathPlugin }}>{content}</Streamdown>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
