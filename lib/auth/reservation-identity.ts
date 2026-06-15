import { v5 as uuidv5 } from 'uuid';
import { createHash } from 'node:crypto';

/**
 * Deterministic idempotency keys + payload fingerprints for invite reservations.
 *
 * TWO distinct values with two distinct jobs (do not conflate them):
 *
 *  - idempotencyKey — the STABLE IDENTITY of a signup attempt: flow scope + the
 *    normalized email/invite identity only. A retry of the same signup converges on
 *    the SAME reservation (no second account), regardless of cosmetic payload changes.
 *
 *  - fingerprint — a canonical hash of the EXPLICIT authorization-relevant payload
 *    (email, name, invite, role, consent version, ...). The claim RPCs bind the key to
 *    this fingerprint, so a reused key carrying a CHANGED payload is rejected as a
 *    conflict instead of silently sharing a reservation. The fingerprint must actually
 *    cover the fields — it is NOT derived from the scope.
 */
const NS = 'd3f1e2a0-0000-4000-8000-000000000042'; // fixed Trophē invite namespace (UUID)

const norm = (email: string) => email.trim().toLowerCase();

/** Stable, order-independent serialization of the payload fields for hashing. */
function canonical(payload: Record<string, string | null | undefined>): string {
  const keys = Object.keys(payload).sort();
  const normalized: Record<string, string | null> = {};
  for (const k of keys) normalized[k] = payload[k] ?? null;
  return JSON.stringify(normalized);
}

export function reservationIdentity(
  scope: string,
  identityEmail: string,
  payload: Record<string, string | null | undefined>,
): { idempotencyKey: string; fingerprint: string } {
  const idempotencyKey = uuidv5(`${scope}:${norm(identityEmail)}`, NS);
  const fingerprint = createHash('sha256').update(canonical(payload)).digest('hex');
  return { idempotencyKey, fingerprint };
}

/** Pseudo-invite id for ordinary (no-invite) signup — one live reservation per email. */
export function ordinaryPseudoInvite(email: string): string {
  return uuidv5(`ordinary-identity:${norm(email)}`, NS);
}
