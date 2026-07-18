'use client';
import { useState } from 'react';

export type Subject = 'mathematics' | 'science';
export type Mode = 'explain' | 'solve' | 'notes' | 'quiz';

export function useSubjectFilter() {
  const [subject, setSubject] = useState<Subject>('mathematics');
  const [chapterId, setChapterId] = useState<string | undefined>();
  const [mode, setMode] = useState<Mode>('explain');
  return { subject, setSubject, chapterId, setChapterId, mode, setMode };
}
