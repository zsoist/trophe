import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  guardAiRoute: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  readMemory: vi.fn(),
  writeMemory: vi.fn(),
  executeAiTask: vi.fn(),
  invokeTextProvider: vi.fn(),
  markRetrieved: vi.fn(),
  retrieveKnowledge: vi.fn(),
}));

vi.mock('@/lib/api-guard', () => ({ guardAiRoute: mocks.guardAiRoute }));
vi.mock('@/db/client', () => ({ db: { insert: mocks.insert } }));
vi.mock('@/db/schema/agent_conversation', () => ({ agentConversation: {} }));
vi.mock('@/agents/memory/read', () => ({ readMemory: mocks.readMemory }));
vi.mock('@/agents/memory/write', () => ({ writeMemory: mocks.writeMemory }));
vi.mock('@/agents/runtime', () => ({ executeAiTask: mocks.executeAiTask }));
vi.mock('@/agents/runtime/providers/text', () => ({ invokeTextProvider: mocks.invokeTextProvider }));
vi.mock('@/agents/rag/retrieve', () => ({ retrieveKnowledge: mocks.retrieveKnowledge }));

import { POST } from '@/app/api/ai/conversation/route';

function request(body: unknown) {
  return new NextRequest('http://localhost/api/ai/conversation', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-request-id': 'request-1' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/ai/conversation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.guardAiRoute.mockResolvedValue({ ok: true, userId: 'user-1' });
    mocks.insert.mockReturnValue({ values: mocks.values });
    mocks.values.mockResolvedValue(undefined);
    mocks.markRetrieved.mockResolvedValue(undefined);
    mocks.readMemory.mockResolvedValue({
      systemPromptBlock: 'Approved memory context',
      chunks: [{ id: 'chunk-1', createdAt: new Date('2026-06-07T00:00:00Z') }],
      markRetrieved: mocks.markRetrieved,
    });
    mocks.retrieveKnowledge.mockResolvedValue({
      systemPromptBlock: 'Approved knowledge context',
      chunks: [{
        id: 'knowledge-1',
        documentId: 'document-1',
        source: 'protocol',
        createdAt: new Date('2026-06-06T00:00:00Z'),
      }],
    });
    mocks.executeAiTask.mockResolvedValue({
      generationId: 'generation-1',
      output: 'Eat a balanced meal.',
      estimatedCostUsd: 0.001,
      usage: { inputTokens: 100, outputTokens: 20 },
    });
    mocks.writeMemory.mockResolvedValue(undefined);
  });

  it('returns the guard response when authentication fails', async () => {
    const response = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    mocks.guardAiRoute.mockResolvedValueOnce({ ok: false, response });

    const result = await POST(request({ sessionId: 'session-1', message: 'hello' }));

    expect(result.status).toBe(401);
    expect(mocks.readMemory).not.toHaveBeenCalled();
  });

  it('rejects invalid conversation requests', async () => {
    const result = await POST(request({ sessionId: '', message: '' }));

    expect(result.status).toBe(400);
    expect(await result.json()).toEqual({ error: 'Invalid conversation request' });
    expect(mocks.executeAiTask).not.toHaveBeenCalled();
  });

  it('reads scoped memory, persists messages, and returns citations', async () => {
    const result = await POST(request({ sessionId: 'session-1', message: 'What should I eat?' }));

    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({
      message: 'Eat a balanced meal.',
      generationId: 'generation-1',
      memoryWriteStatus: 'completed',
      groundingStatus: 'uncited',
      citations: [
        { chunkId: 'chunk-1', source: 'memory', createdAt: '2026-06-07T00:00:00.000Z' },
        { chunkId: 'knowledge-1', documentId: 'document-1', source: 'protocol', createdAt: '2026-06-06T00:00:00.000Z' },
      ],
    });
    expect(mocks.readMemory).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      sessionId: 'session-1',
      agentName: 'conversation',
      scopes: ['user', 'session', 'agent'],
    }));
    expect(mocks.executeAiTask).toHaveBeenCalledWith(expect.objectContaining({
      task: 'coach_insight',
      context: expect.objectContaining({
        userId: 'user-1',
        requestId: 'request-1',
        metadata: expect.objectContaining({ memoryChunkIds: ['chunk-1'], knowledgeChunkIds: ['knowledge-1'] }),
      }),
    }));
    expect(mocks.values).toHaveBeenCalledTimes(2);
    expect(mocks.markRetrieved).toHaveBeenCalledOnce();
    expect(mocks.writeMemory).toHaveBeenCalledTimes(2);
  });
});
