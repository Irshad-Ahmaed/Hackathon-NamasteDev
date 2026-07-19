/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock the DB before importing the service under test.
vi.mock('../../lib/db', () => ({
  sql: vi.fn(),
}));

import { sql } from '../../lib/db';
import {
  loadDocumentById,
  saveManualEdit,
  commitRevision,
} from '../../server/note-document-service';

const OWNED_ROW = {
  id: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
  tenant_id: 'ten_1',
  user_id: 'usr_1',
  source_note_id: null,
  subject: 'mathematics',
  chapter_number: 6,
  language: 'en',
  content: 'original',
  revision: 4,
  updated_at: '2026-07-19T00:00:00Z',
};

describe('note-document-service ownership + revision safety', () => {
  beforeEach(() => vi.clearAllMocks());

  test('loadDocumentById returns 404 when not owned by user/tenant', async () => {
    vi.mocked(sql).mockImplementation((async () => []) as any);
    await expect(loadDocumentById(OWNED_ROW.id, 'other_user', 'ten_1')).rejects.toMatchObject({ statusCode: 404 });
  });

  test('loadDocumentById returns the mapped document when owned', async () => {
    vi.mocked(sql).mockImplementation((async () => [OWNED_ROW]) as any);
    const doc = await loadDocumentById(OWNED_ROW.id, 'usr_1', 'ten_1');
    expect(doc.revision).toBe(4);
    expect(doc.tenantId).toBe('ten_1');
  });

  test('saveManualEdit throws 409 on a stale expectedRevision', async () => {
    // First call = ownership load (revision 4). expectedRevision 3 is stale.
    vi.mocked(sql).mockImplementation((async () => [OWNED_ROW]) as any);
    await expect(
      saveManualEdit({ id: OWNED_ROW.id, userId: 'usr_1', tenantId: 'ten_1', content: 'x', expectedRevision: 3 })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  test('saveManualEdit succeeds and increments revision when expectedRevision matches', async () => {
    let call = 0;
    vi.mocked(sql).mockImplementation((async () => {
      call += 1;
      if (call === 1) return [OWNED_ROW]; // ownership load
      if (call === 2) return []; // archive insert
      return [{ ...OWNED_ROW, content: 'x', revision: 5 }]; // update returning
    }) as any);

    const updated = await saveManualEdit({
      id: OWNED_ROW.id,
      userId: 'usr_1',
      tenantId: 'ten_1',
      content: 'x',
      expectedRevision: 4,
    });
    expect(updated.revision).toBe(5);
    expect(updated.content).toBe('x');
  });

  test('commitRevision archives prior and bumps revision', async () => {
    let call = 0;
    vi.mocked(sql).mockImplementation((async () => {
      call += 1;
      if (call === 1) return [OWNED_ROW]; // load
      if (call === 2) return []; // archive
      return [{ ...OWNED_ROW, content: 'ai', revision: 5 }];
    }) as any);

    const updated = await commitRevision({ id: OWNED_ROW.id, userId: 'usr_1', tenantId: 'ten_1', content: 'ai', expectedRevision: 4 });
    expect(updated.revision).toBe(5);
    expect(updated.content).toBe('ai');
  });

  test('commitRevision throws 409 when the revision moved during streaming', async () => {
    // Ownership load reports revision 4, but the caller expected 3 (a concurrent
    // save landed while the AI stream was in flight).
    vi.mocked(sql).mockImplementation((async () => [OWNED_ROW]) as any);
    await expect(
      commitRevision({ id: OWNED_ROW.id, userId: 'usr_1', tenantId: 'ten_1', content: 'ai', expectedRevision: 3 })
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
