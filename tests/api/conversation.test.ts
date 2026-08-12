import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  guardAiRoute: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  readMemory: vi.fn(),
  enqueueConversationMemory: vi.fn(),
  executeAiTask: vi.fn(),
  invokeTextProvider: vi.fn(),
  markRetrieved: vi.fn(),
  retrieveKnowledge: vi.fn(),
}));

vi.mock('@/lib/security/api-guard', () => ({ guardAiRoute: mocks.guardAiRoute }));
vi.mock('@/db/client', () => ({ db: { insert: mocks.insert } }));
vi.mock('@/db/schema/agent_conversation', () => ({ agentConversation: {} }));
vi.mock('@/agents/memory/read', () => ({ readMemory: mocks.readMemory }));
vi.mock('@/agents/memory/queue', () => ({ enqueueConversationMemory: mocks.enqueueConversationMemory }));
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
    mocks.enqueueConversationMemory.mockResolvedValue(undefined);
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

  it('returns 400 for malformed JSON without starting AI work', async () => {
    const malformed = new NextRequest('http://localhost/api/ai/conversation', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });

    const result = await POST(malformed);

    expect(result.status).toBe(400);
    expect(await result.json()).toEqual({ error: 'Invalid conversation request' });
    expect(mocks.readMemory).not.toHaveBeenCalled();
    expect(mocks.executeAiTask).not.toHaveBeenCalled();
  });

  it('reads scoped memory, persists messages, and returns citations', async () => {
    const result = await POST(request({ sessionId: 'session-1', message: 'What should I eat?' }));

    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({
      message: 'Eat a balanced meal.',
      generationId: 'generation-1',
      memoryWriteStatus: 'queued',
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
    expect(mocks.values).toHaveBeenCalledOnce();
    expect(mocks.values).toHaveBeenCalledWith([
      expect.objectContaining({ role: 'user', content: 'What should I eat?' }),
      expect.objectContaining({ role: 'assistant', content: 'Eat a balanced meal.' }),
    ]);
    expect(mocks.markRetrieved).toHaveBeenCalledOnce();
    expect(mocks.enqueueConversationMemory).toHaveBeenCalledWith({
      userId: 'user-1',
      sessionId: 'session-1',
      userMessage: 'What should I eat?',
      assistantMessage: 'Eat a balanced meal.',
    });
  });

  it('returns the answer with degraded memory status when queueing fails', async () => {
    mocks.enqueueConversationMemory.mockRejectedValueOnce(new Error('queue unavailable'));

    const result = await POST(request({ sessionId: 'session-1', message: 'What should I eat?' }));

    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({
      message: 'Eat a balanced meal.',
      memoryWriteStatus: 'degraded',
    });
  });

  it('returns a stable 503 and persists no orphan turn when generation fails', async () => {
    mocks.executeAiTask.mockRejectedValueOnce(new Error('provider detail'));

    const result = await POST(request({
      sessionId: 'session-1',
      message: 'What should I eat?',
    }));

    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({
      error: 'The conversation assistant is temporarily unavailable — please try again.',
    });
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.markRetrieved).not.toHaveBeenCalled();
    expect(mocks.enqueueConversationMemory).not.toHaveBeenCalled();
  });
});
