# Public Trust-Claim ↔ Evidence Register

**Purpose (Enterprise Remediation Report, WP0 / BLOCKER-05):** every claim on the
public `/trust` page and in sales/procurement collateral must map to *current,
reviewable evidence*. A claim with no `verified-technical`, `contractual`, or
explicit-forward-commitment basis must not appear publicly in affirmative form.

**Process:** to make a stronger public claim, its row must first reach the right
status with a real artifact, in the SAME PR that changes `app/trust/page.tsx`. The CI
guard `tests/trust/public-claims.test.ts` (a) forbids the affirmative form of every
non-verified claim, (b) requires the honest "in development / on request" disclosure,
and (c) blocks a register row from being flipped to a verified status while its guard
is still active.

- **Owner:** d.reyes (acting DPO) unless noted. **Last full review:** 2026-06-14.

## Status taxonomy (reviewer-requested — do not conflate)
| Status | Means | May be stated publicly as… |
|---|---|---|
| `verified-technical` | proven by a technical artifact/test in this repo or platform config | a present-tense fact |
| `contractual` | backed by a third-party contract / published provider terms | a fact, attributed to the provider |
| `documented-policy` | a written policy/commitment exists, not yet operationally exercised | an explicit *commitment* ("we commit to…") |
| `operationally-tested` | proven by an executed drill (restore, completed DSAR, pen-test) | a present-tense fact with the drill as evidence |
| `in-progress` | being built; not yet usable as evidence | only as "in development" / "on request" |
| `planned` | committed, not started | only as "planned / not yet enabled" |
| `pending-counsel` | needs legal sign-off | only as "draft / under review" |

## Register
| # | Public claim (as worded on /trust) | Status | Evidence / artifact | Re-verify by |
|---|---|---|---|---|
| RLS-ENABLED | "Row-level security is enabled on every database table; access enforced at the DB layer" | `verified-technical` | 41/41 public tables `rowsecurity=t` (SQL preflight 2026-06-14); migration `0008` private SECURITY DEFINER helpers | 2026-09-14 |
| RLS-ISOLATION | *(NOT claimed absolutely on page)* per-policy cross-tenant denial is correct | `in-progress` | needs the WP2 cross-tenant policy-test matrix; page says only "enabled", with a roadmap caveat | WP2 |
| REGION | "Hosted on AWS US (us-east-2); EU migration planned" | `verified-technical` | Supabase `get_project` → region `us-east-2`; Vercel us-east-2 | 2026-09-14 |
| SCC | "We rely on processors' SCCs; our transfer-impact assessment + executed DPAs **in progress**" | `in-progress` | processor DPAs incorporate SCCs (public); **our** TIA + executed DPAs not on file (WP5) | 2026-07-31 |
| ENCRYPT | "TLS 1.2+ in transit; AES-256 at rest; HTTP-only tokens; no creds in client code" | `verified-technical` | platform defaults (Supabase/Vercel/AWS); `@supabase/ssr` HTTP-only cookies; no `NEXT_PUBLIC_` secrets | 2026-12-14 |
| BACKUPS | "Automated backups and PITR **not yet enabled**; provisioning with Supabase Pro" | `planned` | Supabase **free tier** = no managed backups, no PITR. Before any backup claim: Pro upgrade + restore drill w/ RPO/RTO (WP6) | on Pro upgrade |
| ERASURE | "Deletion via dpo@; automated audited erasure **in development**; manual for now" | `in-progress` | privacy route is **intake-only** (`app/api/privacy/requests` creates a pending request); no fulfilment, completion check, backup handling, or auth-account deletion (HIGH-02/WP5) | 2026-07-31 |
| AI-SUBPROC | "Our AI providers' API terms: no training on API inputs" | `contractual` | DeepSeek + Anthropic published API terms (no training on API inputs). "Zero-retention" would need a contracted tier — not held, not claimed | 2026-12-14 |
| AI-EGRESS | "Food text not identity; minimal context; **egress tests in development**" | `in-progress` | design intent holds; automated egress tests proving identifiers never reach providers do not exist yet (HIGH-03/WP3) | 2026-07-31 |
| CONSENT-WD | "Withdraw consent via dpo@ (no prejudice to prior lawfulness)" | `in-progress` | manual path only; no self-serve toggle or downstream-enforcement proof (BLOCKER-03/04, WP1) | 2026-07-15 |
| RIGHTS-30D | *(public SLA removed)* "rights via dpo@; automated fulfilment + SLA **in development**" | `in-progress` | `data_requests` intake exists; no fulfilment workflow or SLA monitoring (HIGH-02/WP5) | 2026-07-31 |
| BREACH | "As processor, we notify controllers without undue delay and support their Art. 33 obligations" | `documented-policy` | `docs/legal/breach-runbook.md`; processor-role wording (not the controller's 72h duty). No breach has occurred to test it | 2026-12-14 |
| SUBPROC-NOTICE | "Our DPA commits us to advance notice of sub-processor changes + right to object" | `documented-policy` | stated as a DPA commitment; operationalise the change process in WP5 | 2026-12-14 |
| DPA | "Draft DPA available on request; finalising with counsel" | `pending-counsel` | `docs/legal/dpa-template.md` (draft, not counsel-reviewed) | 2026-07-31 |
| MEDICAL | "We do NOT accept blood-panel/medical uploads yet" | `verified-technical` | no medical-document upload route; intake is lifestyle-only | 2026-09-14 |
| DATA-SOURCES | "Nutrition values from OFF (ODbL), USDA, CIQUAL, CoFID, BEDCA, CREA" | `verified-technical` | `foods.source` (10 sources incl. these); ODbL attribution present | 2026-12-14 |

## Known limitations (state plainly — never claim past these)
1. **No PITR / managed backups** — Supabase free tier; no restore drill. (WP6)
2. **Erasure is intake-only** — pending-request creation, not fulfilment; backup handling + auth-account deletion undone. (WP5)
3. **DPA/DPIA/transfer assessment not counsel-finalised** — drafts only. (WP5)
4. **DeepSeek transfer basis unresolved** — provider terms only; no SCCs/adequacy; mitigated by data-minimisation but **not yet evidenced by egress tests**. (HIGH-03)
5. **Per-tenant RLS correctness unproven** — RLS is *enabled* on every table; a cross-tenant policy-test matrix does not yet exist. (WP2)
6. **Consent withdrawal is manual** — no self-serve toggle; downstream enforcement unproven. (WP1)
7. **No rights-fulfilment SLA monitoring**, no availability SLO, load test, or restore drill. (WP5/WP6)
8. **Paid plans are not an operational commercial lifecycle.** (WP4)

## Change log
- **2026-06-14 (round 2, post-independent-review):** removed/qualified every public claim
  not `verified-technical`/`contractual`/explicit-commitment — SCC ("governed by"→"we rely
  on…in progress"), erasure 30-day SLA (→ manual, scope confirmed), "no data *ever* trains"
  (→ provider-terms + egress-tests-in-dev), consent "we stop processing" (→ withdraw via dpo@),
  rights 30-day SLA (removed), RLS absolute (→ "enabled", roadmap caveat), "sign the DPA"
  (→ share draft + discuss). Fixed breach wording to the **processor** role (Art. 33 is the
  controller's duty). Added the status taxonomy and expanded the CI guard.
- **2026-06-14 (round 1):** initial register; corrected PITR / cascade-erase / signable-DPA /
  zero-retention / withdraw-any-time over-claims.
