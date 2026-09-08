import { describe, expect, it } from 'vitest';
import { ProgressController, type ProgressTransport } from '@/components/assistant/progress-state';
import type { ProgressOperation } from '@/agents/coach-assistant/progress-actions';

const subjectId = '00000000-0000-4000-8000-000000000001';
const proposalId = '00000000-0000-4000-8000-000000000002';
const receiptId = '00000000-0000-4000-8000-000000000003';
const after = { measuredDate: '2026-09-07', weightKg: 75.5, bodyFatPct: 18.2, waistCm: 82 };

function fixture() {
  let stored = false;
  let lost = true;
  let actionId = '';
  const operations: ProgressOperation[] = [];
  const transport: ProgressTransport = async operation => {
    operations.push(operation);
    if (operation.operation === 'progress.read') return {
      version: 'coach-assistant.v2', storage: 'database', ok: true,
      snapshot: { subjectId, version: stored ? '2' : '1', window: { start: '2026-06-10', end: '2026-09-07', timezone: 'America/Bogota', days: operation.days }, measurements: stored ? [{ id: proposalId, ...after }] : [], trends: [], truncated: false, duplicateRowsDropped: 0, invalidValuesExcluded: 0, limitations: [] },
    };
    if (operation.operation === 'measurement.propose') return {
      version: 'coach-assistant.v2', storage: 'database', ok: true,
      proposal: { id: proposalId, hash: 'a'.repeat(64), action: 'measurement.create', resource: { kind: 'measurement', id: proposalId, version: '1' }, before: null, after, precondition: '1', expiresAt: new Date(Date.now() + 300_000).toISOString(), reviewRequired: true, inputSource: 'explicit_user' },
    };
    if (operation.operation === 'measurement.apply') {
      stored = true; actionId = operation.actionId;
      if (lost) throw new Error('lost_response');
    }
    if (operation.operation === 'measurement.receipt' && operation.actionId !== actionId) return { version: 'coach-assistant.v2', storage: 'database', ok: false, error: 'not_found' };
    return { version: 'coach-assistant.v2', storage: 'database', ok: true, receipt: { id: receiptId, actionId, proposalId, status: 'applied', resourceVersion: '2', recordedAt: new Date().toISOString(), action: 'measurement.create' }, refresh: { measurementId: proposalId, measuredDate: after.measuredDate, previousVersion: '1', version: '2', strategy: 'refetch' } };
  };
  return { transport, operations, acknowledge: () => { lost = false; } };
}

describe('ProgressController', () => {
  it('discards an unconfirmed proposal before adopting a new conversation', async () => {
    const f = fixture(); const controller = new ProgressController(); const firstConversation = crypto.randomUUID(); const nextConversation = crypto.randomUUID();
    controller.select(subjectId, firstConversation); await controller.read(f.transport, 90); await controller.propose(after, f.transport);

    expect(controller.snapshot().proposal).not.toBeNull();
    expect(controller.moveConversation(nextConversation)).toBe(true);
    expect(controller.snapshot()).toMatchObject({ proposal: null, pending: false, uncertain: false, error: null });

    await controller.apply(f.transport);
    expect(f.operations.filter(item => item.operation === 'measurement.apply')).toHaveLength(0);
    await controller.propose(after, f.transport);
    expect(f.operations.at(-1)).toMatchObject({ operation: 'measurement.propose', conversationId: nextConversation });
  });

  it('reviews exact explicit values, stays uncertain after lost response, and recovers without another apply', async () => {
    const f = fixture(); const controller = new ProgressController(); const conversationId = crypto.randomUUID();
    controller.select(subjectId, conversationId); await controller.read(f.transport, 90);
    await controller.propose(after, f.transport);
    expect(controller.snapshot().proposal).toMatchObject({ before: null, after, precondition: '1' });
    await controller.apply(f.transport);
    expect(controller.snapshot()).toMatchObject({ uncertain: true, receipt: null });
    const nextConversation = crypto.randomUUID();
    expect(controller.moveConversation(nextConversation)).toBe(false);
    f.acknowledge(); await controller.check(f.transport);
    const applied = f.operations.find(item => item.operation === 'measurement.apply') as Extract<ProgressOperation, { operation: 'measurement.apply' }>;
    expect(controller.snapshot()).toMatchObject({ uncertain: false, receipt: { actionId: applied.actionId }, snapshot: { version: '2', measurements: [{ id: proposalId, ...after }] } });
    expect(f.operations.filter(item => item.operation === 'measurement.apply')).toHaveLength(1);
    expect(f.operations.slice(-2).map(item => item.operation)).toEqual(['measurement.receipt', 'progress.read']);
    expect((f.operations.at(-2) as Extract<ProgressOperation, { operation: 'measurement.receipt' }>).conversationId).toBe(conversationId);
  });

  it('keeps uncertainty when receipt is unknown and rejects invalid explicit measurements before transport', async () => {
    const f = fixture(); const controller = new ProgressController(); controller.select(subjectId, crypto.randomUUID());
    await controller.read(f.transport, 30); await controller.propose(after, f.transport); await controller.apply(f.transport);
    const count = f.operations.length; await controller.check(async () => ({ version: 'coach-assistant.v2', storage: 'database', ok: false, error: 'not_found' }));
    expect(controller.snapshot()).toMatchObject({ uncertain: true, error: 'not_found' });
    controller.reset(); controller.select(subjectId, crypto.randomUUID()); await controller.read(f.transport, 30);
    await controller.propose({ ...after, weightKg: 0 }, f.transport);
    expect(f.operations).toHaveLength(count + 1);
  });
});
