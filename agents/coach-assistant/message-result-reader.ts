import type { CoachMessageResult } from './message-actions';
import { datetime, enumeration, hash, literal, nullable, object, stringLength, uuid } from './result-reader-checks';

const version = stringLength(1, 128);
const recipient = object({ coachId: uuid, name: nullable(stringLength(0, 500)), version });
const body = object({ message: stringLength(1, 2000) });
const proposal = object({
  id: uuid,
  hash,
  action: literal('chat.message.send'),
  recipient,
  after: body,
  expiresAt: datetime,
  reviewRequired: literal(true),
});
const receipt = object({
  id: uuid,
  actionId: uuid,
  proposalId: uuid,
  messageId: uuid,
  coachId: uuid,
  status: literal('stored'),
  recordedAt: datetime,
});
const refresh = object({ coachId: uuid, clientId: uuid, strategy: literal('refetch') });
const variants = [
  object({ ok: literal(false), error: enumeration(['invalid_input', 'forbidden', 'not_found', 'ambiguous_selection', 'not_connected', 'version_conflict', 'expired', 'idempotency_conflict', 'rate_limited', 'cancelled', 'uncertain']) }),
  object({ ok: literal(true), recipient }),
  object({ ok: literal(true), proposal }),
  object({ ok: literal(true), receipt, refresh }),
];

/** Parses browser JSON only; it cannot authorize, send, or repair a response. */
export function readCoachMessageResult(value: unknown): CoachMessageResult | null {
  return variants.some(check => check(value)) ? value as CoachMessageResult : null;
}
