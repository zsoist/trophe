import { describe, expect, it } from 'vitest';
import { MemoryController, type MemoryTransport } from '@/components/assistant/memory-state';
import type { PersistentMemoryCard, PersistentMemoryProposal, PersistentMemoryResult } from '@/agents/coach-assistant/memory-contracts';

const conversationId = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const card: PersistentMemoryCard = { id, text: 'Morning workouts', createdAt: new Date().toISOString(), version: '0', confirmation: 'confirmed', source: 'user_input', retention: 'persistent', conversationId };
const proposal: PersistentMemoryProposal = { id: '33333333-3333-4333-8333-333333333333', hash: 'a'.repeat(64), action: 'memory.confirm', resource: { kind: 'memory', id, version: '0' }, before: null, after: { text: card.text, source: 'user_input', retention: 'persistent' }, expiresAt: new Date(Date.now() + 300000).toISOString(), reviewRequired: true };
const read = (memories: PersistentMemoryCard[]): PersistentMemoryResult => ({ version: 'coach-assistant.v2', storage: 'database', ok: true, memories, scopeRevision: String(memories.length), derivedContext: 'excluded' });
describe('memory reviewed action lifecycle', () => {
  it('recovers a lost apply response by receipt only, then refetches before allowing another write', async () => {
    const controller = new MemoryController(conversationId);
    const operations: string[] = [];
    let actionId = '', stored = false;
    const transport: MemoryTransport = async operation => {
      operations.push(operation.operation);
      if (operation.operation === 'memory.read') return read(stored ? [card] : []);
      if (operation.operation === 'memory.propose') return { version: 'coach-assistant.v2', storage: 'database', ok: true, proposal };
      if (operation.operation === 'memory.apply') { actionId = operation.actionId; stored = true; throw new Error('lost_response'); }
      if (operation.operation === 'memory.receipt') {
        expect(operation.actionId).toBe(actionId);
        return { version: 'coach-assistant.v2', storage: 'database', ok: true, receipt: { id, actionId, proposalId: proposal.id, status: 'applied', resourceVersion: '0', recordedAt: new Date().toISOString() }, refresh: { conversationId, strategy: 'refetch', discardDerivedContext: true, invalidatedMemoryVersions: [] } };
      }
      throw new Error('unexpected');
    };
    await controller.read(transport); await controller.propose(card.text, transport);
    expect(operations).toEqual(['memory.read', 'memory.propose']);
    await controller.apply(transport); expect(controller.snapshot().uncertain).toBe(true);
    await controller.apply(transport); await controller.propose('Other', transport); controller.discard();
    expect(operations.filter(op => op === 'memory.apply')).toHaveLength(1);
    await controller.check(transport);
    expect(controller.snapshot()).toMatchObject({ pending: false, uncertain: false, proposal: null, memories: [card], error: null });
    expect(operations.slice(-2)).toEqual(['memory.receipt', 'memory.read']);
  });
  it('rejects changed reviewed text and stale correction versions', async () => {
    const controller = new MemoryController(conversationId);
    await controller.read(async () => read([card]));
    let calls = 0;
    const transport: MemoryTransport = async () => { calls++; return { version: 'coach-assistant.v2', storage: 'database', ok: true, proposal: { ...proposal, after: { ...proposal.after!, text: 'Changed' } } }; };
    await controller.propose('Morning workouts', transport, { ...card, version: '99' });
    expect(calls).toBe(0);
    await controller.propose('Morning workouts', transport);
    expect(controller.snapshot()).toMatchObject({ proposal: null, error: 'failed' });
  });
  it('cancels a read without publishing its late result after identity reset', async () => {
    const controller = new MemoryController(conversationId);
    let resolve!: (result: PersistentMemoryResult) => void;
    const pending = controller.read(() => new Promise(done => { resolve = done; }));
    controller.reset(); resolve(read([card])); await pending;
    expect(controller.snapshot()).toMatchObject({ memories: [], loaded: false, pending: false, receipt: null });
  });
  it('keeps the action identity after cancelling an in-flight write', async () => {
    const controller = new MemoryController(conversationId);
    await controller.read(async () => read([]));
    await controller.propose(card.text, async () => ({ version: 'coach-assistant.v2', storage: 'database', ok: true, proposal }));
    let resolve!: (result: PersistentMemoryResult) => void;
    let actionId = '';
    const pending = controller.apply(operation => {
      if (operation.operation === 'memory.apply') actionId = operation.actionId;
      return new Promise(done => { resolve = done; });
    });
    controller.cancel();
    resolve({ version: 'coach-assistant.v2', storage: 'database', ok: false, error: 'cancelled' });
    await pending;
    expect(controller.snapshot().uncertain).toBe(true);
    await controller.check(async operation => {
      expect(operation.operation).toBe('memory.receipt');
      expect('actionId' in operation && operation.actionId).toBe(actionId);
      return { version: 'coach-assistant.v2', storage: 'database', ok: false, error: 'not_found' };
    });
    expect(controller.snapshot().uncertain).toBe(true);
  });
});
