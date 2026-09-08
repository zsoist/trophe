import { expect, it } from 'vitest';
import { readCoachMessageResult } from './message-result-reader';

const ids = {
  coachId: '11111111-1111-4111-8111-111111111111',
  proposalId: '22222222-2222-4222-8222-222222222222',
  actionId: '33333333-3333-4333-8333-333333333333',
  receiptId: '44444444-4444-4444-8444-444444444444',
  messageId: '55555555-5555-4555-8555-555555555555',
  clientId: '66666666-6666-4666-8666-666666666666',
};
const recipient = { coachId: ids.coachId, name: 'Coach Ana', version: 'v1' };

it('accepts only strict recipient, proposal and stored-receipt variants', () => {
  expect(readCoachMessageResult({ ok: true, recipient })).toEqual({ ok: true, recipient });
  expect(readCoachMessageResult({ ok: false, error: 'ambiguous_selection' })).toEqual({ ok: false, error: 'ambiguous_selection' });
  expect(readCoachMessageResult({ ok: true, proposal: {
    id: ids.proposalId, hash: 'a'.repeat(64), action: 'chat.message.send', recipient,
    after: { message: 'Hello coach' }, expiresAt: '2026-09-08T12:00:00.000Z', reviewRequired: true,
  } })).toBeTruthy();
  expect(readCoachMessageResult({ ok: true,
    receipt: { id: ids.receiptId, actionId: ids.actionId, proposalId: ids.proposalId, messageId: ids.messageId, coachId: ids.coachId, status: 'stored', recordedAt: '2026-09-08T12:01:00.000Z' },
    refresh: { coachId: ids.coachId, clientId: ids.clientId, strategy: 'refetch' },
  })).toBeTruthy();

  expect(readCoachMessageResult({ ok: true, recipient: { ...recipient, extra: true } })).toBeNull();
  expect(readCoachMessageResult({ ok: true, recipient: { ...recipient, name: 4 } })).toBeNull();
  expect(readCoachMessageResult({ ok: true, proposal: {
    id: ids.proposalId, hash: 'a'.repeat(64), action: 'chat.message.send', recipient,
    after: { message: 'Hello coach', html: '<b>hello</b>' }, expiresAt: '2026-09-08T12:00:00.000Z', reviewRequired: true,
  } })).toBeNull();
  expect(readCoachMessageResult({ ok: true,
    receipt: { id: ids.receiptId, actionId: ids.actionId, proposalId: ids.proposalId, messageId: ids.messageId, coachId: ids.coachId, status: 'delivered', recordedAt: '2026-09-08T12:01:00.000Z' },
    refresh: { coachId: ids.coachId, clientId: ids.clientId, strategy: 'refetch' },
  })).toBeNull();
});
