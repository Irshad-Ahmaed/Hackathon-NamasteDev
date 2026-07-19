'use client';

import React, { useState, useEffect, useRef } from 'react';
import type { Subject } from '@/hooks/useSubjectFilter';
import { UserButton } from '@clerk/nextjs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export interface ConversationItem {
  id: string;
  subject: Subject;
  chapterId?: string;
  title?: string;
  createdAt: string;
  lastMessage: string;
  lastMessageTime: string;
}

interface ChatPanelProps {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  loadingConversations: boolean;
  conversations: ConversationItem[];
  conversationId: string | undefined;
  selectConversation: (convo: ConversationItem) => void;
  handleNewChat: () => void;
  chapterNames: Record<Subject, Record<number, string>>;
  onRenameConversation: (id: string, newTitle: string) => Promise<void>;
  onDeleteConversation: (id: string) => Promise<void>;
  setIsNotesOpen: (open: boolean) => void;
}

export function ChatPanel({
  isSidebarOpen,
  setIsSidebarOpen,
  loadingConversations,
  conversations,
  conversationId,
  selectConversation,
  handleNewChat,
  chapterNames,
  onRenameConversation,
  onDeleteConversation,
  setIsNotesOpen
}: ChatPanelProps) {
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenuId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSaveRename = async (id: string) => {
    if (editTitle.trim()) {
      await onRenameConversation(id, editTitle.trim());
    }
    setEditingId(null);
  };

  const startRename = (convo: ConversationItem) => {
    const defaultTitle = convo.title || (convo.chapterId 
      ? (chapterNames[convo.subject][parseInt(convo.chapterId, 10)] || `Ch ${convo.chapterId}`)
      : 'All Chapters');
    setEditTitle(defaultTitle);
    setEditingId(convo.id);
    setActiveMenuId(null);
  };

  return (
    <aside className={`h-full flex flex-col bg-card/30 backdrop-blur-xl border-r border-white/10 transition-all duration-300 z-40 select-none ${
      isSidebarOpen 
        ? 'w-80 p-4 opacity-100' 
        : 'w-0 opacity-0 pointer-events-none md:w-16 md:p-3 md:opacity-100 md:pointer-events-auto'
    }`}>
      {/* Expanded Sidebar View */}
      {isSidebarOpen ? (
        <div className="flex flex-col h-full w-full overflow-hidden">
          {/* Header Row */}
          <div className="flex items-center justify-between mb-6 pt-2 shrink-0">
            <h2 className="font-bold text-lg tracking-tight text-foreground flex items-center gap-2">
              <span className="text-primary text-xl font-bold p-1 bg-primary/10 rounded-lg">✦</span>
              <span>StudyNotes+</span>
            </h2>
            <button 
              onClick={() => setIsSidebarOpen(false)}
              title="Collapse Sidebar"
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
          </div>

          {/* Action List (Icon + Name) */}
          <div className="space-y-1 mb-6 shrink-0">
            <button
              onClick={handleNewChat}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground transition-all cursor-pointer text-left"
            >
              <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              <span>Start New Chat</span>
            </button>

            <button
              onClick={() => setIsNotesOpen(true)}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground transition-all cursor-pointer text-left"
            >
              <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>Notes Canvas</span>
            </button>
          </div>

          <div className="border-t border-white/5 my-2 shrink-0" />

          {/* Chat History Header */}
          <div className="mb-2 px-1 pt-2 shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground opacity-60">Recent Chats</span>
          </div>

          {/* Chat List (scrollable) */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 no-scrollbar min-h-0">
            {loadingConversations ? (
              <div className="space-y-3">
                {[1, 2, 3].map(n => (
                  <div key={n} className="p-4 rounded-xl border border-white/5 animate-pulse bg-white/5 h-20" />
                ))}
              </div>
            ) : conversations.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground">
                No recent conversations
              </div>
            ) : (
              conversations.map(convo => {
                const isEditing = editingId === convo.id;
                return (
                  <div
                    key={convo.id}
                    onClick={() => {
                      if (!isEditing) selectConversation(convo);
                    }}
                    className={`p-3.5 rounded-xl cursor-pointer transition-all duration-200 border relative group ${
                      activeMenuId === convo.id ? 'z-30' : 'z-10'
                    } ${
                      conversationId === convo.id
                        ? 'bg-primary/10 border-primary/30 text-foreground shadow-[0_0_15px_rgba(var(--color-primary),0.05)]'
                        : 'hover:bg-white/5 border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {/* Render Chat Item */}
                    <div className="flex justify-between items-start mb-1 gap-2 pr-6">
                      <span className="font-semibold text-[10px] tracking-wide uppercase opacity-75">
                        {convo.subject === 'mathematics' ? '📐 Math' : '🔬 Science'}
                      </span>
                      <span className="text-[9px] opacity-60 shrink-0">
                        {new Date(convo.lastMessageTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {isEditing ? (
                      <div className="flex gap-2 mt-1" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRename(convo.id);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          autoFocus
                          className="flex-1 text-xs bg-white/10 border border-white/20 rounded px-2 py-1 text-foreground focus:outline-none focus:border-primary/50"
                        />
                        <button
                          onClick={() => handleSaveRename(convo.id)}
                          className="p-1 hover:bg-white/10 rounded text-green-400"
                          title="Save"
                        >
                          ✓
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="p-1 hover:bg-white/10 rounded text-red-400"
                          title="Cancel"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <h4 className="font-bold text-sm truncate text-foreground pr-6">
                        {convo.title || (convo.chapterId 
                          ? (chapterNames[convo.subject][parseInt(convo.chapterId, 10)] || `Ch ${convo.chapterId}`)
                          : 'All Chapters')}
                      </h4>
                    )}

                    <p className="text-xs truncate opacity-70 mt-1 pr-6">
                      {convo.lastMessage || 'New conversation'}
                    </p>

                    {!isEditing && (
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuId(activeMenuId === convo.id ? null : convo.id);
                          }}
                          className="p-1 text-muted-foreground hover:text-foreground hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                          title="Actions"
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                          </svg>
                        </button>
                        {activeMenuId === convo.id && (
                          <div
                            ref={menuRef}
                            className="absolute right-0 mt-1 bg-neutral-900 border border-white/10 rounded-xl shadow-2xl p-1 z-50 text-xs w-36 text-left backdrop-blur-xl"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => startRename(convo)}
                              className="w-full text-left px-3 py-2 hover:bg-white/10 rounded-lg transition-colors flex items-center gap-2 text-foreground font-medium"
                            >
                              ✏️ Rename
                            </button>
                            <button
                              onClick={() => {
                                setDeleteId(convo.id);
                                setActiveMenuId(null);
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors flex items-center gap-2 font-medium"
                            >
                              🗑️ Delete
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="border-t border-white/5 my-3 shrink-0" />

          {/* Bottom Actions (Profile) */}
          <div className="space-y-3 shrink-0 pt-1">

            <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.02] border border-white/5">
              <UserButton />
              <div className="flex flex-col overflow-hidden">
                <span className="text-xs font-semibold text-foreground truncate">My Profile</span>
                <span className="text-[10px] text-muted-foreground truncate">Account & Settings</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Collapsed Sidebar View (Shows Icons Only) */
        <div className="flex flex-col h-full w-full justify-between items-center overflow-hidden py-2">
          {/* Top Collapsed actions */}
          <div className="flex flex-col items-center gap-5 w-full">
            {/* Logo */}
            <div className="text-primary text-xl font-bold p-2 bg-primary/10 rounded-2xl w-10 h-10 flex items-center justify-center shadow-md shadow-primary/20" title="StudyNotes+">
              ✦
            </div>

            {/* Expand Toggler Button */}
            <button
              onClick={() => setIsSidebarOpen(true)}
              title="Expand Sidebar"
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-white/5 rounded-xl transition-all cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <div className="border-b border-white/5 w-8 my-1" />

            {/* New Chat Button */}
            <button
              onClick={handleNewChat}
              title="Start New Chat"
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-white/5 rounded-xl transition-all cursor-pointer"
            >
              <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
            </button>

            {/* Notes Canvas Button */}
            <button
              onClick={() => setIsNotesOpen(true)}
              title="Notes Canvas"
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-white/5 rounded-xl transition-all cursor-pointer"
            >
              <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </button>
          </div>

          {/* Bottom Collapsed actions */}
          <div className="flex flex-col items-center gap-5 w-full">


            {/* Profile */}
            <div className="hover:scale-105 transition-transform duration-200 cursor-pointer">
              <UserButton />
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      <AlertDialog open={deleteId !== null} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this conversation and all associated messages. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (deleteId) {
                  await onDeleteConversation(deleteId);
                  setDeleteId(null);
                }
              }}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}
