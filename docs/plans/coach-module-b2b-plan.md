# Trophē Coach Module & B2B Production Plan

**Source:** Michael Kavdas product call, June 12 2026 + B2B readiness audit
**Goal:** Implement all of Michael's requested changes, elevate the coach experience to
premium quality, and make Trophē genuinely B2B production-ready (multi-coach, billable,
GDPR-compliant, enterprise-accurate).

**Current state (grounding):**
- Coach surface exists: dashboard w/ risk heatmap, client detail, meal plan editor,
  habits/protocols/templates, coach notes (4 types). No messaging, no calendar, no intake.
- Stripe Connect fields already on `organizations` (customer + connect account + status) —
  payments groundwork exists, no checkout flow yet.
- i18n: custom trilingual dictionary (EN/ES/EL), 451 keys.
- Nutrition engine: ~42,950 foods, benchmark v3 700-set 76.6% pass / 16.0% pooled MAPE (median-of-3, post-2026-06-14 deterministic reduction; v2 official 94.3%), CI green.

---

## Phase 0 — Michael's Monday Deliverable (quick wins, 1 session)

Everything Michael asked for that touches existing surfaces. No new tables.

| # | Change | Where |
|---|--------|-------|
| 0.1 | Coach weekly meal-plan view (7-day grid, per-meal rows, copy-day) | `/coach/client/[id]/plan` |
| 0.2 | "Assessment" free-text block ABOVE goals on client profile (interview notes) | client detail |
| 0.3 | Metric tooltips — every KPI explains itself ("7-day streak = …") | coach dashboard |
| 0.4 | Font-size toggle (normal / large) persisted per coach | settings + CSS var |
| 0.5 | Comparison windows: replace week-vs-week with **2w-vs-2w and month-vs-month** (body reacts ~2w delayed) | client detail charts |
| 0.6 | Remove auto "plateau" label → optional custom "stabilization" status set by coach | client detail |
| 0.7 | Custom goals: title + metric + time window; goals are editable/replaceable (weight → blood markers → habits) | client_profiles |
| 0.8 | Coach notes color system on CLIENT dashboard: check-in blue, progression green, concern red, general white; coach messages pinned TOP | dashboard |
| 0.9 | Client view simplification: hide calorie/adherence % from clients; remove unsolicited "food ideas"; recipes clickable ONLY from meal-plan items | dashboard |
| 0.10 | Meal-plan macro targets: kcal auto-computed from P/C/F (4/4/9, alcohol 7) — read-only derived field | plan editor |
| 0.11 | Habit custom colors + "Michael says: …" coach message strip at top of client dashboard | dashboard |

**Definition of done:** Michael walks through on Tuesday call and every item from the
transcript is visibly addressed.

---

## Phase 1 — Unified Messaging (the killer feature, ~2 sessions)

Kills the WhatsApp/Viber/IG/iMessage chaos. Foundation for the AI client profile.

**Schema:** `conversations` (coach_id, client_id, last_message_at, unread_coach,
unread_client), `messages` (conversation_id, sender_id, body, kind: text|note|attachment,
read_at, created_at). RLS: participants only.

**Build:**
- Supabase Realtime channel per conversation (already on Supabase — no new infra).
- Coach inbox at `/coach/inbox` (upgrade existing read-only page): unified list sorted by
  unread, batch "mark handled", client quick-context sidebar (last check-in, current plan).
- Client chat at `/dashboard/messages` with the color-coded coach-note types inlined.
- Push/email notification on new message (Supabase edge function or Vercel cron digest).
- "48-messages problem": auto-collapse consecutive client messages into one thread blob.

**Premium hook:** message history feeds the per-client AI context (Phase 5).

---

## Phase 2 — Intake & Daily Check-ins (~2 sessions)

**Intake questionnaire:**
- Schema: `questionnaires` (coach_id, title, is_default), `questionnaire_questions`
  (type: text|boolean|select|scale, order, required), `questionnaire_responses`.
- Ship the **default 15-question set** (from Michael: surgeries/metal implants — affects
  bioimpedance, hospitalizations phrasing, digestion, sleep, typical-day narrative).
- Coach can append custom questions saved to their profile (his "Chinese medicine +5"
  example). Sent to client pre-appointment; responses land in the assessment block (0.2).

**Daily client check-in (light, optional):**
- Extend `habit_checkins` or new `daily_checkins`: mood (exists), bowel movement (bool),
  sleep ≥8h (bool), energy (scale), water (bool), custom coach-defined fields.
- Purpose is dual: context for coach AND client self-awareness (Michael: "they start
  acknowledging what matters").
- Weekly diary view for coach: the "food + signals" picture per client.

**⚠️ GDPR gate (blocking research item before building blood-exam upload):**
- Blood exams / medical documents: **client-device storage only**, explicit send-to-coach,
  encrypted at rest, visible only after send. Michael flags possible 10-year retention
  duty for Greek practitioners IF stored — research EU/GR health-data rules first.
  Until resolved: intake stores lifestyle answers only, NO document upload.

---

## Phase 3 — Calendar & Paid Bookings (~2-3 sessions)

- Schema: `appointments` (coach_id, client_id, starts_at, duration, status, kind:
  office|call|text, price_cents, paid, cancellation_deadline), `coach_availability`
  (weekly windows + vacation blocks — Michael's "don't book me September" case).
- Calendar **default feature** (free): availability, booking, 24h-cancellation policy
  with auto "you'll be charged" notice, pre-appointment instructions auto-message
  ("no food/drink 3h before" — Michael's flow).
- **Paid bookings = premium**: Stripe Checkout w/ Connect (fields already exist on orgs).
  Platform fee 5-10% on consults booked in-app. Fallback for Stripe-averse coaches:
  payment-link field (Revolut/Apple Pay deep link) with manual "mark paid".
- Booking reminders: client notification T-24h; coach digest each morning.
- ICS export + Google Calendar one-way sync (premium, later).

---

## Phase 4 — Coach KPIs & Retention Notifications (~1-2 sessions)

The numbers Michael actually runs his business on:

- **KPI bar:** clients this month, appointments booked this month vs last, appointments
  done, active clients, revenue (from Phase 3 data), capacity indicator ("70/100 — safe
  to advertise" heuristic, threshold coach-configurable).
- **Contact-due engine:** per-client cadence (weekly/2w/monthly/3-monthly) →
  notifications: "feedback due", "measurement due", "client X should book by September
  or consider churned". Surfaced on dashboard top + optional email digest.
- Churn list: clients past cadence + no booking = at-risk-of-churn section.
- Seasonality view: appointments by month (his June/July peak vs December trough).

---

## Phase 5 — Coach AI (deterministic core, premium chat) (~2 sessions)

Per Michael: don't feel 100% AI; clients buy human hyper-personalization.

- **Free tier:** one-button "Client insight" — single DeepSeek prompt over structured
  client context (assessment, last 14d logs, check-ins, goals) → one structured insight.
  Deterministic template, rate-limited (e.g. 3/client/day).
- **Premium tier:** chat-with-client-context, token-budgeted per org (reuse
  `organization_ai_budgets` table), hard caps + spend meter visible to coach.
- **Calorie/macro calculator:** deterministic Mifflin-St Jeor + activity + goal
  adjustments, coach-tweakable variables; Michael supplies his adjustment examples.
  Output pre-fills meal-plan targets (0.10).
- Guardrails: insights always labeled "draft for your review", never sent to client
  automatically.

---

## Phase 6 — B2B Production Hardening (parallel track, ~3 sessions)

What "truly B2B-ready" requires beyond features:

1. **Billing & packaging:** define tiers (Coach Free: 5 clients / Coach Pro: messaging+
   calendar+AI insights / Clinic: multi-coach org + API). Stripe subscriptions on the
   existing org fields; self-serve upgrade page; usage metering for AI.
2. **Multi-coach orgs:** org → many coaches → many clients; role checks already exist
   (`requireRole`) — add org-scoped RLS audit + client-transfer flow.
3. **Coach onboarding:** guided first-run (import clients CSV, default questionnaire,
   availability setup) — time-to-first-value < 15 min.
4. **Compliance:** GDPR DPA template, data-export endpoint (client requests their data),
   delete-account flow with cascade, retention policy doc, EU data residency statement
   (Supabase region), audit log table for coach access to client data.
5. **Reliability:** p95 latency budget on parse API (current 8.2s → target <3.5s: cache
   warm paths, parallelize lookup+LLM), uptime monitoring already via Uptime Kuma — add
   public status page; error budget + Sentry (or Langfuse alerting) on API 5xx.
6. **Security posture:** the middleware fail-safe (done), RLS test suite green in CI
   (done), secrets rotation calendar, rate limits on auth + parse endpoints (durable
   rate limits table exists — verify coverage).
7. **White-label seeds:** org logo/color on client dashboard (premium) — cheap, high
   perceived value for clinics.

---

## Phase 7 — Accuracy & Market-Proof Track (parallel, ongoing)

Feeds the "most accurate on the market" claim:

1. **Michael's Greek foods wave 1** → DB + benchmark cases (he validates values by heart).
2. **Raw↔cooked conversions** (meat −20-25%, fish −30%) + palm/handful/"couple" vague
   units — likely a big chunk of the fat-MAPE 16.1% problem.
3. Benchmark 549 → **1,000-1,500 cases** (academic-paper threshold), 3-run median scoring.
4. DB 21K → **25-30K** (German DB next per Michael; OFF retry when API recovers).
5. **Score on NutriBench + competitor datasets** with identical protocol → marketing +
   paper claim. Target: Cal MAPE <8%, fat <12%, Acc@7.5 >45%.
6. Resolve the masked-lookup investigation (spawned task) + dish_recipes↔foods audit.

---

## Sequencing & estimates

| Week | Track A (features) | Track B (parallel) |
|------|--------------------|--------------------|
| W1 (now) | Phase 0 (Mon deliverable) → Michael review Tue | Phase 7.1-7.2 Greek foods + conversions |
| W1-W2 | Phase 1 messaging | Phase 6.4 GDPR research (blocks Phase 2 uploads) |
| W2-W3 | Phase 2 intake + check-ins | Phase 6.1 billing tiers |
| W3-W4 | Phase 3 calendar + payments | Phase 7.3 benchmark 1,000 |
| W4-W5 | Phase 4 KPIs + Phase 5 AI | Phase 6.2-6.7 hardening |
| W6 | Polish + Michael full UAT + first external coach pilot | Phase 7.5 NutriBench comparison |

**Estimate:** ~15-18 build sessions over ~6 weeks to "external coach pilot" quality.

## Risks

| Risk | Mitigation |
|------|------------|
| GDPR medical data | Phase 2 ships WITHOUT document upload until research done |
| Stripe Connect onboarding friction for coaches | payment-link fallback, calendar still free |
| AI cost blowup on premium chat | org token budgets (table exists) + hard caps |
| Scope creep before Michael validates | Phase 0 ships first; everything else gated on Tue feedback |
| Realtime messaging at scale | Supabase Realtime fine to ~1k concurrent; revisit at clinic tier |

## Success metrics

- Michael UAT: all 11 transcript items ✅; he runs one real client week fully in-app.
- Coach time-to-first-value < 15 min; messaging replaces ≥2 external channels for pilot.
- Benchmark ≥95% pass, Cal MAPE <8% at 1,000 cases; NutriBench head-to-head published.
- First paying B2B coach (not Michael) on Coach Pro tier.
