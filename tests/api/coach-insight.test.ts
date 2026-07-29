import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  guardAiRoute: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  canAccessClient: vi.fn(),
  assertCanAccessClient: vi.fn(),
  readMemory: vi.fn(),
  loadCoachBlocks: vi.fn(),
  retrieveKnowledge: vi.fn(),
  buildClientSnapshot: vi.fn(),
  executeAiTask: vi.fn(),
  invokeTextProvider: vi.fn(),
  markRetrieved: vi.fn(),
}));

vi.mock('@/lib/security/api-guard', () => ({ guardAiRoute: mocks.guardAiRoute }));
vi.mock('@/lib/auth/tenant-access', () => ({
  canAccessClient: mocks.canAccessClient,
  assertCanAccessClient: mocks.assertCanAccessClient,
}));
vi.mock('@/db/client', () => ({ db: { select: mocks.select } }));
vi.mock('@/db/schema/profiles', () => ({ profiles: { id: 'id', role: 'role' } }));
vi.mock('@/agents/memory/read', () => ({ readMemory: mocks.readMemory }));
vi.mock('@/agents/memory/coach-blocks', () => ({ loadCoachBlocks: mocks.loadCoachBlocks }));
vi.mock('@/agents/rag/retrieve', () => ({ retrieveKnowledge: mocks.retrieveKnowledge }));
vi.mock('@/agents/context/client-snapshot', () => ({ buildClientSnapshot: mocks.buildClientSnapshot }));
vi.mock('@/agents/runtime', () => ({ executeAiTask: mocks.executeAiTask }));
vi.mock('@/agents/runtime/providers/text', () => ({ invokeTextProvider: mocks.invokeTextProvider }));

import { POST } from '@/app/api/ai/coach-insight/route';

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';

function request(body: string) {
  return new NextRequest('http://localhost/api/ai/coach-insight', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
}

describe('POST /api/ai/coach-insight boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.guardAiRoute.mockResolvedValue({ ok: true, userId: 'coach-1' });
    mocks.select.mockReturnValue({ from: mocks.from });
    mocks.from.mockReturnValue({ where: mocks.where });
    mocks.where.mockReturnValue({ limit: mocks.limit });
    mocks.limit.mockResolvedValue([{ role: 'coach' }]);
    mocks.canAccessClient.mockResolvedValue(true);
    mocks.markRetrieved.mockResolvedValue(undefined);
    mocks.readMemory.mockResolvedValue({
      systemPromptBlock: '',
      chunks: [],
      markRetrieved: mocks.markRetrieved,
    });
    mocks.loadCoachBlocks.mockResolvedValue({ systemPromptBlock: '' });
    mocks.retrieveKnowledge.mockResolvedValue({
      systemPromptBlock: '',
      chunks: [],
    });
    mocks.buildClientSnapshot.mockResolvedValue({ systemPromptBlock: '' });
    mocks.executeAiTask.mockResolvedValue({
      generationId: 'generation-1',
      output: 'Keep the current plan.',
    });
  });

  it('returns 400 for malformed JSON without reading client context', async () => {
    const result = await POST(request('{'));

    expect(result.status).toBe(400);
    expect(await result.json()).toEqual({ error: 'Invalid coach insight request' });
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.readMemory).not.toHaveBeenCalled();
    expect(mocks.executeAiTask).not.toHaveBeenCalled();
  });

  it('returns 403 for an inaccessible client without starting AI work', async () => {
    mocks.canAccessClient.mockResolvedValueOnce(false);
    mocks.assertCanAccessClient.mockRejectedValueOnce(new Error('FORBIDDEN'));

    const result = await POST(request(JSON.stringify({
      clientId: CLIENT_ID,
      question: 'What should change?',
    })));

    expect(result.status).toBe(403);
    expect(await result.json()).toEqual({ error: 'Client access denied' });
    expect(mocks.canAccessClient).toHaveBeenCalledWith(
      expect.anything(),
      'coach-1',
      'coach',
      CLIENT_ID,
    );
    expect(mocks.readMemory).not.toHaveBeenCalled();
    expect(mocks.executeAiTask).not.toHaveBeenCalled();
  });

  it('returns stable retry copy when context or generation fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.executeAiTask.mockRejectedValueOnce(new Error('private provider detail'));

    const result = await POST(request(JSON.stringify({
      clientId: CLIENT_ID,
      question: 'What should change?',
    })));
    const body = await result.json();

    expect(result.status).toBe(503);
    expect(body).toEqual({
      error: 'Coach insight is temporarily unavailable — please try again.',
    });
    expect(JSON.stringify(body)).not.toContain('private provider detail');
    expect(mocks.markRetrieved).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
