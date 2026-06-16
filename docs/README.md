# Trophē — documentation index

Start here. **Latest shipped state / benchmark / gaps = newest `STATUS-YYYY-MM-DD.md`** (currently [`STATUS-2026-06-13.md`](STATUS-2026-06-13.md)). For enterprise WP remediation progress, the single source of truth is [`audits/remediation-status-2026-06-15.md`](audits/remediation-status-2026-06-15.md).
At the end of each phase, create a new `STATUS-YYYY-MM-DD.md`; everything else is reference, not authority.

## Read first
| Doc | What |
|---|---|
| [`STATUS-2026-06-13.md`](STATUS-2026-06-13.md) | **Live snapshot** — what's shipped, benchmark, known gaps |
| [`../README.md`](../README.md) | Project overview + setup |
| [`../ARCHITECTURE.md`](../ARCHITECTURE.md) | Stack, data model, LLM routing (100% DeepSeek text) |
| [`../CLAUDE.md`](../CLAUDE.md) · [`../AGENTS.md`](../AGENTS.md) | Coding rules & agent conventions |

## Plans (current)
- [`plans/nutrafit-master-plan.md`](plans/nutrafit-master-plan.md) — phase roadmap (Daily Nutrafit × Trophē)
- [`plans/coach-module-b2b-plan.md`](plans/coach-module-b2b-plan.md) — Michael's coach requests (P0–P6)
- [`plans/latency-mvp-plan-2026-06-13.md`](plans/latency-mvp-plan-2026-06-13.md) — latency + business levers
- [`coach/michael-call-2026-06-12-requirements.md`](coach/michael-call-2026-06-12-requirements.md) — full requirements ledger

## Audits (current)
- [`audits/remediation-status-2026-06-15.md`](audits/remediation-status-2026-06-15.md) — **WP0–WP7 remediation status + scorecard (single source of truth for WP progress)**
- [`audits/full-system-audit-2026-06-13.md`](audits/full-system-audit-2026-06-13.md) — engineering audit
- [`audits/enterprise-readiness-2026-06-13.md`](audits/enterprise-readiness-2026-06-13.md) — B2B procurement scorecard + path to 100

## Nutrition engine
- [`benchmark/methodology.md`](benchmark/methodology.md) · [`methodology/nutrition-benchmark.md`](methodology/nutrition-benchmark.md) — eval methodology (Acc@7.5, MAPE)
- [`benchmark/frontier-research-2026-06-13.md`](benchmark/frontier-research-2026-06-13.md) — SOTA research, yield factors, Greek dishes
- [`nutrition-engine-roadmap.md`](nutrition-engine-roadmap.md) · [`ml/correction-flywheel.md`](ml/correction-flywheel.md)

## Ops / security / legal
- [`../DEPLOYMENT.md`](../DEPLOYMENT.md) · [`../RUNBOOK.md`](../RUNBOOK.md) · [`../SECURITY.md`](../SECURITY.md) · [`rls-design.md`](rls-design.md)
- [`legal/dpa-template.md`](legal/dpa-template.md) (DRAFT — counsel review) · [`legal/breach-runbook.md`](legal/breach-runbook.md)
- [`business/pricing.md`](business/pricing.md) (draft) · [`stripe-connect-readiness.md`](stripe-connect-readiness.md) (deferred)
- [`pwa/implementation-plan.md`](pwa/implementation-plan.md) (shipped)

## Archive
`archive/` holds dated/superseded snapshots (audits, plans, monday-prep, May/early-June state). Historical reference only — do not treat as current. Root files `ROADMAP.md`, `TODO-NEXT.md`, `MEETING-NOTES.md`, `CODEX.md` are superseded (see their headers).
