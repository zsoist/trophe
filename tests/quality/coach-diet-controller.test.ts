import { expect, it } from 'vitest';
import { DietController, type DietTransport } from '@/components/assistant/diet-state';
import type { FoodPreferenceProposal } from '@/agents/coach-assistant/food-preference-contracts';
it('keeps an undeclared preference null and recovers a lost write without applying twice', async () => {
  const controller = new DietController(), profileId = crypto.randomUUID(), conversationId = crypto.randomUUID();
  const proposal: FoodPreferenceProposal = { id: crypto.randomUUID(), hash: 'a'.repeat(64), action: 'food.preference.update', resource: { kind: 'food_preference', id: profileId, version: '0' }, before: { version: 1, dietPattern: null }, after: { version: 1, dietPattern: 'vegan' }, precondition: 'a'.repeat(64), expiresAt: new Date(Date.now() + 300000).toISOString(), reviewRequired: true };
  let stored = false, actionId = '';
  const operations: string[] = [];
  const transport: DietTransport = async operation => {
    operations.push(operation.operation);
    expect(operation.profileId).toBe(profileId); expect(operation.conversationId).toBe(conversationId);
    if (operation.operation === 'diet.read') return { version: 'coach-assistant.v2', storage: 'database', ok: true, snapshot: { profileId, version: stored ? '1' : '0', preferences: stored ? proposal.after : proposal.before } };
    if (operation.operation === 'diet.propose') return { version: 'coach-assistant.v2', storage: 'database', ok: true, proposal };
    if (operation.operation === 'diet.apply') { stored = true; actionId = operation.actionId; throw new Error('lost_response'); }
    expect(operation.actionId).toBe(actionId);
    return { version: 'coach-assistant.v2', storage: 'database', ok: true, receipt: { id: crypto.randomUUID(), actionId, proposalId: proposal.id, status: 'applied', resourceVersion: '1', recordedAt: new Date().toISOString() }, refresh: { profileId, previousVersion: '0', version: '1', strategy: 'refetch', discardDerivedContext: true } };
  };
  controller.select(profileId, conversationId, transport);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(controller.snapshot().profile?.preferences.dietPattern).toBeNull();
  await controller.propose('vegan', transport); expect(operations).toEqual(['diet.read', 'diet.propose']);
  await controller.apply(transport); expect(controller.snapshot().uncertain).toBe(true);
  await controller.apply(transport); expect(operations.filter(op => op === 'diet.apply')).toHaveLength(1);
  expect(controller.select(crypto.randomUUID(), conversationId, transport)).toBe(false);
  await controller.check(transport);
  expect(controller.snapshot()).toMatchObject({ uncertain: false, error: null, proposal: null, profile: { version: '1', preferences: { dietPattern: 'vegan' } } });
});
it('rejects a proposal that changes a different profile or reviewed choice', async () => {
  const controller = new DietController(), profileId = crypto.randomUUID();
  controller.select(profileId, crypto.randomUUID(), async () => ({ version: 'coach-assistant.v2', storage: 'database', ok: true, snapshot: { profileId, version: '0', preferences: { version: 1, dietPattern: null } } }));
  await new Promise(resolve => setTimeout(resolve, 0));
  await controller.propose('vegan', async () => ({ version: 'coach-assistant.v2', storage: 'database', ok: true, proposal: { id: crypto.randomUUID(), hash: 'a'.repeat(64), action: 'food.preference.update', resource: { kind: 'food_preference', id: crypto.randomUUID(), version: '0' }, before: { version: 1, dietPattern: null }, after: { version: 1, dietPattern: 'vegetarian' }, precondition: '', expiresAt: new Date(Date.now() + 300000).toISOString(), reviewRequired: true } }));
  expect(controller.snapshot()).toMatchObject({ proposal: null, error: 'failed' });
});
it('keeps receipt recovery on its original conversation before adopting a queued conversation', async () => {
  const controller = new DietController(), profileId = crypto.randomUUID(), original = crypto.randomUUID(), next = crypto.randomUUID();
  let stored = false, actionId = '';
  const seen: Array<{ operation: string; conversationId: string }> = [];
  const proposal = { id: crypto.randomUUID(), hash: 'b'.repeat(64), action: 'food.preference.update' as const,
    resource: { kind: 'food_preference' as const, id: profileId, version: '0' }, before: { version: 1 as const, dietPattern: null },
    after: { version: 1 as const, dietPattern: 'vegan' as const }, precondition: 'b'.repeat(64), expiresAt: new Date(Date.now() + 300000).toISOString(), reviewRequired: true as const };
  const transport: DietTransport = async operation => {
    seen.push({ operation: operation.operation, conversationId: operation.conversationId });
    if (operation.operation === 'diet.read') return { version: 'coach-assistant.v2', storage: 'database', ok: true, snapshot: { profileId, version: stored ? '1' : '0', preferences: stored ? proposal.after : proposal.before } };
    if (operation.operation === 'diet.propose') return { version: 'coach-assistant.v2', storage: 'database', ok: true, proposal };
    if (operation.operation === 'diet.apply') { stored = true; actionId = operation.actionId; throw new Error('lost_response'); }
    return { version: 'coach-assistant.v2', storage: 'database', ok: true, receipt: { id: crypto.randomUUID(), actionId, proposalId: proposal.id, status: 'applied', resourceVersion: '1', recordedAt: new Date().toISOString() }, refresh: { profileId, previousVersion: '0', version: '1', strategy: 'refetch', discardDerivedContext: true } };
  };
  controller.select(profileId, original, transport); await new Promise(resolve => setTimeout(resolve, 0));
  await controller.propose('vegan', transport); await controller.apply(transport);
  expect(controller.moveConversation(next)).toBe(false);
  await controller.check(transport);
  expect(seen.slice(-2)).toEqual([{ operation: 'diet.receipt', conversationId: original }, { operation: 'diet.read', conversationId: original }]);
  expect(controller.moveConversation(next)).toBe(true);
});
