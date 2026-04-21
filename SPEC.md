# τροφή (Trophe) — Precision Nutrition Coaching Platform

## Problem
Professional nutritionists manage clients using spreadsheets, MyFitnessPal, and WhatsApp groups. No platform enforces Precision Nutrition's habit-based methodology at scale while providing AI-powered food tracking and coach analytics.

## Users
- **Primary: Coaches** — Professional nutritionists managing 10-50+ clients (B2B, paying customer)
- **Secondary: Clients** — Athletes, health-conscious individuals seeking guided coaching (free)

## Core Flows

### Client Flow
1. Sign up → onboarding wizard → body stats → calculated macros (Mifflin-St Jeor + ISSN)
2. Daily: log food (text/photo/voice/paste/manual) → AI parses → review → confirm
3. Daily: check in on assigned habit (one tap) → 14-day cycle → mastered → next habit
4. Optional: log workouts, track water, take supplements, run AI Form Check
5. View: calendar, trends, insights, scores, streaks, badges
6. View: macro food ideas (protein, fiber, fat, carb suggestions based on remaining targets)

### Coach Flow
1. Log in → coach dashboard → see all clients with behavioral signals (green/yellow/red)
2. Assign habits one at a time → monitor compliance → adjust when needed
3. Create supplement protocols with evidence levels → assign to clients
4. Create workout templates → assign to clients
5. Deep-dive: food log, workout history, form check results, notes
6. Set/override client macro targets (calories, protein, carbs, fat, fiber, water) with Auto-calc button (Mifflin-St Jeor + ISSN)

### Recipe Analyzer Flow (April 18)
1. Client clicks "🍲 Recipe" on food log page
2. Paste recipe text (English / Spanish / Greek) + specify yield (servings)
3. AI extracts each ingredient → canonical grams → total + per-serving macros
4. Preview: recipe name, per-serving hero card (kcal + P/C/F/Fiber), collapsible ingredient breakdown
5. Slider: how many servings did you eat (0.25× to full recipe)
6. Meal picker → log as single `food_log` entry named "Recipe Name (1.5 servings)"

### AI Form Check Flow (new)
1. Client opens Form Check → selects exercise + side
2. Camera opens → MediaPipe Pose detects 33 landmarks (browser WASM, 30+ FPS)
3. Real-time: skeleton overlay (green), angle readout, rep counter
4. Finish → per-rep scoring against reference dataset
5. Results: 5-tier assessment (buen ejercicio → riesgo de lesion)

## Michael Kavdas Vision (from April 9 meeting)
- The nutritionist is the customer, not the athlete
- AI as assistant, not replacement (human-in-the-loop)
- East meets West: Greek ancient medicine + Chinese medicine + Western research
- Per-client AI agents with persistent "core memories"
- Endgame: distill model from nutritionist decisions → AI IS the nutritionist

## Success Criteria
- [x] Michael demo delivered (April 9)
- [x] Michael's account created (coach role)
- [x] Demo page with EN/EL toggle
- [x] AI Form Check working in browser
- [x] 6-agent security audit completed with 28 fixes (April 14)
- [x] Coach macro targets editor shipped (April 14)
- [x] Market research and three-tier vision validated (April 14)
- [ ] 3 test subjects actively using app (April 10-18)
- [ ] Michael using coach dashboard daily
- [ ] Bug report and feature feedback collected
- [x] ✅ Reconvene meeting (April 16-18)
- [ ] April 20 meeting (Kavdas + Tsatsaronis + Reyes + Gutiérrez): product direction aligned, cut list agreed, partnership decision *timeline* set
- [ ] Legal entity discussion initiated

## AI Architecture (`/agents/` pattern, April 18)

All LLM-backed features live under `/agents/` with a consistent `run(input) → { ok, output, telemetry }` contract:

```
agents/
  prompts/<agent>.<version>.md    # versioned prompt templates, git-diffable
  clients/anthropic.ts            # Messages API wrapper with cache_control
  schemas/<agent>.ts              # zod-style input/output types + validators
  <agent>/
    index.ts                      # public run() — the only export routes call
    extract.ts                    # LLM output parsing/normalization
    enrich.ts                     # post-processing (local DB lookups)
  README.md                       # pattern + versioning conventions
```

Current agents: `food-parse` (v3, Haiku 4.5 + cache), `recipe-analyze` (v1, Haiku 4.5 + cache). Prompt caching (`cache_control: ephemeral`) on system prompts yields ~90% discount on cached tokens within the 5-minute TTL; projected ~70% Anthropic spend reduction at steady state. Routes shrink to thin adapters (food-parse route: 258 → 51 LOC).

Planned v0.2 additions: promptfoo golden-set evals, Langfuse prompt registry push on deploy, Playwright E2E against the stack.

## Technical Requirements
- Trilingual UI (EN/ES/EL) — 200+ translated strings
- Evidence-based calculations (Mifflin-St Jeor BMR, ISSN protein targets)
- Zero .single() calls (use .maybeSingle() always)
- TypeScript strict mode, 0 errors
- Mobile-first (390x844)
- Deploy with `vercel --yes --prod` (env vars are Production-only)
- AI cost < $2/month per coach
- Security headers on all responses (CSP, X-Frame-Options, X-XSS-Protection, Referrer-Policy)
- Server-side auth middleware with JWT verification + role-based routing
- Input sanitization on all AI routes (500 char cap, control char strip)
- SQL injection prevention on all search routes (sanitized ilike)

## Three-Tier Product Vision (validated April 14)
1. **Tier 1 — Coach Tool** (current): SaaS for nutritionists. Per-coach subscription, clients free. Habit methodology + AI food tracking + coach dashboard.
2. **Tier 2 — Self-Service Tracker**: Consumer app for individuals without a coach. Freemium model. AI-powered food logging + habit engine + insights.
3. **Tier 3 — B2B Platform**: Multi-tenant for gyms and clinics. Stripe Connect for billing. White-label option. Central admin + multiple coaches + their clients.

Payment standard: Stripe Connect (marketplace model for multi-tenant billing).
