# τροφή (Trophē) — Product Specification

_Last updated: 2026-05-03_

---

## Problem

Professional nutritionists manage clients using spreadsheets, MyFitnessPal, and WhatsApp groups. No platform enforces Precision Nutrition's habit-based methodology at scale while providing AI-powered food tracking, coach analytics, and persistent client memory.

---

## Users

- **Primary: Coaches** — Professional nutritionists managing 10–50+ clients (B2B, paying customer)
- **Secondary: Clients** — Athletes, health-conscious individuals seeking guided coaching (free tier)

---

## Core User Flows

### Client Flow
1. Sign up → onboarding wizard (5 screens: body stats, goal, activity, plan, targets)
2. Daily: log food via text / photo / voice / paste / USDA search / manual entry
3. AI parses input → client reviews and adjusts → confirms → food_log entry saved
4. Daily: check in on assigned habit (one tap) → 14-day cycle → mastered → next
5. Optional: log workouts (sets/reps/RPE, PR detection), track water, log supplements
6. Optional: AI Form Check (MediaPipe Pose, browser WASM — no server)
7. View: calendar, analytics (heatmap, adherence, patterns, monthly report), streaks, badges
8. View: macro food ideas (protein/fiber/fat/carb suggestions based on remaining targets)
9. Recipe Analyzer: paste recipe → AI extracts ingredients + totals → log N servings

### Coach Flow
1. Log in → coach dashboard → see all clients with behavioral signals (green/yellow/red)
2. Assign one habit at a time → monitor compliance → adjust when needed
3. Set/override client macro targets (Mifflin-St Jeor + ISSN auto-calc button)
4. Deep-dive any client: food log, workout history, notes, trends, patterns, memory blocks
5. Create supplement protocols → assign to clients
6. Create workout templates → assign to clients
7. Coach inbox: urgency-sorted client activity feed (gold border = ≥3 days off-plan)
8. Export client report (Markdown)
9. View/edit Letta memory blocks about clients

### Recipe Analyzer Flow
1. Click "🍲 Recipe" on food log page
2. Paste recipe text (EN/ES/EL) + specify yield
3. AI (Haiku 4.5) extracts ingredients → canonical grams → totals + per-serving macros
4. Preview: per-serving hero card (kcal + P/C/F/Fiber) + collapsible ingredient list
5. Slider: choose servings eaten (0.25× to full)
6. Select meal slot → log as single `food_log` entry

### AI Form Check Flow
1. Client opens Form Check → selects exercise + side
2. Camera opens → MediaPipe Pose detects 33 landmarks (browser WASM, 30+ FPS)
3. Real-time: green skeleton overlay, angle readout, rep counter
4. Finish → per-rep scoring against reference dataset
5. Results: 5-tier assessment → saved to `form_analyses` table

---

## AI Architecture (v0.3 — `/agents/` pattern)

Every LLM-backed feature has a consistent `run(input) → { ok, output, telemetry }` contract:

```
agents/
  router/           # task → model selection (never hardcode models in agents)
  clients/          # anthropic.ts, google.ts (thin API wrappers)
  observability/    # langfuse.ts (OTel traces), otel.ts (semconv)
  memory/           # read.ts, write.ts, coach-blocks.ts (Mem0/Letta hybrid)
  food-parse/       # index.ts (LLM identifies only), lookup.ts (deterministic macros)
  recipe-analyze/   # index.ts
  insights/         # wearable-summary.ts (Spike → Sonnet 4.6 → coach text)
  evals/            # run-all.ts + multi-layer/ (schema, LLM judge, regression)
  prompts/          # versioned .md prompt files
  schemas/          # input/output types per agent
```

**v0.3 food-parse fix**: LLM identifies `{food_name, qty, unit}` only. `lookup.ts` does pgvector + pg_trgm hybrid retrieval → `foods` table supplies all macros. Macros computed as `grams × kcal_per_100g / 100`. **LLM never emits a number.** Target accuracy: ≥95% (was ~81% with LLM-guessed values).

**LLM routing** (cost-optimized):
- `food_parse` → Gemini 2.5 Flash (~$0.05/active-day vs Haiku $0.40)
- `recipe` → Haiku 4.5 + ephemeral cache (~70% spend reduction)
- `coach_insight` → Sonnet 4.6 (reasoning over week of data)
- `embed` → Voyage v4 `voyage-large-2` 1024-dim

---

## Michael Kavdas Vision (April 9, 2026)

- The nutritionist is the customer, not the athlete
- AI as assistant, not replacement (human-in-the-loop)
- East meets West: Greek ancient medicine + Chinese medicine + Western research
- Per-client AI agents with persistent "core memories" (implemented in Phase 5)
- Endgame: distill model from nutritionist decisions → AI IS the nutritionist

---

## Technical Requirements

| Requirement | Status |
|-------------|--------|
| Trilingual UI (EN/ES/EL) — 600+ translated strings | ✅ |
| Evidence-based calculations (Mifflin-St Jeor BMR, ISSN protein targets) | ✅ |
| Never `.single()` — always `.maybeSingle()` | ✅ |
| TypeScript strict mode, 0 errors | ✅ |
| Mobile-first (390×844) | ✅ |
| AI cost < $2/month/coach | ✅ (target; Gemini Flash routing helps) |
| Security headers (CSP, X-Frame-Options, X-XSS-Protection, Referrer-Policy) | ✅ |
| Server-side auth middleware with JWT verification + role routing | ✅ (Phase 2) |
| Input sanitization on all AI routes (length cap + control char strip) | ✅ |
| SQL injection prevention on search routes | ✅ |
| Prompt injection defense on AI routes | ✅ |
| RLS on every client-accessible table | ✅ |
| 4-tier role enum (super_admin > admin > coach > client) | ✅ (Phase 1) |
| HTTP-only cookie sessions (`@supabase/ssr`) | ✅ (Phase 2) |
| Versioned DB migrations (Drizzle Kit) | ✅ (Phase 0) |
| LLM observability (Langfuse + OTel) | ✅ (Phase 3) |
| Deterministic food macros (≥95% accuracy) | ✅ (Phase 4) |
| Agent memory system (Mem0/Letta hybrid) | ✅ (Phase 5) |
| Wearable integrations (Spike API) | ✅ (Phase 6) |
| tRPC v11 internal API | ✅ (Phase 7) |

---

## Three-Tier Product Vision (validated April 14, 2026)

1. **Tier 1 — Coach Tool** (current): SaaS for nutritionists. Per-coach subscription, clients free. Habit methodology + AI food tracking + coach dashboard.
2. **Tier 2 — Self-Service Tracker**: Consumer app for individuals without a coach. Freemium. AI-powered food logging + habit engine + insights.
3. **Tier 3 — B2B Platform**: Multi-tenant for gyms and clinics. Stripe Connect for billing. White-label option. Central admin + multiple coaches + their clients.

Payment standard: **Stripe Connect** (marketplace model for multi-tenant billing).

---

## Success Criteria

### Shipped ✅
- Michael demo delivered (April 9)
- Michael's account created (coach role)
- Demo page with EN/EL toggle
- AI Form Check working in browser
- 6-agent security audit completed with 28 fixes (April 14)
- Coach macro targets editor shipped (April 14)
- Market research and three-tier vision validated (April 14)
- 50 coach components built + integrated (April 16)
- Light/dark theme toggle (Michael Feedback #3)
- April 20 partnership meeting held (Michael + George Tsatsaronis)
- v0.3 overhaul: Phases 0–8 complete and locally green
- Food accuracy fix: deterministic pipeline (lookup.ts), ≥95% CI gate

### Pending
- [ ] Phase 9 production cutover (operator-gated)
- [ ] USDA registered API key (replace DEMO_KEY)
- [ ] Supabase Pro (PITR backups)
- [ ] Spike sandbox + wearable testing
- [ ] Apple/Google OAuth provisioning
- [ ] Playwright E2E test suite
- [ ] Legal entity established
- [ ] Pricing model finalized
- [ ] Onboard 2–3 more beta nutritionists
