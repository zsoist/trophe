# Daily Nutrafit × Trophē — Master Plan

**Sources:** Daily Nutrafit vision PDF (June 12 2026) + Michael product call +
coach-module plan (docs/plans/coach-module-b2b-plan.md) + current codebase state.
**Thesis:** Trophē already implements ~70% of the Nutrafit Step-3 MVP. This plan maps
the remaining 30%, the market/language expansion, and the enterprise hardening that
makes "operating system of the fitness and nutrition industry" credible.

---

## 0 · Resource map (what we have today)

| Asset | State |
|---|---|
| Production app (trophe.app) | Next.js 16 + Supabase, 46 routes, CI green |
| Coach module | Phases 0-2 SHIPPED: client mgmt, weekly meal plans, messaging (realtime), intake (15-q set), daily check-ins, assessment/goals, KPIs |
| AI agents | 100% DeepSeek text (food parse v7, recipe analyze, coach insight, meal suggest, memory) + Voyage embeddings + Haiku photo |
| Food DB | **~42,950 foods**: OFF ~21.8k · USDA+FNDDS ~13.3k · CIQUAL(FR) · CoFID(UK/EU) · BEDCA(ES) · CREA(IT) · curated GR/CO + barcodes |
| Accuracy | v3 700-set (Greek-weighted, median-of-3): **76.6% pass / 16.0% pooled MAPE** (post-2026-06-14 deterministic reduction); validated 549-subset ~90%; official v2 210 = 94.3% (competitors ≈60-70%) |
| i18n | EN / ES / EL (+FR parse path); custom dictionary ~451 keys |
| Payments scaffold | organizations.stripe_customer_id + stripe_connect_account_id (unused) |
| Compliance scaffold | consents + data_requests + audit_log tables, RLS suite in CI |
| Offered (incoming) | **Greek open-source food DB w/ nutrition + barcodes** (Michael's contact) — get the dump |
| Watchlist | Rex Nutribot (WhatsApp nutrition bot) — competitive teardown |
| Eval infra | run-all evals in CI (95% gate), nutrition release gates, Playwright E2E |

## 1 · Gap map: Nutrafit MVP vs Trophē today

| Nutrafit MVP item | Trophē state | Gap work |
|---|---|---|
| Client management (CRM) | ✅ shipped | polish only |
| Basic AI assistant | ✅ (insight free-tier planned P5) | one-button insight UI |
| Booking system | ❌ | **Phase 3 (next build)** |
| Coaching team mgmt & org | partial (orgs exist) | multi-coach org UI (P6.2) |
| Meal plans | ✅ weekly grid | template library |
| Recipe generator | ✅ agent exists | coach-facing UI + save-to-plan |
| Shopping lists | ❌ | derive from meal plan (small) |
| Training programs | partial (workout logging) | program builder (Daniela track) |
| Injury analysis/projection | ❌ | Step-8 scope — defer, needs medical review |
| Web-only, no mobile apps | ✅ matches our stack | — |
| GDPR | partial scaffold | full pass (P6.4) before beta |

## 2 · Phase plan (supersedes nothing — extends coach-module plan)

> **STATUS 2026-06-13:** P0-P6 SHIPPED to production (CI green). P7 in progress
> (8-language i18n done; German+Dutch food DBs harvested — ~41k foods total).
> Remaining: P7 benchmark scale-up, P8 beta ops, P9 scale. Business/legal track
> (§3) is the gate before Michael's beta cohort.

### P3 — Booking system (Nutrafit core MVP item) — ✅ SHIPPED
Calendar, availability + vacation blocks, 24h-cancel policy, pre-appointment
instructions auto-message; paid bookings premium via Stripe Connect (5-10% fee),
payment-link fallback. (Spec already in coach-module plan.)

### P4 — Coach business KPIs + retention notifications — ✅ SHIPPED
Clients/month, bookings vs last month, capacity indicator, contact-due engine,
churn list, seasonality. (Migration 0029, coach dashboard Business section.)

### P5 — AI everywhere (DeepSeek-only mandate) — ✅ CORE SHIPPED
- One-button client insight (free, rate-limited) + premium context chat (org token budgets)
- **Recipe generator UI** for coaches (agent exists) + AI shopping list from week plan
- Meal-plan draft generator: targets + intake answers → 7-day draft the coach edits
- All text inference DeepSeek; vision stays Haiku until DeepSeek vision is viable

### P6 — B2B/enterprise hardening — ✅ CORE SHIPPED (billing enforcement pending beta)
Billing tiers (Free/Pro/Clinic) DRAFTED in docs/business/pricing.md (enforcement
deferred to post-beta pricing validation); GDPR pass DONE — public /trust page,
signable DPA template, breach runbook, retention + data-location/SCCs transfer statements (docs/legal; hosting is US us-east-2, EU migration planned).
Remaining: Stripe Connect commission wiring, multi-coach org UI, status page, white-label.

### P7 — Accuracy & language/market expansion (parallel, rolling) — 🔄 IN PROGRESS
**DB by Nutrafit market list:**
| Market | Source | Size | Status |
|---|---|---|---|
| Greece/Cyprus | OFF-GR barcodes ✓ + Michael's barcode DB | 3,578 + INCOMING | ✅ OFF-GR done; awaiting Michael's list |
| Germany | OpenFoodFacts DE harvested | **9,059** | ✅ DONE (off-market.ts de) |
| Netherlands | **NEVO** (RIVM) + OFF-NL harvested | 2,150 + **9,186** | ✅ OFF-NL done; NEVO script ready (manual CSV) |
| LATAM/ES | BEDCA ✓ + curated CO ✓ | 751 + curated | ✅ done; SMAE research deferred |
| Portugal/Brazil | OFF-PT ready + INSA PortFIR + TBCA | — | OFF harvester ready; download pending |
| Middle East | curated staples + OFF AR | ~200 curated | research deferred |
| Italy/UK/US/FR | CREA ✓ CoFID ✓ USDA ✓ CIQUAL ✓ | — | ✅ done |

**DB total: ~41,000 foods** (was 24,698). OFF harvester `scripts/ingest/off-market.ts`
generalizes to any market: `npx tsx off-market.ts de nl it pt fr`.

**App i18n:** ✅ DONE — 8 languages live (EN/ES/EL inline + FR/DE/IT/PT/NL overlay
locales, 454 keys each, migration 0030, language picker with flags). Native review
still recommended before each market's public launch. `name_nl` column added (0032);
name_de/name_pt deferred (those markets' OFF names land in name_en + region tag).

**Benchmark:** grow 549 → 1,000-1,500 incl. DE/PT/NL cases; 3-run median; NutriBench
head-to-head; publish methodology (Step-8 "scientific publication" asset).

### P8 — Beta program ops (Nutrafit Step 4)
Instrument: invite codes for 10 nutritionists + 10 coaches + 5 gyms; lifetime-license
flag on orgs; feedback widget (what saves time / what's missing / what would you pay
for); 70% retention dashboard. Michael = pilot #1, his network = recruitment pool.

### P9 — Clients-at-scale + ecosystem (Nutrafit Steps 7-8)
Open client self-signup under a coach code; supplement DB (table exists); progress
analytics; university partnership via benchmark paper.

## 3 · Business/legal track (not code — Daniel + partners)
1. **IP ownership agreement BEFORE more equity conversations** — Trophē predates the
   company; define contributed vs licensed IP in the IKE shareholder agreement.
2. Brand decision: Daily Nutrafit vs Trophē (product vs company naming is fine).
3. Pricing needs numbers: propose Coach Free €0 / Pro €29-39/mo / Clinic €99+/mo,
   annual −20%, validate in beta ("what would you pay for?").
4. GDPR counsel for health-adjacent data (GR retention rules) — blocks document upload.

## 4 · Sequencing (6-8 weeks to closed beta)
| Week | Build | Parallel |
|---|---|---|
| W1 | **Prod promotion + chat verified** · P3 booking schema+UI | Ingest Greek barcode DB; reply to partners |
| W2 | P3 payments + P4 KPIs | NEVO + TBCA/PortFIR ingest; i18n scaffolding DE/IT/PT/NL/FR |
| W3 | P5 AI surfaces (insight, recipes UI, shopping list) | Translation pass (DeepSeek) + benchmark DE/PT cases |
| W4 | P6 billing tiers + org mgmt | GDPR pass docs; p95 latency work |
| W5 | P8 beta instrumentation | Benchmark 1,000; NutriBench run |
| W6 | Polish + Michael UAT v2 | Recruit beta cohort (10/10/5) |

## 5 · Risks
| Risk | Mitigation |
|---|---|
| Vercel git auto-deploy broken (found June 12) | reconnect integration; until then manual `vercel --yes` + explicit prod promotion |
| IP ambiguity | legal item #1 above; no code pause needed but agreement before beta |
| Translation quality (DeepSeek first-pass) | native review gate per market before launch |
| German DB licensing (BLS) | curated OFF subset + benchmark-driven curation instead |
| Scope explosion (gyms/injuries) | Step-8 items stay deferred until 100 paying pros |

## 6 · Success criteria (mirrors Nutrafit doc)
- Beta: 25 professionals active, ≥70% want to continue, "this saves me time" quotes
- Accuracy: ≥95% benchmark @1,000 cases, Cal MAPE <8%, published comparison
- Revenue: first 100 paying professionals in Greece (Step 6)
- Platform: pro can replace spreadsheets+Word+WhatsApp entirely (booking+plans+chat)
