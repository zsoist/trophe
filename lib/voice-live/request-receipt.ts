import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { db } from '@/db/client';
import { z } from 'zod';

export function liveAttemptId(actorId: string, requestId: string) {
  const digest = createHash('sha256').update(['gpt-live-attempt.v1', actorId, requestId].join('\0')).digest('hex');
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

const receiptSchema = z.object({ sessionId: z.string().min(1).max(256), conversationId: z.string().uuid(), answerSdp: z.string().min(1).max(65_536), deadlineMs: z.number().int().positive() }).strict();
export type LiveRequestReceipt =
  | { state: 'absent' | 'pending' | 'ended' | 'conflict' }
  | { state: 'active'; sessionId: string; conversationId: string; answerSdp: string; deadlineMs: number };

/** Read-only recovery of an actor-bound create request; never dispatches. */
export async function readLiveRequestReceipt(database: typeof db, actorId: string, requestId: string, expectedHash?: string): Promise<LiveRequestReceipt> {
  const rows = await database.execute<{ hash: string; state: string; receipt: unknown }>(sql`
    SELECT metadata->'coachPilot'->'binding'->>'requestHash' AS hash,
      metadata->'coachPilot'->>'state' AS state,metadata->'gptLive' AS receipt
    FROM public.agent_runs WHERE id=${liveAttemptId(actorId, requestId)}::uuid AND user_id=${actorId}::uuid AND model='gpt-live-1' LIMIT 1`);
  const row = rows.rows[0];
  if (!row) return { state: 'absent' };
  if (expectedHash && row.hash !== expectedHash) return { state: 'conflict' };
  if (['settled', 'released'].includes(row.state)) return { state: 'ended' };
  if (row.state === 'unknown') return { state: 'pending' };
  const receipt = receiptSchema.safeParse(row.receipt);
  if (!receipt.success) return { state: 'pending' };
  if (receipt.data.deadlineMs <= Date.now()) return { state: 'pending' };
  return { state: 'active', ...receipt.data };
}
