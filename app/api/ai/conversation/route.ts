import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { guardAiRoute } from '@/lib/security/api-guard';
import { db } from '@/db/client';
import { agentConversation } from '@/db/schema/agent_conversation';
import { readMemory } from '@/agents/memory/read';
import { enqueueConversationMemory } from '@/agents/memory/queue';
import { executeAiTask } from '@/agents/runtime';
import { invokeTextProvider } from '@/agents/runtime/providers/text';
import { retrieveKnowledge } from '@/agents/rag/retrieve';
import { groundingStatus } from '@/agents/rag/grounding';

const requestSchema = z.object({
  sessionId: z.string().min(1).max(200),
  message: z.string().min(1).max(8_000),
});

const SYSTEM_PROMPT = `You are Trophe, a nutrition coaching assistant.
Use the approved memory context when relevant. Do not invent facts or medical diagnoses.
When context is insufficient, state what information is missing. Keep responses concise and actionable.`;

export async function POST(request: NextRequest) {
  const guard = await guardAiRoute(request);
  if (!guard.ok) return guard.response;

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid conversation request' }, { status: 400 });
  }
  const { sessionId, message } = parsed.data;
  const memory = await readMemory({
    userId: guard.userId,
    sessionId,
    agentName: 'conversation',
    queryText: message,
    scopes: ['user', 'session', 'agent'],
  });
  const knowledge = await retrieveKnowledge({
    requesterId: guard.userId,
    subjectUserId: guard.userId,
    queryText: message,
  });
  const systemPrompt = [SYSTEM_PROMPT, memory.systemPromptBlock, knowledge.systemPromptBlock].filter(Boolean).join('\n\n');

  await db.insert(agentConversation).values({
    userId: guard.userId, agentName: 'conversation', sessionId, role: 'user', content: message,
  });

  const generation = await executeAiTask({
    task: 'coach_insight',
    prompt: message,
    systemPrompt,
    context: {
      userId: guard.userId,
      requestId: request.headers.get('x-request-id') ?? undefined,
      metadata: {
        surface: 'conversation',
        sessionId,
        memoryChunkIds: memory.chunks.map((chunk) => chunk.id),
        knowledgeChunkIds: knowledge.chunks.map((chunk) => chunk.id),
      },
    },
    invoke: ({ policy, signal }) => invokeTextProvider({
      policy, signal, system: systemPrompt, prompt: message, userId: guard.userId,
    }),
  });

  await db.insert(agentConversation).values({
    userId: guard.userId,
    agentName: 'conversation',
    sessionId,
    role: 'assistant',
    content: generation.output,
    tokensIn: generation.usage.inputTokens,
    tokensOut: generation.usage.outputTokens,
    costUsd: generation.usage.actualCostUsd ?? generation.estimatedCostUsd,
  });
  await memory.markRetrieved();

  let memoryWriteStatus: 'queued' | 'degraded' = 'queued';
  try {
    await enqueueConversationMemory({ userId: guard.userId, sessionId, userMessage: message, assistantMessage: generation.output });
  } catch {
    memoryWriteStatus = 'degraded';
  }

  return NextResponse.json({
    message: generation.output,
    generationId: generation.generationId,
    memoryWriteStatus,
    groundingStatus: groundingStatus(generation.output, knowledge.chunks.map((chunk) => chunk.id)),
    citations: [
      ...memory.chunks.map((chunk) => ({
        chunkId: chunk.id, source: 'memory', createdAt: chunk.createdAt,
      })),
      ...knowledge.chunks.map((chunk) => ({
        chunkId: chunk.id, documentId: chunk.documentId, source: chunk.source, createdAt: chunk.createdAt,
      })),
    ],
  });
}
