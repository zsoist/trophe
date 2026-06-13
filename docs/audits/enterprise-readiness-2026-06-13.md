# Trophē — Real B2B Enterprise Readiness Scorecard + Path to 100 (2026-06-13)

Scored against what a **real Greek/EU clinic's procurement actually demands** — security
questionnaire + DPO GDPR review + IT/SRE due-diligence + commercial evaluation. This is a
HARSHER lens than the engineering-quality audit (~7.7): binary blockers (no backups, China
data transfer, no executed DPA, no billing) gate a signature regardless of code quality.

## Consolidated scorecard

| Lens | Composite | Headline |
|---|---:|---|
| Security & GDPR | **6.0 / 10** | Strong RLS migration 0008 + invite security; blocked by TS-schema drift, DeepSeek third-country transfer, thin audit trail, unbuilt consent-withdrawal/erasure |
| Reliability & Ops | **4.2 / 10** | Good CI/cost-governance; **no automated backups for Art.9 data** + **no alerting** are hard blockers |
| Product & Commercial | **4.2 / 10** | Deep workflow + novel AI; **no billing, no pricing page, no multi-coach UI** |
| **OVERALL ENTERPRISE** | **≈ 4.8 / 10** | A strong alpha; ~6–8 focused weeks + a few legal/config decisions from clinic-saleable |

Per-dimension: RLS 6.5 · AuthN/Z 7.5 · GDPR 5.5 · Secrets 7.5 · Audit 5.0 · Multi-org 7.0 ·
Availability 4.5 · DR/Backups 2.5 · Observability 4.0 · Performance 5.0 · Scalability 4.5 ·
Deploy 5.5 · Onboarding 5.0 · Workflow 6.0 · Monetization 1.0 · Clinic-tier 2.0 · AI-delivered 6.0 · Trust 5.0.

## What's genuinely strong (don't regress)
Migration 0008 RLS hardening (private. SECURITY DEFINER, anon revoked, fail-closed); invite-code
role elevation (role from DB, race-safe increment); consent capture w/ evidence; getUser() auth +
fail-closed middleware; AI cost governance (per-org budgets, kill switch, agent_runs); deep CI
(gitleaks full-history, npm audit, RLS suite, eval gate); CSP excludes AI origins; wearable token
encryption; the grounded/cited CoachInsightPanel (no competitor has it); trilingual Greek food parsing.

---

# PATH TO 100 — prioritized by what blocks a real clinic signature

## TIER 0 — Legal / data-loss BLOCKERS (no clinic signs without these)
| Item | Owner | Effort | Note |
|---|---|---|---|
| **Supabase Pro + PITR backups** | You ($25/mo) | config | Prod is on FREE tier — zero backups for Art.9 health data. #1 blocker. Run a restore drill after. |
| **DeepSeek third-country transfer basis** | You + counsel + eng | medium | DeepSeek (China) has no GDPR adequacy. Options: (a) execute SCCs if offered; (b) **data-minimization** — confirm + document that only food TEXT (no identity) is sent, never identified health records; (c) route Art.9-adjacent calls through an EU/adequate model. Tension with the DeepSeek-only cost mandate — a real decision. |
| **Executed DPA + DPIA** | Counsel | legal | DPA template EXISTS (docs/legal/dpa-template.md) — needs Greek/EU counsel review + a signable/self-serve flow. DPIA (Art.35) for AI+health not yet written. |
| **Consent-withdrawal + erasure endpoints + true cascade** | Eng | medium | Trust page promises both; neither is implemented. `agent_runs.user_id` has no FK cascade → orphaned records after deletion. Build `PATCH /api/privacy/consent` + cascade-delete worker. |

## TIER 1 — Security / Ops HIGH (security review will flag)
| Item | Owner | Effort |
|---|---|---|
| **Align 46 TS-schema `TO public` → authenticated** (9 files) | Eng | mechanical, drift-immune (prod already correct via 0008) — removes the "drift bomb" + passes code review |
| **Audit-log coverage** — wire recordAuditEvent into login, role-elevation, coach-note CRUD, measurements, AI inference | Eng | medium |
| **Push alerting + uptime monitoring** (Sentry/equivalent + status page) | Eng+config | medium — detection is currently "user report" |
| **Fix nightly-benchmark CI secrets + reconnect Vercel auto-deploy** | Config | low — quality signal is dark; deploys are manual |
| **Supavisor pooling correctness** (`?pgbouncer=true`, bounded pool) | Eng+config | low — fixes the c=10 burst failures + connection exhaustion |
| **Migration journal duplicate-prefix review** (0008-0015 doubled) | Eng | review — branch-merge artifact; document apply-order determinism |

## TIER 2 — Commercial (blocks getting PAID)
| Item | Effort | Note |
|---|---|---|
| **Stripe subscriptions + plan enforcement** | large | none installed; see latency-mvp-plan B2 + Greek myDATA caveat |
| **Public /pricing page** | low | draft exists in docs/business/pricing.md → ship a page |
| **Multi-coach / clinic admin UI** | medium | the €99 tier has no UI (seats, client transfer, per-coach KPIs) |
| **Email invite delivery** (Resend/SES) | low-med | coaches currently copy links manually |
| **Fix ClientComparison hardcoded macros** | hours | fabricated data visible in demo — trust-killer |
| **Coach AI UIs** (recipe / meal-plan draft / shopping) | medium | backends exist, no UI |

## TIER 3 — Performance (latency 5→9)
Streaming responses · fast DB-bypass path · semantic cache · prefix-cache front-load (A/B). (Plan A3.)

## Realistic scoring trajectory
- Close Tier 0 → enterprise ~6.5 (legally signable for a careful clinic).
- + Tier 1 → ~7.8 (passes a security questionnaire).
- + Tier 2 → ~8.7 (commercially sellable, billable).
- + Tier 3 + EU migration + fine-tune accuracy → ~9.5 (truly world-class B2B).

10/10 is asymptotic (SOC 2 Type II, pen test, 99.9% measured SLA, multi-region DR) — appropriate
only at clinic-scale revenue, not pre-beta. The honest near-term target is **Tier 0+1 before the
first paying Greek clinic, Tier 2 before scaling the cohort.**

## Cheap eng wins doable now (no external deps)
TS-schema alignment · ClientComparison fix · public pricing page · consent-withdrawal endpoint ·
audit-log coverage · Supavisor pooling · nightly-benchmark secrets. These move Security/Ops/Product
several points without any purchase or legal step.
