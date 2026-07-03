# Trophē partner walkthrough — meeting ledger (2026-06-24)

Live demo of the seeded coach + client + food-AI surfaces, presented by Daniel. Demo landed well.
This is the first session with **George** on the workout side and sets coach-first tiering as the
product's organizing principle. Source of truth for the strategic frame + this meeting's backlog.

## Attendees
- **Daniel** — founder / builder.
- **Michael** — nutritionist, lead coach partner.
- **George** — trainer / workout-side domain expert. **New** — has not used the app yet.
- **Nikos** — partner / tester.

## Decisions locked
1. **Coach-first tiering.**
   - **Tier 1 = coaches** (nutritionists + trainers) — all robustness, premium AI, and monetization
     target here.
   - **Tier 2/3 = trainee / client** — connected but **not** the primary monetization, and **not**
     adversarial to the coach.
   - **Biggest entity = the gym / organization** (holds nutritionists + trainers).
2. **AI must empower the coach, never undercut.** *"If the trainee learns more from the app than
   from the trainer, you lose the trainer"* (= B2B churn). The client-side moat is **context**
   (per-customer + per-coach AI profile), **not** an open chatbot — clients already have
   Gemini / ChatGPT.
3. **"Grammarly-lock" model for client-side AI.** The client **sees** that insights exist
   ("AI found N things in your profile / form") but must **talk to the coach** to unlock the
   detail. The full assessment opens on the **coach side**. Empowers coach + app + client together
   without replacing the trainer.
4. **Nutrition vs. training are different surfaces.**
   - **Nutrition = crystallized / honest** — clear answers, no technique.
   - **Training = benchmark + technique** — many trainers skip technique, so workout form-check AI
     is sensitive: keep it a **coach tool**, never something that embarrasses or replaces the
     trainer.
   - **Progressive-overload benchmarks** are the fair, measurable axis (squat 100→120 kg over
     3 mo; 400 m time trending down).

## Strategic principle
> **AI empowers the coach; it never replaces them.** The defensible asset on the client side is
> *context* (per-customer + per-coach profile), not raw model access. Surface that insight exists,
> gate the depth through the coach.

## New backlog (from this meeting)
1. **Grammarly-lock client AI gating** — show "insights found"; unlock via the coach; full
   assessment lives coach-side.
2. **Workout AI form-check + progressive-overload benchmarks** — pose-tracking dots, coach-visible,
   gamified vs. goals. WIP with **Daniela**; **gated on George's input**; **NOT** production yet.
3. **Greek supermarket barcode + shopping list** — supermarket API, 20k+ items + barcodes.
4. **Recipe ingestion → benchmark** — Michael sends recipes + rough macros; test one first; target
   90–95% food-AI accuracy.
5. **Intake questionnaire tweak with Michael** — celebrating-what / typical day / sport-habit fit /
   sleep / energy — to enrich the AI profile.
6. **French food accuracy** — ~70% today, needs a French validator. English / Greek / Spanish run
   higher; food-AI claimed **>85%** in-meeting.

## Action items

| Action | Owner | Date |
|--------|-------|------|
| Testing begins — Daniel onboards as a client from scratch | Daniel + Michael | Jun 25 (tomorrow) |
| Nikos appointment | Nikos | Jun 25 |
| George ↔ Michael appointment | George + Michael | Jun 25 |
| Workout mechanics / benchmarks session, 45 min (~3pm Bogotá / GMT-5) | Daniel ↔ George | Mon Jun 29 |
| Accountant — entity decision (Greek vs. US) | Team (Greece) | Next week |
| George onboards to the workout section | George | Next week |
| Recurring Michael meetings (committed cadence) | Daniel + Michael | Recurring |

## Notes
- Demo of seeded coach + client + food-AI surfaces went well.
- George is the new workout-side domain expert; his onboarding + the Jun 29 session are the gate
  on the workout AI backlog item.
