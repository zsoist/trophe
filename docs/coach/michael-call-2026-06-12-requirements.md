# Michael Kavdas call — requirements ledger (2026-06-12, captured 2026-06-13)

Michael = Greek nutritionist partner + domain expert ("testing bot"). This is the **second,
detailed** pass (a live app walkthrough), richer than the first call that produced P0–P6.
Source of truth for coach-side scope. Build status verified against current code 2026-06-13.

## Decisions locked
1. **Prod = 100% DeepSeek.** Anthropic "Fable" was offline-assessment only; disabled by Anthropic
   ToS. Fable-era numbers (82% / cal-MAPE <10%) are NOT current prod truth.
2. **Benchmark: 500-case set = OFFICIAL; 700+ = backup.** Re-run both.
3. **Implement all requests EXCEPT payment/external-account ones** (defer Stripe + commission,
   WhatsApp/Telegram bridge, premium token tiers).

## Coverage map

### ✅ Shipped (P0–P6)
Unified messaging · booking + 24h-cancel flag · intake questionnaire (default 15) + daily check-ins
(poop/sleep/energy/water + mood) · assessment free-text · goal {title,metric,window} · coach notes
4 categories · contact-cadence engine · font toggle · kcal derived from P/C/F (4/4/9) · alcohol in
DB · workout module · AI client snapshot + one-shot coach insight · recipe-analyze · meal-suggest
(now coach-facing) · feedback widget · shopping-list (extraction; aggregation TODO(human)).

### 🟡 Built but needs rework per Call 2
- **PlateauDetector** → reframe to "stabilization" (custom field; goals not only weight). `client_profiles.stabilization` exists; UI still says "Plateau".
- **Comparison windows** → default month / rolling-2-week (body reacts ~2wk delayed); week-vs-week too narrow. `ClientComparison` has no window param.
- **AI coach assistant** → keep ONE-shot, deterministic, capped ("Trophē codes"); avoid full chatbot (cost/over-reliance/bad-assessment). Premium token tiers = deferred (payment).
- **Business KPIs** → add clients/month, appointments last month, revenue forecast (needs billing), churn, "should-I-advertise" signal.
- **Pinned coach message** → first thing client sees, top of dashboard. No PinnedCoachNote component found.
- **Metric clarity** → "7-day streak" confused Michael; per-metric "what/where-from" tooltips.

### 🔴 New — not built
1. **Per-day meal-plan macro rollup** — parse free-text cells → actual macros vs target. "The app counts for me." Reuse food-parse lookup+enrich / shopping-extract.
2. **Clickable meal → recipe breakdown** — "3 cups lentil soup" → Greek fakés recipe + approx macros. Reuse recipe-analyze + dish_recipes.
3. **Hide calories + cal-adherence + food-ideas from CLIENT view** (coach-only) — confuses clients, causes deviation. Behavior change, not addition.
4. **Blood-report / medical-doc upload** — send-gated, encrypted, ~10yr retention. Art.9 design needed.
5. **Custom questionnaire builder** — coach adds 5–10 own Qs on default 15. Schema exists (0027); needs UI+API.
6. **3-level prescription model** — vague / gram-precise / recipe-level. Editor must handle all three.
7. **Raw→cooked yields + household portions** — see frontier-research doc. Partial Greek fixes only today.
8. **Graduated / expected-return-month + churn** — flag client expected back month X; else churned.
9. **Stripe paid booking + 5–10% commission** — DEFERRED (payment). Stripe/Revolut/Apple Pay; coaches resist creating Stripe.
10. **WhatsApp/Telegram bridge** — DEFERRED (external account).
11. **Deterministic calorie equation** (body-comp+height→kcal, coach-editable) — Mifflin-St Jeor/Katch-McArdle; Michael supplies tweaks. `client_profiles.bmr/tdee` exist; no calc in code.
12. **Automated pre-appointment message** (location, 3h fasting, 24h-cancel) — reuse `appointments.note`.

## Michael's domain inputs (his action items → integrate)
- **Common Greek foods/dishes list** (wave 1, weekend) → benchmark + DB.
- **Prescription styles**: vague coaching vs precise grams vs recipe-implicit dishes.
- **Portion heuristics**: 1 fruit = fits-in-palm ≈ 60 kcal (banana=2, melon≈4, 2 kiwis=1); beef patty = palm ≈ 200g raw / 170–180g cooked; meat −20–25% cooked, fish −30%; support "handful/couple/palm".
- **Clinical interview question set** + pre-appointment requirements text.
- **Calorie equation + worked examples**; validates benchmark "by heart" (3-egg omelet ≈ 160–180 kcal + cooking-fat nuance).

## Constraints
- **GDPR (Art.9):** blood exams encrypted, coach-view only on explicit send, no always-on; ~10yr retention if stored. Research before building.
- **Not 100% AI:** clients value human hyper-personalization; AI assists the coach, never replaces.

## Build sequencing → see project_trophe_coach_module memory (Wave 1–4) + frontier-research doc.
