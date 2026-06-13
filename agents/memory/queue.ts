import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { rawCaptures, type SelectRawCapture } from '@/db/schema/raw_captures';
import { writeMemory } from './write';

const MAX_ATTEMPTS = 5;
const LEASE_MINUTES = 10;

// Assistant turns rarely carry durable user-specific facts ("Here are 3 recipe
// ideas…"), yet each enqueued row costs a full memory_extract LLM call + embed
// just to decide "skip". Only enqueue an assistant turn when it plausibly states
// something worth remembering (a commitment, number, or dietary signal). The
// user turn is always enqueued. Audit 2026-06-13: ~halves memory-extract calls.
const ASSISTANT_FACT_SIGNAL =
  /\b(you (should|will|need|can|might)|let'?s|i'?ll set|target|recommend|plan|goal|allerg|avoid|increase|reduce|\d+\s*(g|kcal|cal|ml|kg|reps?|sets?))/i;

function assistantTurnWorthRemembering(text: string): boolean {
  return text.length >= 40 && ASSISTANT_FACT_SIGNAL.test(text);
}

export async function enqueueConversationMemory(input: {
  userId: string;
  sessionId: string;
  userMessage: string;
  assistantMessage: string;
}) {
  const rows = [
    { userId: input.userId, source: 'chat' as const, content: input.userMessage, metadata: { sessionId: input.sessionId, role: 'user' } },
  ];
  if (assistantTurnWorthRemembering(input.assistantMessage)) {
    rows.push({ userId: input.userId, source: 'chat' as const, content: input.assistantMessage, metadata: { sessionId: input.sessionId, role: 'assistant' } });
  }
  await db.insert(rawCaptures).values(rows);
}

async function claimMemoryCaptures(limit: number): Promise<SelectRawCapture[]> {
  const result = await db.execute<SelectRawCapture>(sql`
    WITH ready AS (
      SELECT id
      FROM raw_captures
      WHERE processed = false
        AND source = 'chat'
        AND processing_attempts < ${MAX_ATTEMPTS}
        AND (next_attempt_at IS NULL OR next_attempt_at <= now())
        AND (processing_started_at IS NULL OR processing_started_at < now() - (${LEASE_MINUTES} * interval '1 minute'))
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    UPDATE raw_captures AS capture
    SET processing_started_at = now(),
        processing_attempts = capture.processing_attempts + 1
    FROM ready
    WHERE capture.id = ready.id
    RETURNING capture.*
  `);
  return result.rows;
}

function retryDelaySeconds(attempt: number) {
  return Math.min(60 * 2 ** Math.max(0, attempt - 1), 3_600);
}

export async function processMemoryQueue(limit = 20) {
  const captures = await claimMemoryCaptures(Math.min(Math.max(limit, 1), 100));
  let completed = 0;
  let failed = 0;
  let deadLettered = 0;

  for (const capture of captures) {
    const metadata = capture.metadata as { sessionId?: string; role?: 'user' | 'assistant' } | null;
    try {
      await writeMemory({
        userId: capture.userId,
        sessionId: metadata?.sessionId ?? `capture:${capture.id}`,
        agentName: 'conversation',
        role: metadata?.role ?? 'user',
        content: capture.content,
      });
      await db.update(rawCaptures).set({
        processed: true,
        processedAt: new Date(),
        processingError: null,
        processingStartedAt: null,
        nextAttemptAt: null,
      }).where(and(eq(rawCaptures.id, capture.id), eq(rawCaptures.processed, false)));
      completed++;
    } catch (error) {
      const attempts = capture.processingAttempts;
      const isDeadLetter = attempts >= MAX_ATTEMPTS;
      await db.update(rawCaptures).set({
        processingError: error instanceof Error ? error.message.slice(0, 1_000) : 'Unknown memory processing error',
        processingStartedAt: null,
        nextAttemptAt: isDeadLetter ? null : new Date(Date.now() + retryDelaySeconds(attempts) * 1_000),
      }).where(and(eq(rawCaptures.id, capture.id), eq(rawCaptures.processed, false)));
      failed++;
      if (isDeadLetter) deadLettered++;
    }
  }
  return { claimed: captures.length, completed, failed, deadLettered };
}
