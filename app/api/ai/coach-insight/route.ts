import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { guardAiRoute } from '@/lib/security/api-guard';
import { canAccessClient } from '@/lib/auth/tenant-access';
import { db } from '@/db/client';
import { profiles } from '@/db/schema/profiles';
import { eq } from 'drizzle-orm';
import { readMemory } from '@/agents/memory/read';
import { loadCoachBlocks } from '@/agents/memory/coach-blocks';
import { retrieveKnowledge } from '@/agents/rag/retrieve';
import { buildClientSnapshot } from '@/agents/context/client-snapshot';
import { executeAiTask } from '@/agents/runtime';
import { invokeTextProvider } from '@/agents/runtime/providers/text';
import { groundingStatus } from '@/agents/rag/grounding';

const requestSchema = z.object({
  clientId: z.string().uuid(),
  question: z.string().min(1).max(8_000),
  organizationId: z.string().uuid().optional(),
});

const SYSTEM_PROMPT = `You are Trophe's coach insight assistant.
Answer only from approved client memory, coach blocks, and knowledge context.
Do not diagnose medical conditions. Identify missing information and cite knowledge claims using supplied citation IDs.`;

export async function POST(request: NextRequest) {
  const guard = await guardAiRoute(request);
  if (!guard.ok) return guard.response;
  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid coach insight request' }, { status: 400 });
  const { clientId, question, organizationId } = parsed.data;
  const [actor] = await db.select({ role: profiles.role }).from(profiles).where(eq(profiles.id, guard.userId)).limit(1);
  // Positive allowlist, not a negative `!== 'client'` check — a future role
  // (e.g. 'viewer') must not silently inherit coach AI access (audit 2026-06-13).
  if (!actor || !['coach', 'admin', 'super_admin'].includes(actor.role)) {
    return NextResponse.json({ error: 'Coach access required' }, { status: 403 });
  }
  if (!(await canAccessClient(db, guard.userId, actor.role, clientId))) {
    return NextResponse.json({ error: 'Client access denied' }, { status: 403 });
  }

  const [memory, coachBlocks, knowledge, snapshot] = await Promise.all([
    readMemory({ userId: clientId, queryText: question, agentName: 'coach_insight', scopes: ['user', 'agent'] }),
    loadCoachBlocks({ clientId }),
    retrieveKnowledge({ requesterId: guard.userId, subjectUserId: clientId, organizationId, queryText: question }),
    // Live structured state: assessment, intake answers, 14d logs vs targets,
    // daily signals, weight trend, habit streak — assembled fresh per request.
    buildClientSnapshot(clientId),
  ]);
  const systemPrompt = [SYSTEM_PROMPT, snapshot.systemPromptBlock, coachBlocks.systemPromptBlock, memory.systemPromptBlock, knowledge.systemPromptBlock]
    .filter(Boolean)
    .join('\n\n');
  const generation = await executeAiTask({
    task: 'coach_insight',
    prompt: question,
    systemPrompt,
    context: {
      userId: guard.userId,
      organizationId,
      requestId: request.headers.get('x-request-id') ?? undefined,
      metadata: {
        surface: 'coach_insight',
        clientId,
        memoryChunkIds: memory.chunks.map((chunk) => chunk.id),
        knowledgeChunkIds: knowledge.chunks.map((chunk) => chunk.id),
      },
    },
    invoke: ({ policy, signal }) => invokeTextProvider({ policy, signal, system: systemPrompt, prompt: question, userId: guard.userId }),
  });
  await memory.markRetrieved();

  return NextResponse.json({
    insight: generation.output,
    generationId: generation.generationId,
    groundingStatus: groundingStatus(generation.output, knowledge.chunks.map((chunk) => chunk.id)),
    citations: knowledge.chunks.map((chunk) => ({
      chunkId: chunk.id,
      documentId: chunk.documentId,
      source: chunk.source,
      createdAt: chunk.createdAt,
    })),
  });
}
