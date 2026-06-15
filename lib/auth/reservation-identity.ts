import { v5 as uuidv5 } from 'uuid';
import { createHash } from 'node:crypto';

/**
 * Deterministic idempotency keys + payload fingerprints for invite reservations.
 *
 * The key is derived (uuid v5) from the signup identity, so a retry of the SAME
 * signup converges on the SAME reservation (no second account). The fingerprint
 * (sha256 of the same input) binds the key to the payload, so a reused key with a
 * changed identity is rejected as a conflict by the claim RPCs.
 */
const NS = 'd3f1e2a0-0000-4000-8000-000000000042'; // fixed Trophē invite namespace (UUID)

const norm = (email: string) => email.trim().toLowerCase();

export function reservationIdentity(scope: string, email: string): { idempotencyKey: string; fingerprint: string } {
  const seed = `${scope}:${norm(email)}`;
  return { idempotencyKey: uuidv5(seed, NS), fingerprint: createHash('sha256').update(seed).digest('hex') };
}

/** Pseudo-invite id for ordinary (no-invite) signup — one live reservation per email. */
export function ordinaryPseudoInvite(email: string): string {
  return uuidv5(`ordinary-identity:${norm(email)}`, NS);
}
