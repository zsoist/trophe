import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * WP0 evidence gate (Enterprise Remediation Report, BLOCKER-05; round 2 after
 * independent review).
 *
 * Exit gate: "A claim with no verified evidence must not appear publicly." The
 * public /trust page may state ONLY controls that are verified-technical,
 * contractual, or framed as an explicit forward commitment. Anything the register
 * (docs/trust/claim-evidence-register.md) marks in-progress / planned /
 * pending-counsel must be ABSENT in affirmative form and present only as an honest
 * "in development / on request" disclosure.
 *
 * Two guards:
 *  1) FORBIDDEN — affirmative over-claims that must never appear (each maps to a
 *     non-verified register row). A negated/disclosed mention is allowed.
 *  2) REQUIRED — the honest qualifier that must accompany each in-progress control.
 * Plus a register-consistency check so a row can't be silently flipped to
 * "verified" without removing its FORBIDDEN guard in the same PR.
 */

const PAGE = readFileSync(join(process.cwd(), 'app/trust/page.tsx'), 'utf-8');
const REGISTER = readFileSync(join(process.cwd(), 'docs/trust/claim-evidence-register.md'), 'utf-8');

const FORBIDDEN: Array<[RegExp, string]> = [
  // Backups / PITR — Supabase free tier: neither exists
  [/automated\s+with\s+point-in-time recovery/i, 'claims PITR is active (BACKUPS: planned)'],
  [/backups?\s+are\s+automated\b/i, 'claims automated backups exist (BACKUPS: planned)'],
  // Erasure — intake-only; no tested workflow or SLA
  [/cascade-erase/i, 'claims automated erasure (ERASURE: in-progress)'],
  [/backups?\s+rotation/i, 'claims backup-rotation erasure (ERASURE: in-progress)'],
  [/deletion cascades through all tables/i, 'claims verified cascade erasure (ERASURE: in-progress)'],
  [/completed\s+(manually\s+)?within\s+30\s+days/i, 'erasure SLA not evidenced (ERASURE: in-progress)'],
  // Rights fulfilment — no SLA monitoring
  [/respond within 30 days/i, 'rights-fulfilment SLA not monitored (RIGHTS-30D: in-progress)'],
  // Consent withdrawal — downstream enforcement unproven
  [/we stop the affected processing/i, 'consent-withdrawal enforcement unproven (CONSENT-WD: in-progress)'],
  // Transfers — our DPAs/TIA not executed
  [/it is governed by[^.]*standard contractual clauses/i, 'asserts our transfers are SCC-governed (SCC: in-progress)'],
  // RLS — rowsecurity=t ≠ proven per-policy isolation (needs WP2 matrix)
  [/can only ever read clients explicitly assigned/i, 'absolute cross-tenant guarantee unproven (RLS: needs WP2)'],
  // AI — no egress tests; avoid the absolute "ever"
  [/no client data is ever used to train/i, 'absolute "ever" not verifiable (AI-EGRESS: in-progress)'],
  [/zero-retention/i, 'no zero-retention agreement (AI-SUBPROC)'],
  // DPA — counsel-pending draft
  [/available for every paid plan/i, 'DPA not signable per-plan (DPA: pending-counsel)'],
  [/\bsign the DPA\b/i, 'cannot promise to sign a counsel-pending draft (DPA: pending-counsel)'],
  // Breach — we are the processor, not the controller
  [/within 72 hours,?\s+per Article 33/i, 'conflates processor/controller Art.33 duty (BREACH)'],
];

const REQUIRED: Array<[RegExp, string]> = [
  [/row-level security is enabled on every/i, 'RLS stated as "enabled" (verified), not an absolute guarantee'],
  [/point-in-time recovery[^.]*not yet enabled/i, 'PITR disclosed as not yet enabled'],
  [/erasure workflow[^.]*in active development/i, 'erasure disclosed as in development'],
  [/transfer-impact assessment and executed DPAs are in progress/i, 'transfer basis disclosed as in progress'],
  [/as processor[^.]*notifies affected controllers/i, 'breach worded for the processor role'],
  [/egress tests[^.]*in development/i, 'AI-egress verification disclosed as in development'],
];

describe('public trust claims — WP0 evidence gate (round 2)', () => {
  for (const [re, why] of FORBIDDEN) {
    it(`/trust does not over-claim — ${why}`, () => {
      expect(PAGE).not.toMatch(re);
    });
  }
  for (const [re, why] of REQUIRED) {
    it(`/trust discloses honestly — ${why}`, () => {
      expect(PAGE).toMatch(re);
    });
  }

  // Register consistency: these controls are not operationally proven, so their
  // register rows must NOT claim "verified" without also dropping the guard above.
  it('register does not mark unproven controls as verified', () => {
    for (const row of ['| BACKUPS', '| ERASURE', '| DPA', '| AI-EGRESS', '| CONSENT-WD', '| RIGHTS-30D', '| SCC']) {
      const line = REGISTER.split('\n').find((l) => l.startsWith(row));
      expect(line, `register row missing: ${row}`).toBeTruthy();
      expect(line!.toLowerCase()).not.toContain('verified-technical');
      expect(line!.toLowerCase()).not.toContain('operationally-tested');
    }
  });
});
