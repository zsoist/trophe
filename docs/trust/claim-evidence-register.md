# Public Trust-Claim ↔ Evidence Register

**Purpose (Enterprise Remediation Report, WP0 / BLOCKER-05):** every claim on the
public `/trust` page and in sales/procurement collateral (incl. the draft DPA) must map
to *current, reviewable evidence*. A claim with no `verified-technical`, `contractual`,
or explicit-forward-commitment basis must not appear publicly in affirmative form.

**Process:** to make a stronger public claim, its row must first reach the right status
with a real artifact, in the SAME PR that changes `app/trust/page.tsx`. The CI guard
`tests/trust/public-claims.test.ts` (a) forbids the affirmative form of every non-verified
claim, (b) requires the honest "in development / on request" disclosure, (c) blocks a
register row from being flipped to a verified status while its guard is live, and (d)
checks every public sub-processor is accounted for here.

- **Owner:** d.reyes (acting DPO) unless noted. **Last full review:** 2026-06-14 (round 3).

## Status taxonomy (do not conflate)
| Status | Means | May be stated publicly as… |
|---|---|---|
| `verified-technical` | proven by a technical artifact/test in this repo or platform config | a present-tense fact |
| `contractual` | backed by a third-party contract / published provider terms | a fact, attributed to the provider |
| `documented-policy` | a written policy/commitment exists, not operationally exercised | an explicit *commitment* / *draft proposal* |
| `operationally-tested` | proven by an executed drill (restore, completed DSAR, pen-test) | a present-tense fact with the drill as evidence |
| `in-progress` | being built; not yet usable as evidence | only as "in development" / "under review" |
| `planned` | committed, not started | only as "planned / not yet enabled" |
| `pending-counsel` | needs legal sign-off | only as "draft / under review" |

## Register
| # | Public claim (as worded on /trust) | Status | Evidence / artifact | Re-verify by |
|---|---|---|---|---|
| RLS-ENABLED | "Row-level security is enabled on every database table; access enforced at the DB layer" | `verified-technical` | 41/41 public tables `rowsecurity=t` (SQL preflight 2026-06-14); migration `0008` | 2026-09-14 |
| RLS-ISOLATION | *(not claimed absolutely)* per-policy cross-tenant denial is correct | `in-progress` | needs WP2 cross-tenant policy-test matrix | WP2 |
| REGION | "Hosted on AWS US (us-east-2); EU migration planned" | `verified-technical` | `get_project` → us-east-2; Vercel us-east-2 | 2026-09-14 |
| SCC | "We rely on processors' SCCs; our TIA + executed DPAs **in progress**" | `in-progress` | processor DPAs incorporate SCCs (public); our TIA + executed DPAs not on file (WP5) | 2026-07-31 |
| ENCRYPT | "TLS 1.2+ in transit; AES-256 at rest; cookie-based sessions (not localStorage); no client-side creds" | `verified-technical` | platform defaults; `lib/supabase/browser.ts` uses `@supabase/ssr` cookie sessions; no `NEXT_PUBLIC_` secrets. **NOT httpOnly** — browser client reads the cookie by design; do not claim httpOnly | 2026-12-14 |
| BACKUPS | "Automated backups and PITR **not yet enabled**; provisioning with Supabase Pro" | `planned` | Supabase **free tier** = no managed backups, no PITR. Needs Pro + restore drill (WP6) | on Pro upgrade |
| ERASURE | "Deletion via dpo@; automated audited erasure **in development**; manual for now" | `in-progress` | privacy route is **intake-only**; no fulfilment/backup-handling/auth-deletion (HIGH-02/WP5) | 2026-07-31 |
| TELEMETRY | "AI run telemetry is pseudonymous; automated retention/pruning **in development**" | `in-progress` | **no** `agent_runs` pruning job/cron/migration; Langfuse retention not configured (defaults indefinite). Restore claim only after a tested deletion query/drill | 2026-07-31 |
| AI-ANTHROPIC | "Meal-photo vision (Anthropic) does not train on API inputs" | `contractual` | Anthropic published API terms: no training on API inputs | 2026-12-14 |
| AI-DEEPSEEK | "Text AI (DeepSeek) processes inputs in China; may use inputs to improve services; basis unresolved" | `in-progress` | DeepSeek privacy policy permits using inputs to train/improve; processed in China; we send nutrition/lifestyle/coach snapshot text (coach-insight, conversation, memory, wearable). Transfer + data-use basis unresolved; minimisation + egress tests pending (HIGH-03/WP3/WP5) | 2026-07-31 |
| AI-EGRESS | "We send food/coach-snapshot text (not name/contact); minimisation + egress tests **in development**" | `in-progress` | automated egress tests proving identifiers never reach providers do not exist yet (HIGH-03/WP3) | 2026-07-31 |
| CONSENT-WD | "Withdraw consent via dpo@ (no prejudice to prior lawfulness)" | `in-progress` | manual; no self-serve toggle or downstream-enforcement proof (BLOCKER-03/04, WP1) | 2026-07-15 |
| RIGHTS-30D | *(public SLA removed)* "rights via dpo@; automated fulfilment + SLA **in development**" | `in-progress` | `data_requests` intake exists; no fulfilment/SLA monitoring (WP5) | 2026-07-31 |
| BREACH | "As processor, we notify controllers without undue delay and support their Art. 33 obligations" | `documented-policy` | `docs/legal/breach-runbook.md`; processor-role wording. No breach has occurred to test it | 2026-12-14 |
| SUBPROC-NOTICE | "Our **current draft DPA proposes** advance notice of sub-processor changes + right to object" | `documented-policy` | proposed in `docs/legal/dpa-template.md` (draft); operationalise in WP5 | 2026-12-14 |
| DPA | "Draft DPA available on request; finalising with counsel" | `pending-counsel` | `docs/legal/dpa-template.md` (draft, not counsel-reviewed) | 2026-07-31 |
| MEDICAL | "We do NOT accept blood-panel/medical uploads yet" | `verified-technical` | no medical-document upload route; lifestyle-only intake | 2026-09-14 |
| DATA-SOURCES | "Nutrition values from OFF (ODbL), USDA, CIQUAL, CoFID, BEDCA, CREA" | `verified-technical` | `foods.source` (10 sources); ODbL attribution present | 2026-12-14 |

## Sub-processor coverage (every provider named publicly must appear here)
| Sub-processor | Data sent | Location | Data-use basis |
|---|---|---|---|
| Supabase | All app data (DB/auth/storage) | US (AWS us-east-2) | processor DPA + SCCs (execution in progress) |
| Vercel | Hosting/delivery metadata | US (us-east-2/cle1) | processor DPA + SCCs (execution in progress) |
| DeepSeek | Food + coaching/lifestyle/memory snapshot **text** | **China** | **unresolved** — provider may use inputs to improve; minimisation in progress |
| Anthropic | Meal-photo images | US | API terms: no training on API inputs |
| Voyage AI | Food **names** only (no personal data) | US | embeddings only; no personal data sent |
| Langfuse | Pseudonymous AI run telemetry | EU | retention/pruning policy in development |

## Known limitations (state plainly — never claim past these)
1. **No PITR / managed backups** — Supabase free tier; no restore drill. (WP6)
2. **Erasure is intake-only** — pending-request creation, not fulfilment. (WP5)
3. **AI telemetry has no retention/pruning** — `agent_runs`/Langfuse retained indefinitely. (WP5)
4. **DeepSeek processes health-adjacent text in China and may train on it** — transfer + data-use basis unresolved; data-minimisation + egress tests not yet built. (HIGH-03)
5. **Session cookies are not httpOnly** — `@supabase/ssr` default; the browser client reads them. Hardening is a separate auth decision. (WP1/WP3)
6. **DPA/DPIA/transfer assessment not counsel-finalised** — drafts only. (WP5)
7. **Per-tenant RLS correctness unproven** — RLS *enabled*; cross-tenant matrix pending. (WP2)
8. **Consent withdrawal is manual**; **no rights-fulfilment SLA, availability SLO, load test, or restore drill**; **paid plans are not an operational lifecycle**. (WP1/WP4/WP5/WP6)

## Change log
- **2026-06-14 (round 3, post 2nd review):** corrected three more false claims — DeepSeek
  "no training / minimal context / never full health records" (DeepSeek may train, processes
  in China, and receives coaching/wearable/memory snapshots → AI-DEEPSEEK `in-progress`,
  split from AI-ANTHROPIC `contractual`); "HTTP-only cookies" (`@supabase/ssr` default is
  non-httpOnly → ENCRYPT evidence corrected); "telemetry pruned at 90 days" (no job exists →
  new TELEMETRY row `in-progress`). Reframed SUBPROC-NOTICE as "draft DPA proposes". Applied
  the same corrections to `docs/legal/dpa-template.md` (Annex II/III, §7, §9). Added the
  sub-processor coverage table; expanded the CI guard.
- **2026-06-14 (round 2):** removed/qualified SCC, erasure SLA, "no data ever trains",
  consent enforcement, rights SLA, RLS absolute, "sign the DPA"; fixed breach to processor role.
- **2026-06-14 (round 1):** corrected PITR / cascade-erase / signable-DPA / zero-retention.
