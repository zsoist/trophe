import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * WP0 evidence gate (Enterprise Remediation Report, BLOCKER-05).
 *
 * The public /trust page doubles as procurement collateral. Every claim on it must
 * map to CURRENTLY-VERIFIABLE evidence (see docs/trust/claim-evidence-register.md).
 * These phrases each correspond to a control that is NOT yet operational — shipping
 * any of them is a legal/procurement risk. This test fails CI if an over-claim
 * reappears, so a polished-but-unsupported claim can never silently return.
 *
 * To lift a phrase out of this list, the register entry must move to status
 * "verified" with a real artifact, in the SAME PR.
 */
// Affirmative over-claims that must never appear. Each targets the ASSERTIVE form
// (a negated/disclosed mention like "PITR ... is not yet enabled" is honest and allowed).
const FORBIDDEN: Array<[RegExp, string]> = [
  [/automated\s+with\s+point-in-time recovery/i, 'claims PITR is active — Supabase free tier, not enabled — register: BACKUPS'],
  [/backups?\s+are\s+automated\b/i, 'claims automated backups exist — register: BACKUPS'],
  [/cascade-erase\s+within\s+30\s+days/i, 'no automated erasure workflow exists — register: ERASURE'],
  [/backups?\s+rotation/i, 'no backup-rotation erasure evidence — register: ERASURE'],
  [/deletion cascades through all tables/i, 'erasure is manual, not a verified cascade — register: ERASURE'],
  [/zero-retention/i, 'no zero-retention agreement; only "no training on API inputs" is verifiable — register: AI-SUBPROC'],
  [/available for every paid plan/i, 'DPA is a counsel-pending draft, not signable per-plan — register: DPA'],
];

// Disclosures that MUST be present — the honest qualifier on each in-progress control.
const REQUIRED: Array<[RegExp, string]> = [
  [/row-level security is enforced on every table/i, 'verified RLS claim must remain'],
  [/point-in-time recovery[^.]*not yet enabled/i, 'PITR must be disclosed as not yet enabled'],
];

describe('public trust claims — WP0 evidence gate', () => {
  const src = readFileSync(join(process.cwd(), 'app/trust/page.tsx'), 'utf-8');

  for (const [re, why] of FORBIDDEN) {
    it(`does not over-claim (${why})`, () => {
      expect(src).not.toMatch(re);
    });
  }
  for (const [re, why] of REQUIRED) {
    it(`discloses honestly (${why})`, () => {
      expect(src).toMatch(re);
    });
  }
});
