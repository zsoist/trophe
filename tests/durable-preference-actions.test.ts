import { randomUUID } from 'node:crypto';
import { PgDialect } from 'drizzle-orm/pg-core';
import { expect, it, vi } from 'vitest';
import type { db } from '@/db/client';
import { createDurablePreferenceService } from '@/lib/workout/durable-preference-actions';

const actorId = randomUUID(), organizationId = randomUUID(), conversationId = randomUUID();
const receipt = { id: randomUUID(), actionId: randomUUID(), proposalId: randomUUID(), status: 'applied', resourceVersion: '2', recordedAt: '2026-09-07T00:00:00Z' };
const stored = { subject_id: actorId, organization_id: organizationId, conversation_id: conversationId, proposal_id: receipt.proposalId, request_hash: 'a'.repeat(64), resource_version: '1', result: receipt, action: 'preference.update', resource_kind: 'preference', resource_id: actorId };
async function recover(row: typeof stored | null) {
  const queries: string[] = [];
  const execute = vi.fn(async (query: Parameters<PgDialect['sqlToQuery']>[0]) => {
    const text = new PgDialect().sqlToQuery(query).sql;
    queries.push(text);
    if (text.includes('FROM public.client_profiles')) return { rows: [{ actor_role: 'client', workout_preferences: {} }] };
    if (text.includes('FROM private.coach_action_receipts')) return { rows: row ? [row] : [] };
    return { rows: [] };
  });
  const database = { transaction: async (work: (tx: { execute: typeof execute }) => Promise<unknown>) => work({ execute }) } as unknown as typeof db;
  const result = await createDurablePreferenceService(database).execute({ actorId, subjectId: actorId, organizationId, signal: new AbortController().signal,
    operation: { version: 'coach-assistant.v2', operation: 'receipt', actionId: receipt.actionId, conversationId, turnId: randomUUID() } });
  return { result, queries };
}
it('returns a matching preference receipt after joining its authorized proposal scope', async () => {
  const { result, queries } = await recover(stored);
  expect(result).toMatchObject({ ok: true, receipt });
  expect(queries.find(query => query.includes('FROM private.coach_action_receipts'))).toContain('p.organization_id = r.organization_id AND p.conversation_id = r.conversation_id');
  expect(queries.some(query => /INSERT|UPDATE public/.test(query))).toBe(false);
});
it.each([
  { action: 'food.quantity.update', resource_kind: 'food_entry' },
  { resource_id: randomUUID() },
  { resource_kind: 'food_entry' },
  { action: null },
])('rejects replay from a different action/resource or missing proposal binding: %j', async patch => {
  const { result, queries } = await recover({ ...stored, ...patch } as typeof stored);
  expect(result).toMatchObject({ ok: false, error: 'idempotency_conflict' });
  expect(queries.some(query => /INSERT|UPDATE public/.test(query))).toBe(false);
});
