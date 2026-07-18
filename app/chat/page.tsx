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
const ChatMessage = React.memo(({ message }: { message: Message }) => {
  return (
    <div className={`p-4 my-2 rounded-xl ${message.role === 'user' ? 'bg-primary text-primary-foreground ml-auto max-w-[80%]' : 'bg-muted text-foreground mr-auto max-w-[100%]'}`}>
      <div className="font-semibold text-sm mb-1 opacity-70">
        {message.role === 'user' ? 'You' : 'Tutor'}
      </div>
      <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none">
        <Streamdown plugins={{ math: mathPlugin }}>{message.content}</Streamdown>
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
    </div>
  );
});
ChatMessage.displayName = 'ChatMessage';

export default function ChatPage() {
  const { subject, setSubject, mode, setMode } = useSubjectFilter();
  const { messages, sendMessage, streaming, cancel } = useChat(subject, 'en');
  const [inputText, setInputText] = useState('');
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [notesContent, setNotesContent] = useState('');
  
  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (streaming || !inputText.trim()) return;
    
    // If asking for notes, open the canvas and let the chat display it there
    if (mode === 'notes') {
      setIsNotesOpen(true);
      setNotesContent('');
    }
    
    sendMessage(inputText, { mode });
    setInputText('');
  };
  
  const activeMessage = messages.find(m => m.streaming && m.role === 'assistant');
  if (activeMessage && mode === 'notes') {
    // Keep NotesCanvas content in sync
    if (notesContent !== activeMessage.content) {
      setNotesContent(activeMessage.content);
    }
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="flex-none flex items-center justify-between p-4 border-b bg-card text-card-foreground shadow-sm">
        <div className="font-bold text-xl flex items-center gap-2">
          <span className="text-primary">✦</span> CBSE Tutor
        </div>
        
        <div className="flex items-center gap-4">
          <select 
            value={subject} 
            onChange={(e) => setSubject(e.target.value as Subject)}
            className="bg-secondary text-secondary-foreground text-sm rounded-md border-none p-2 focus:ring-2 focus:ring-ring"
          >
            <option value="mathematics">Mathematics</option>
            <option value="science">Science</option>
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
            className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 transition-colors shadow-sm"
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
            <ChatMessage key={msg.id} message={msg} />
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
        content={mode === 'notes' ? (activeMessage?.content || notesContent) : notesContent} 
        isGenerating={streaming && mode === 'notes'}
      />
    </div>
  );
}
