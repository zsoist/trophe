# Monday Cut Decision — Public Commitment

**Status**: Daniel's call pre-meeting · Announced Monday · Executed this week

---

## The cut

**Workout module depth is deprioritized.**

Language I'll use on Monday, verbatim:

> "Based on user testing, we're deprioritizing workout tracking to focus on nutrition coaching. Basic workout logging stays — it's useful context for nutrition decisions — but we're cutting AI Form Check, PR detection, workout templates, and volume tracking from the near-term roadmap."

## Why this specific cut

- **Nikos said it directly**: "workout shouldn't exist" in a nutrition app
- **Michael never used it** during testing
- **Surface cost is high**: 6 pages, 15+ components, the Form Check module is a MediaPipe dependency we own
- **Opportunity cost**: every hour on workout features is an hour not on plan creator (the thing Michael expected)

## What this unblocks this week

- **Plan creator skeleton** — the thing Michael asked for
- **Food-parse golden eval set** — trust the macros before scaling
- **Coach-dashboard trim** — cut 20 components from 52 → ~32, speeds up page, reduces Michael's cognitive load

## What does NOT change

- Existing workout data stays in the DB — users who logged workouts don't lose history
- Basic "log a workout" remains — we keep the minimum for nutrition-context use (training day vs rest day)
- Form Check code stays in the repo but is removed from nav — reversible if we ever reprioritize

## Why this is leadership signaling, not just a backlog edit

Michael and George watch closely. Saying "we cut this because users told us" communicates:
1. We listen to users, not build-list momentum
2. We know what Trophē is (and isn't — see positioning doc)
3. Scope is a decision, not an accumulation

A platform that never cuts looks like it doesn't know what it's for. A platform that cuts based on user signal looks like it's run with discipline.

## Execution checklist (this week)

- [ ] Hide workout nav items from BottomNav for role=client
- [ ] Keep `/dashboard/workout` as simple log-a-session form, remove sub-pages
- [ ] Remove workout-related items from coach dashboard Quick Actions
- [ ] Update ROADMAP.md to move workout module to "Deferred / maybe-never"
- [ ] Update SPEC.md — workout module becomes "basic logging only"
- [ ] CHANGELOG entry: "Focus: deprioritized workout module surface"
- [ ] Communicate cut in next tester email

## What I am NOT cutting on Monday (yet — needs Michael's input)

- Spanish localization — cut candidate, but want to confirm with Michael
- Supplements module — cut candidate, depends if it's core to Kavdas method
- Coach dashboard 52 → 32 components — will propose specific cuts with Michael

These three are discussion items, not announced cuts.
