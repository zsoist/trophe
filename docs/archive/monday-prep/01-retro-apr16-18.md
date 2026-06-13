# Testing Retrospective — April 16-18, 2026

**Testers**: Michael Kavdas (coach), Nikos (client/athlete), Dimitra (Greek client), Daniela (both), Daniel (both)
**Duration**: 3 days
**Author**: Daniel · **For**: internal + Monday 04-20 meeting prep

---

## What worked ✅

- **AI food logging**: parsing is the single most-praised feature. Testers pasted free-form text in three languages and got structured, macro-calibrated entries. Recipe-analyzer (new Sat) extends this — Michael's exact ask.
- **Aesthetic + feel**: "premium" was unprompted from Nikos and Dimitra. Gold accent, glass cards, and mobile-first 390×844 design land. Light/dark toggle now works end-to-end (shipped Sat).
- **The coaching concept**: one habit, 14-day cycle, evidence-based macros. Michael's methodology translated well. Nikos understood the habit engine without explanation.
- **Performance**: no complaints about speed. Prompt caching (shipped Sat) will cut Anthropic spend ~70% when Michael scales.
- **Trust**: testers trusted the numbers after we fixed the serving-size DB entries (Apr 16 — 22 entries rewritten, protein was +20-30% overestimated).

## What didn't ❌

- **Michael couldn't log in (Apr 16 AM)**: CSP wildcard blocked Supabase on iOS. Cost ~3 hours of testing time. Fixed Apr 15, but the scar tissue is his.
- **Michael didn't find coach plan creation**: there's no nutrition-plan builder yet. He expected one. Our coach flow is habit-assignment + macro-override + notes — not "generate a plan." Gap.
- **Nikos: "workout shouldn't exist"** — he wants a nutrition app, not a dual product. Workout module (113 exercises, AI Form Check, PR detection) is a big surface he'd rather not see. Confirms the product is too wide.
- **AI still exaggerates macros occasionally**: golden-eval set (building today) will expose which foods drift. Serving-size fixes helped but didn't close the loop.
- **UI misaligned** on dashboard: rings not visually centered, hero metric ("calories today") isn't the metric every user cares about. Michael wants habit streak; Nikos wants protein hit.

## What to cut ✂️

Forcing ourselves to say no, in descending order of confidence:

1. **Workout module depth** — strongest cut candidate. Nikos said outright, Michael never used it. Keep basic logging; deprioritize form check, PR detection, template system, volume tracking. **Public decision for Monday.**
2. **Trilingual EL (Greek) maintenance** — unless Michael insists. We're paying for 3-language parity on every new string; Michael runs his practice primarily in Greek but is bilingual himself. Propose EN + EL only, drop ES.
3. **Coach dashboard surface** — 52 components is too many. Michael used maybe 5 regularly (client list, macro targets, notes, habit assign, activity feed). Cut risk heatmap, transformation card, achievement system, coach-streak counter, keyboard-shortcut overlay.
4. **Supplements module** — only keep if it's core to Kavdas's method. Protocol builder + checklist + compliance grid is a meaningful surface. Ask him Monday: is this a T1 feature or a nice-to-have?

## Headline

The product is good where it's focused and overbuilt where it isn't. **Monday's direction question**: is Trophē a nutrition coaching SaaS (cut workout, cut EL, focus on plan-creation + habit + food), or a full wellness platform (workout + supplement + form)? Until we answer this, we will keep adding surface.

---

*Appendix: raw feedback items tracked in ROADMAP.md § Phase 2 Testing. CHANGELOG.md commits `4a2b31a` / `eeaaa70` / `724c84d` / `88b94d5` / `51514f3` / `ff68219` address 6 of the items above; remaining are roadmap-level product decisions.*
