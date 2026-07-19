import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Legacy notes endpoints — RETIRED.
//
// GET previously served/generated a shared chapter-level note and POST wrote a
// student's edits into the shared `notes` cache (a cross-user data leak). All of
// that behavior now lives in server-only code:
//   - Approved-Qdrant retrieval + generation: lib/notes/generation-service.ts
//   - Private, user/tenant-scoped documents:   /api/note-documents/*
//
// Both methods now return 410 Gone so any stale client fails loudly instead of
// silently reading or corrupting shared content.

const GONE = {
  error: 'This endpoint has been retired. Use /api/note-documents instead.',
  code: 'ENDPOINT_RETIRED',
};

export async function GET() {
  return NextResponse.json(GONE, { status: 410 });
}

export async function POST() {
  return NextResponse.json(GONE, { status: 410 });
}
