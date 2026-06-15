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
 *  - fingerprint — a canonical hash of the SEMANTICALLY-NORMALIZED authorization
 *    payload (email, name, invite, role, consent version). The claim RPCs bind the key
 *    to this fingerprint, so a reused key carrying a MEANINGFULLY changed payload is
 *    rejected as a conflict — while a merely cosmetic difference (email casing,
 *    surrounding/collapsible whitespace, role casing) normalizes to the SAME
 *    fingerprint, so equivalent retries converge instead of self-conflicting.
 */
const NS = 'd3f1e2a0-0000-4000-8000-000000000042'; // fixed Trophē invite namespace (UUID)

const normEmail = (email: string) => email.trim().toLowerCase();
const normText = (s: string) => s.trim().replace(/\s+/g, ' '); // trim + collapse internal whitespace

/** Authorization-relevant fields that the fingerprint binds the reservation key to. */
export interface ReservationPayload {
  email: string;
  fullName: string;
  inviteCode?: string | null;
  role?: string | null;
  consentVersion: string;
}

/** Semantic normalization — equivalence classes that should NOT be treated as a change. */
function normalizePayload(p: ReservationPayload): Record<string, string | null> {
  return {
    email: normEmail(p.email),
    fullName: normText(p.fullName),
    inviteCode: p.inviteCode ? normText(p.inviteCode) : null,
    role: p.role ? p.role.trim().toLowerCase() : null,
    consentVersion: p.consentVersion.trim(),
  };
}

/** Stable, order-independent serialization of the normalized payload for hashing. */
function canonical(normalized: Record<string, string | null>): string {
  const keys = Object.keys(normalized).sort();
  const ordered: Record<string, string | null> = {};
  for (const k of keys) ordered[k] = normalized[k];
  return JSON.stringify(ordered);
}

export function reservationIdentity(
  scope: string,
  identityEmail: string,
  payload: ReservationPayload,
): { idempotencyKey: string; fingerprint: string } {
  const idempotencyKey = uuidv5(`${scope}:${normEmail(identityEmail)}`, NS);
  const fingerprint = createHash('sha256').update(canonical(normalizePayload(payload))).digest('hex');
  return { idempotencyKey, fingerprint };
}

/** Pseudo-invite id for ordinary (no-invite) signup — one live reservation per email. */
export function ordinaryPseudoInvite(email: string): string {
  return uuidv5(`ordinary-identity:${normEmail(email)}`, NS);
}
