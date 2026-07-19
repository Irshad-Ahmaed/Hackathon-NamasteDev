/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { GET, PATCH } from '../../app/api/feedback/route';
import { auth } from '@clerk/nextjs/server';
import { sql } from '../../lib/db';
import { NextRequest } from 'next/server';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

vi.mock('../../lib/db', () => ({
  sql: vi.fn(),
}));

vi.mock('../../lib/privacy-utils', () => ({
  decryptText: vi.fn((text) => `decrypted-${text}`),
}));

vi.mock('../../lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Feedback API - GET Queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should return 401 when clerk session is missing', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as any);

    const response = await GET();
    expect(response.status).toBe(401);
  });

  test('should return 403 when user is not admin or teacher', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: 'user_1' } as any);
    // Mock user exists but is a student
    vi.mocked(sql).mockImplementation((async (strings: TemplateStringsArray) => {
      if (strings[0].includes('FROM users')) {
        return [{ role: 'student' }];
      }
      return [];
    }) as any);

    const response = await GET();
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toBe('Forbidden');
  });

  test('should return list of unreviewed feedback with decrypted content for admin', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: 'user_admin' } as any);
    vi.mocked(sql).mockImplementation((async (strings: TemplateStringsArray) => {
      if (strings[0].includes('FROM users')) {
        return [{ role: 'teacher' }];
      }
      if (strings[0].includes('FROM feedback')) {
        return [{
          id: 'feedback_1',
          message_id: 'msg_1',
          type: 'incorrect',
          reported_at: '2026-07-19T00:00:00Z',
          resolution: null,
          message_content: 'encrypted_data',
          encryption_version: 'v1'
        }];
      }
      return [];
    }) as any);

    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveLength(1);
    expect(data[0].messageContent).toBe('decrypted-encrypted_data');
  });
});

describe('Feedback API - PATCH Resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should update feedback resolution comment and return 200', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: 'user_admin' } as any);
    vi.mocked(sql).mockImplementation((async (strings: TemplateStringsArray) => {
      if (strings[0].includes('FROM users')) {
        return [{ role: 'super_admin' }];
      }
      if (strings[0].includes('UPDATE feedback')) {
        return [{ id: 'feedback_1' }];
      }
      return [];
    }) as any);

    const mockReq = new NextRequest('http://localhost/api/feedback', {
      method: 'PATCH',
      body: JSON.stringify({ feedbackId: 'feedback_1', resolution: 'Resolved typo issue' }),
    });

    const response = await PATCH(mockReq);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });
});
describe('Feedback API - POST Submission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should return 409 when feedback already submitted for same message+user+type', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: 'user_student' } as any);
    vi.mocked(sql).mockImplementation((async (strings: TemplateStringsArray) => {
      if (strings[0].includes('FROM users')) {
        return [{ id: 'internal_uuid_1' }];
      }
      if (strings[0].includes('JOIN conversations')) {
        // message ownership check
        return [{ id: 'msg_1' }];
      }
      if (strings[0].includes('INSERT INTO feedback')) {
        // Simulates ON CONFLICT DO NOTHING returning 0 rows
        return [];
      }
      return [];
    }) as any);

    const { POST } = await import('../../app/api/feedback/route');
    const mockReq = new NextRequest('http://localhost/api/feedback', {
      method: 'POST',
      body: JSON.stringify({ messageId: 'msg_1', type: 'helpful' }),
    });

    const response = await POST(mockReq);
    expect(response.status).toBe(409);
    const data = await response.json();
    expect(data.error).toBe('Feedback already submitted for this message');
  });
});
