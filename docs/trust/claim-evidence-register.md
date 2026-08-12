# Public Trust-Claim ↔ Evidence Register

**Purpose (Enterprise Remediation Report, WP0 / BLOCKER-05):** every claim on the
public `/trust` page and in sales/procurement collateral (incl. the draft DPA) must map
to *current, reviewable evidence*. A claim with no `verified-technical`, `contractual`,
or explicit-forward-commitment basis must not appear publicly in affirmative form. In
particular, do **not** make favourable *scope* claims ("only X", "not Y", "all Z")
without an audit — every such claim has failed review.

**Process:** to strengthen a public claim, its row must first reach the right status with
a real artifact, in the SAME PR that changes `app/trust/page.tsx`. The CI guard
`tests/trust/public-claims.test.ts` forbids the affirmative form of every non-verified
claim (page AND draft DPA), requires the honest disclosure, checks every public
sub-processor is registered, and blocks flipping a non-verified row to a verified status.

- **Owner:** d.reyes (acting DPO) unless noted. **Last full review:** 2026-06-14 (round 4).

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
| RLS-ENABLED | "Row-level security is enabled on every database table; access enforced at the DB layer" | `verified-technical` | 55/55 public tables `rowsecurity=t`; 103 RLS policies (SQL preflight 2026-06-15); migration `0008` | 2026-09-14 |
| RLS-ISOLATION | *(not claimed absolutely)* coach/client SELECT isolation and key coach write-side denials are technically verified | `verified-technical` | WP2: `tests/db/rls.test.ts` assigned-vs-unassigned SELECT matrix for profiles, orgs, food/water/measurements, coach notes, messages, meal plans, supplements, workouts, form analyses, plus INSERT/UPDATE denial tests for `coach_notes`, `messages`, and `meal_plan_entries`; `tests/enterprise/invariants.test.ts` Drizzle RLS mirror fail-closed guard; `scripts/db/verify.ts` no `TO public` policies + anon grant allowlist | 2026-09-15 |
| REGION | "Hosted on AWS US (us-east-2); Vercel functions in cle1 + global edge" | `verified-technical` | `get_project` → us-east-2; `vercel.json` `regions:["cle1"]` | 2026-09-14 |
| SCC | "We rely on processors' SCCs; our TIA + executed DPAs **in progress**" | `in-progress` | processor DPAs incorporate SCCs (public); our TIA + executed DPAs not on file (WP5) | 2026-07-31 |
| ENCRYPT | "TLS 1.2+ in transit; AES-256 at rest; cookie-based sessions (not localStorage); no client-side creds" | `verified-technical` | platform defaults; `lib/supabase/browser.ts` `@supabase/ssr` cookie sessions; no `NEXT_PUBLIC_` secrets. **NOT httpOnly** — do not claim it | 2026-12-14 |
| ENDPOINT-CONTROLS | *(no universal claim)* zod + durable rate limiting on **key** mutation endpoints; coverage being completed | `in-progress` | signup/activation/messaging rate-limited; e.g. `privacy/consent` + `coach/invite-client` lack limiters (WP1/WP3) | WP3 |
| BACKUPS | "Automated backups and PITR **not yet enabled**; provisioning with Supabase Pro" | `planned` | Supabase **free tier** = no managed backups, no PITR. Needs Pro + restore drill (WP6) | on Pro upgrade |
| ERASURE | "Deletion via dpo@; automated audited erasure **in development**; manual for now" | `in-progress` | privacy route is **intake-only**; no fulfilment/backup-handling/auth-deletion (HIGH-02/WP5) | 2026-07-31 |
| TELEMETRY | "AI run telemetry is pseudonymous; automated retention/pruning **in development**" | `in-progress` | no `agent_runs` pruning job; Langfuse retention not configured | 2026-07-31 |
| AI-ANTHROPIC | "Meal-photo vision (Anthropic) does not train on API inputs" | `contractual` | Anthropic published API terms: no training on API inputs | 2026-12-14 |
| AI-OPENAI | "Consumer food/recipe text and short microphone audio use OpenAI; OpenAI states no API training unless opted in and no retention for audio transcriptions; our TIA/executed DPA/regional review remains in progress" | `in-progress` | `agents/router/policies.ts`; `/v1/audio/transcriptions`; OpenAI API data-controls documentation; vendor review not completed | 2026-11-12 |
| AI-DEEPSEEK | "DeepSeek is restricted to synthetic evaluation generation and receives no consumer traffic under current routing policy" | `verified-technical` | `tests/agents/phase3-routing-policy.test.ts`; `taskPolicies.factory_generate`; consumer primary/fallback matrix | 2026-11-12 |
| AI-EGRESS | "Consumer food text/audio can reach OpenAI; health-context text/images can reach Anthropic; embeddings can include personal data; minimisation + egress tests are in development" | `in-progress` | routing policy and transcription endpoint verified; full automated egress coverage pending | 2026-10-31 |
| VOYAGE | "Embeddings (Voyage, US) cover food text **and** memory/conversation/knowledge content (may include personal data)" | `in-progress` | `memory/write.ts` embeds memory facts; `rag/ingest.ts` embeds knowledge chunks; basis under review | 2026-07-31 |
| CONSENT-WD | "Withdraw consent via dpo@ (no prejudice to prior lawfulness)" | `in-progress` | manual; no self-serve toggle or downstream-enforcement proof (BLOCKER-03/04, WP1) | 2026-07-15 |
| RIGHTS-30D | *(public SLA removed)* "rights via dpo@; automated fulfilment + SLA **in development**" | `in-progress` | `data_requests` intake exists; no fulfilment/SLA monitoring (WP5) | 2026-07-31 |
| BREACH | "As processor, we notify controllers without undue delay and support their Art. 33 obligations" | `documented-policy` | `docs/legal/breach-runbook.md`; processor-role wording (DPA §10/Annex II now match). No breach to test it | 2026-12-14 |
| SUBPROC-NOTICE | "Our **current draft DPA proposes** advance notice of sub-processor changes + right to object" | `documented-policy` | proposed in `docs/legal/dpa-template.md` (draft); operationalise in WP5 | 2026-12-14 |
| DPA | "Draft DPA available on request; finalising with counsel" | `pending-counsel` | `docs/legal/dpa-template.md` (draft, not counsel-reviewed) | 2026-07-31 |
| MEDICAL | "We do NOT accept blood-panel/medical uploads yet" | `verified-technical` | only upload route is `photo-analyze` (meal photos); no medical-document route; lifestyle-only intake | 2026-09-14 |
| DATA-SOURCES | "Nutrition values from OFF (ODbL), USDA, CIQUAL, CoFID, BEDCA, CREA" | `verified-technical` | `foods.source` (10 sources); ODbL attribution present | 2026-12-14 |

## Sub-processor coverage (every provider named publicly must appear here)
| Sub-processor | Data sent | Location | Data-use basis |
|---|---|---|---|
| Supabase | All app data (DB/auth/storage) | US (AWS us-east-2) | processor DPA + SCCs (execution in progress) |
| Vercel | Hosting/delivery | US (functions cle1) + global edge | processor DPA + SCCs (execution in progress) |
| OpenAI | Consumer food/recipe text + short food/intake audio | US/global | API inputs not used for training unless opted in; audio transcription documents no retention; TIA/executed DPA/regional review in progress |
| DeepSeek | Synthetic evaluation inputs only; no consumer routing | **China** | provider may use inputs to improve; current inputs are synthetic by enforced policy |
| Anthropic | Health-context text, consumer fallback + meal-photo images | US | API terms: no training on API inputs |
| Voyage AI | Embeddings over food text **and** memory/conversation/knowledge content (may include personal data) | US | **under review** — not "food names only" |
| Langfuse | Pseudonymous AI run telemetry | **Self-hosted via Cloudflare Tunnel — region not independently verified** | self-hosted; retention/pruning policy in development |

## Known limitations (state plainly — never claim past these)
1. **No PITR / managed backups** — Supabase free tier; no restore drill. (WP6)
2. **Erasure is intake-only** — no fulfilment/backup-handling/auth-deletion. (WP5)
3. **AI telemetry has no retention/pruning** — retained indefinitely. (WP5)
4. **OpenAI receives consumer food text and short microphone audio; regional routing, TIA and executed vendor documentation are not independently verified.** Audio transcription retention and API no-training statements are provider-attributed, not a claim that our account has ZDR. (HIGH-03)
5. **Voyage embeds personal/health-adjacent text** (memory facts, conversations, knowledge docs), not just food names — basis under review. (HIGH-03)
6. **Session cookies are not httpOnly** — `@supabase/ssr` default. (WP1/WP3)
7. **Rate-limit/validation coverage is partial** — not on every mutation endpoint (e.g. consent-withdrawal, invite-client lack limiters). (WP1/WP3)
8. **Langfuse hosting region not independently verified** — self-hosted via Cloudflare Tunnel. (WP5)
9. **DPA/DPIA/transfer assessment not counsel-finalised; per-tenant RLS unproven; consent withdrawal manual; no SLO/load/restore evidence; paid plans not an operational lifecycle.** (WP1–WP6)

## Change log
- **2026-08-12:** aligned public AI routing with production policy, added OpenAI text/audio processing, and recorded the synthetic-only DeepSeek boundary.
- **2026-06-14 (round 4, post 3rd review):** corrected favourable-scope claims that failed
  audit — DeepSeek/coaching snapshot includes `full_name` (dropped "not name/contact");
  Voyage embeds memory/conversation/knowledge text, not "food names only" (new VOYAGE row);
  Vercel region is cle1 + global edge, not us-east-2; Langfuse is self-hosted via Cloudflare
  Tunnel (region unverified), not "EU"; added ENDPOINT-CONTROLS row (rate-limit coverage is
  partial). Fixed the DPA's 72h processor commitment (§10 + Annex II), "in-product deletion
  tooling" (§5e), and "all mutation endpoints" (Annex II). Extended the CI guard accordingly.
- **2026-06-14 (round 3):** DeepSeek no-training, HTTP-only cookies, 90-day telemetry, draft-DPA "proposes".
- **2026-06-14 (round 2):** SCC, erasure SLA, "no data ever trains", consent enforcement, rights SLA, RLS absolute, "sign the DPA"; breach → processor role.
- **2026-06-14 (round 1):** PITR / cascade-erase / signable-DPA / zero-retention.
