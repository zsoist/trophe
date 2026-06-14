import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * WP0 evidence gate (Enterprise Remediation Report, BLOCKER-05; round 4).
 *
 * Exit gate: "A claim with no verified evidence must not appear publicly." Public
 * surfaces (the /trust page AND the buyer-facing draft DPA) may state only controls
 * that are verified-technical / contractual / an explicit forward-commitment; every
 * in-progress / planned / pending-counsel item must appear only as an honest
 * "in development / under review" disclosure (see docs/trust/claim-evidence-register.md).
 *
 * Hard lesson across 4 review rounds: favourable *scope* claims ("only X", "not Y",
 * "all Z") must be audited, not asserted. This guard rejects the specific scope
 * over-claims that failed review and requires the honest broad-category disclosures.
 *
 * Known limit: this matches known claim phrasings, not arbitrary prose; a full
 * per-claim tag → register-status check is tracked for WP3 doc-lint.
 */

const ROOT = process.cwd();
const PAGE = readFileSync(join(ROOT, 'app/trust/page.tsx'), 'utf-8');
const REGISTER = readFileSync(join(ROOT, 'docs/trust/claim-evidence-register.md'), 'utf-8');
const DPA = readFileSync(join(ROOT, 'docs/legal/dpa-template.md'), 'utf-8');

const FORBIDDEN_PAGE: Array<[RegExp, string]> = [
  [/automated\s+with\s+point-in-time recovery/i, 'PITR not enabled (BACKUPS)'],
  [/backups?\s+are\s+automated\b/i, 'no automated backups (BACKUPS)'],
  [/cascade-erase/i, 'erasure not automated (ERASURE)'],
  [/backups?\s+rotation/i, 'no backup-rotation erasure (ERASURE)'],
  [/deletion cascades through all tables/i, 'erasure not a verified cascade (ERASURE)'],
  [/completed\s+(manually\s+)?within\s+30\s+days/i, 'erasure SLA not evidenced (ERASURE)'],
  [/respond within 30 days/i, 'rights SLA not monitored (RIGHTS-30D)'],
  [/we stop the affected processing/i, 'consent enforcement unproven (CONSENT-WD)'],
  [/it is governed by[^.]*standard contractual clauses/i, 'transfers not SCC-executed (SCC)'],
  [/can only ever read clients explicitly assigned/i, 'cross-tenant guarantee unproven (RLS)'],
  [/zero-retention/i, 'no zero-retention agreement (AI-ANTHROPIC)'],
  [/minimal task context/i, 'DeepSeek receives more than minimal context (AI-DEEPSEEK)'],
  [/never full (health|account) record/i, 'we do send health-adjacent text (AI-DEEPSEEK)'],
  [/no client data is (ever )?used to train/i, 'DeepSeek may train on inputs (AI-DEEPSEEK)'],
  [/providers'? api terms[^.]*do not train/i, 'universal no-train claim false for DeepSeek'],
  [/not your name or contact/i, 'coaching snapshot DOES send full_name (AI-EGRESS)'],
  [/food names only/i, 'Voyage embeds more than food names (VOYAGE)'],
  [/embeddings?[^.]*no personal data/i, 'Voyage receives personal data (VOYAGE)'],
  [/http-?only cook/i, 'sessions are NOT httpOnly (ENCRYPT)'],
  [/pruned at 90 days/i, 'no telemetry pruning job (TELEMETRY)'],
  [/available for every paid plan/i, 'DPA not signable per-plan (DPA)'],
  [/\bsign the DPA\b/i, 'cannot promise to sign a draft (DPA)'],
  [/within 72 hours,?\s+per Article 33/i, 'conflates processor/controller Art.33 duty (BREACH)'],
];

const REQUIRED_PAGE: Array<[RegExp, string]> = [
  [/row-level security is enabled on every/i, 'RLS stated as "enabled", not absolute'],
  [/point-in-time recovery[^.]*not yet enabled/i, 'PITR disclosed as not yet enabled'],
  [/erasure workflow[^.]*in active development/i, 'erasure disclosed as in development'],
  [/transfer-impact assessment and executed DPAs are in progress/i, 'transfer basis disclosed'],
  [/as processor[^.]*notifies affected controllers/i, 'breach worded for the processor role'],
  [/deepseek[^.]*china/i, 'DeepSeek China processing disclosed'],
  [/can include names/i, 'DeepSeek receiving identifiers disclosed (AI-EGRESS)'],
  [/embeddings via Voyage/i, 'Voyage embedding scope disclosed (VOYAGE)'],
  [/cle1/i, 'Vercel function region (cle1) stated accurately (REGION)'],
  [/self-hosted via cloudflare tunnel/i, 'Langfuse self-hosting disclosed honestly'],
  [/cookies rather than browser localStorage/i, 'cookie storage stated honestly (not httpOnly)'],
  [/retention\/pruning policy[^.]*in development/i, 'telemetry retention disclosed'],
  [/automated egress (tests|controls)/i, 'AI egress verification disclosed as in development'],
];

// Hard-false phrases that must not appear in the buyer-facing draft DPA either.
const FORBIDDEN_DPA: Array<[RegExp, string]> = [
  [/http-?only cookie/i, 'sessions are not httpOnly'],
  [/no training on customer data/i, 'DeepSeek may train on inputs'],
  [/pruned at 90 days/i, 'no telemetry pruning job'],
  [/point-in-time recovery; restore runbook tested/i, 'no backups/PITR/restore drill'],
  [/minimal task context/i, 'DeepSeek receives health-adjacent text'],
  [/zero-retention tier/i, 'no Anthropic zero-retention tier'],
  [/within 72 hours/i, 'processor owes "without undue delay", not a fixed 72h (Art.33 is the controller duty)'],
  [/72h notification commitment/i, 'same — processor wording only'],
  [/in-product export and deletion tooling/i, 'deletion tooling does not exist (intake-only)'],
  [/on all mutation endpoints/i, 'rate-limit/validation coverage is partial'],
  [/embeddings \(food names only\)/i, 'Voyage embeds more than food names'],
];

const SUB_PROCESSORS = ['Supabase', 'Vercel', 'DeepSeek', 'Anthropic', 'Voyage AI', 'Langfuse'];
const NOT_VERIFIED_ROWS = [
  '| BACKUPS', '| ERASURE', '| TELEMETRY', '| DPA', '| AI-EGRESS', '| AI-DEEPSEEK',
  '| VOYAGE', '| ENDPOINT-CONTROLS', '| CONSENT-WD', '| RIGHTS-30D', '| SCC',
];

describe('public trust claims — WP0 evidence gate (round 4)', () => {
  for (const [re, why] of FORBIDDEN_PAGE) {
    it(`/trust does not over-claim — ${why}`, () => expect(PAGE).not.toMatch(re));
  }
  for (const [re, why] of REQUIRED_PAGE) {
    it(`/trust discloses honestly — ${why}`, () => expect(PAGE).toMatch(re));
  }
  for (const [re, why] of FORBIDDEN_DPA) {
    it(`draft DPA does not over-claim — ${why}`, () => expect(DPA).not.toMatch(re));
  }

  it('every public sub-processor is accounted for in the register', () => {
    for (const name of SUB_PROCESSORS) {
      expect(PAGE, `${name} should be listed on /trust`).toContain(name);
      expect(REGISTER, `${name} missing from register`).toContain(name);
    }
  });

  it('register does not mark unproven controls as verified', () => {
    for (const row of NOT_VERIFIED_ROWS) {
      const line = REGISTER.split('\n').find((l) => l.startsWith(row));
      expect(line, `register row missing: ${row}`).toBeTruthy();
      expect(line!.toLowerCase()).not.toContain('verified-technical');
      expect(line!.toLowerCase()).not.toContain('operationally-tested');
    }
  });
});
