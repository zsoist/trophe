# Public Trust-Claim ↔ Evidence Register

**Purpose (Enterprise Remediation Report, WP0 / BLOCKER-05):** every claim on the
public `/trust` page and in sales/procurement collateral must map to *current,
reviewable evidence*. A claim with no `verified` evidence must not appear publicly.

**How to use:** before changing `app/trust/page.tsx`, update this register in the
same PR. To make a stronger public claim, the row must first reach `verified` with a
real artifact. The CI guard `tests/trust/public-claims.test.ts` blocks specific
over-claims from reappearing until their row is `verified` and the phrase is removed
from the forbidden list there.

- **Owner:** d.reyes (acting DPO) unless noted.
- **Last full review:** 2026-06-14.
- **Status legend:** `verified` (artifact exists) · `in-progress` (being built) ·
  `planned` (committed, not started) · `pending-counsel` (needs legal sign-off).

| # | Public claim (as worded on /trust) | Status | Evidence / artifact | Owner | Last verified | Re-verify by |
|---|---|---|---|---|---|---|
| RLS | "Row-level security enforced on every table; coaches read only assigned clients, by DB policy" | **verified** | 41/41 public tables `rowsecurity=t` (SQL preflight 2026-06-14); migration `0008` private SECURITY DEFINER helpers; `is_coach_of` fail-closed | eng | 2026-06-14 | 2026-09-14 |
| REGION | "Hosted on AWS US (us-east-2); EU migration planned" | **verified** | Supabase `get_project` → region `us-east-2`; Vercel project us-east-2 | eng | 2026-06-14 | 2026-09-14 |
| SCC | "Transfers governed by SCCs in our processors' DPAs (Supabase, AWS)" | **in-progress** | Processor DPAs incorporate SCCs (public); **our** transfer-impact assessment + executed DPAs not yet on file → HIGH-03 / WP5 | DPO + counsel | 2026-06-14 | 2026-07-15 |
| ENCRYPT | "TLS 1.2+ in transit; AES-256 at rest; HTTP-only tokens; no creds in client code" | **verified** | Platform defaults (Supabase/Vercel/AWS); `@supabase/ssr` HTTP-only cookies; server-only env (no `NEXT_PUBLIC_` secrets) | eng | 2026-06-14 | 2026-12-14 |
| BACKUPS | ~~"Backups automated with point-in-time recovery"~~ → "**automated backups and PITR not yet enabled**; provisioning with Supabase Pro" | **planned** | Supabase **free tier** = no managed backups and no PITR. Evidence required before any backup claim: Pro upgrade screenshot + restore drill with measured RPO/RTO (WP6) | DPO | 2026-06-14 | on Pro upgrade |
| ERASURE | ~~"cascade-erase within 30 days incl. backup rotation"~~ → "app data removed on deletion; **automated audited erasure in development**; manual within 30 days via dpo@" | **in-progress** | No automated end-to-end erasure workflow yet (HIGH-02 / WP5). FK cascades remove app rows; backup handling undocumented | DPO + eng | 2026-06-14 | 2026-07-31 |
| DPA | ~~"signable DPA available for every paid plan"~~ → "**draft** DPA available on request, finalising with counsel" | **pending-counsel** | `docs/legal/dpa-template.md` (draft, not counsel-reviewed) | DPO + counsel | 2026-06-14 | 2026-07-31 |
| MEDICAL | "We deliberately do NOT accept blood-panel/medical uploads yet" | **verified** | Intake collects lifestyle answers only; no medical-document upload route exists | eng | 2026-06-14 | 2026-09-14 |
| AI-EGRESS | "Food parsing sends food text, not identity; insights send a snapshot the coach already has; no client data trains models" | **in-progress** | Design intent holds, but **automated egress tests** proving identifiers never reach providers do not exist yet (HIGH-03 / WP3) | eng | 2026-06-14 | 2026-07-31 |
| AI-SUBPROC | ~~Anthropic "zero-retention API tier"~~ → "no training on API inputs" | **verified** | Anthropic API terms: no training on API inputs (public). **Zero-retention** would need a specific contracted tier — not held, so not claimed | eng | 2026-06-14 | 2026-12-14 |
| CONSENT-WD | ~~"withdraw any consent at any time"~~ → "withdraw via dpo@; we stop affected processing" | **in-progress** | No self-serve withdrawal toggle yet; manual path only (BLOCKER-03/04 / WP1). Self-serve = WP1 deliverable | eng | 2026-06-14 | 2026-07-15 |
| BREACH | "72h breach notification per Art. 33, documented runbook" | **verified** (policy) | `docs/legal/breach-runbook.md` exists. Note: forward commitment; no breach has occurred to test it | DPO | 2026-06-14 | 2026-12-14 |
| SUBPROC-NOTICE | "Sub-processor changes notified 30 days in advance" | **verified** (policy) | Stated policy; operationalise via the change process in WP5 | DPO | 2026-06-14 | 2026-12-14 |
| RIGHTS-30D | "We respond to rights requests within 30 days" | **in-progress** | `data_requests` queue exists; no fulfilment SLA automation/dashboard yet (HIGH-02 / WP5) | DPO | 2026-06-14 | 2026-07-31 |
| DATA-SOURCES | "Nutrition values from OFF (ODbL), USDA, CIQUAL, CoFID, BEDCA, CREA" | **verified** | `foods.source` has 10 sources incl. these; ODbL attribution present | eng | 2026-06-14 | 2026-12-14 |

## Known limitations (state plainly — do not claim past these)
1. **No PITR / verified automated backups** — Supabase free tier. Restore drill not run. (WP6)
2. **No automated erasure workflow** — deletion is manual; backup-handling on deletion undocumented. (WP5)
3. **DPA/DPIA/transfer assessment not counsel-finalised** — drafts only. (WP5)
4. **DeepSeek transfer basis unresolved** — "per platform terms"; no SCCs/adequacy; mitigated by data-minimisation (food text only), but **not yet evidenced by automated egress tests**. (HIGH-03)
5. **Consent withdrawal is manual** — no self-serve toggle yet. (WP1)
6. **No measured availability SLO, load test, or restore drill.** (WP6)
7. **Paid plans are not an operational commercial lifecycle** — billing not wired. (WP4)

## Change log
- **2026-06-14** — Initial register. Corrected `/trust` over-claims (PITR, cascade-erase,
  signable DPA, Anthropic zero-retention, "withdraw any time", "cascades through all
  tables") to current verified state. Added CI guard `tests/trust/public-claims.test.ts`.
