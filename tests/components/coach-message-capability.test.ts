import { expect, it } from 'vitest';
import { acceptedMessageProposal } from '@/components/assistant/message-capability';

const conversationId = '11111111-1111-4111-8111-111111111111';
const turnId = '22222222-2222-4222-8222-222222222222';
const actorId = '33333333-3333-4333-8333-333333333333';
const proposal = {
  id: '44444444-4444-4444-8444-444444444444', hash: 'a'.repeat(64), action: 'chat.message.send',
  recipient: { coachId: '55555555-5555-4555-8555-555555555555', name: 'Coach Ana', version: '1' },
  after: { message: 'Can we review my plan?' }, expiresAt: '2026-09-08T12:05:00.000Z', reviewRequired: true,
};
const response = {
  version: 'coach-assistant.v2', conversationId, turnId, ok: true,
  snapshot: { access: 'self', subjectId: actorId, scopeKey: 'b'.repeat(64) },
  capabilityResult: { tool: 'coach.message.propose', status: 'review_required', result: { ok: true, proposal }, applied: false },
};

it('accepts only the current self-scoped review-only message proposal', () => {
  expect(acceptedMessageProposal(response, actorId, conversationId, turnId)).toEqual(proposal);
  expect(acceptedMessageProposal({ ...response, turnId: crypto.randomUUID() }, actorId, conversationId, turnId)).toBeNull();
  expect(acceptedMessageProposal({ ...response, capabilityResult: { ...response.capabilityResult, applied: true } }, actorId, conversationId, turnId)).toBeNull();
  expect(acceptedMessageProposal({ ...response, capabilityResult: { ...response.capabilityResult, result: { ok: true, proposal: { ...proposal, after: { message: 'changed' } }, html: '<b>x</b>' } } }, actorId, conversationId, turnId)).toBeNull();
});
