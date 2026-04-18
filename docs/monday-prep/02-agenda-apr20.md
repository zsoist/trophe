# Monday Meeting Agenda — April 20, 2026

**Participants**: Michael Kavdas, George (Michael's partner — trainer), Daniel
**Duration proposed**: 90 minutes
**Format**: video
**Sent**: Sunday Apr 19

---

Michael — short note before you read. Quick recap: 3 days of testing produced clear signals. This agenda front-loads *what we learned* and back-loads *partnership structure* because the product decisions set the frame for the business ones. If 90 min is too long, we can split: first 60 min product, second 30 min structure.

---

## 1 · Testing learnings (30 min)

### Yours
- What Michael used vs. didn't
- What Michael expected to find and didn't (spoiler: nutrition-plan creation)
- George's first impressions as a trainer
- Concrete bugs: login issue Apr 16 AM, UI misalignments, macro exaggerations
- Nikos's verdict: "workout shouldn't exist"; Dimitra's language/UX check

### Mine
- Full retro doc (shared ahead): [retro-apr16-18.md]
- Data: food log usage, habit check-in rates, AI cost per tester
- Commits shipped during testing window (6 commits, 5 user-visible improvements)
- Prompt caching + /agents/ refactor (invisible but changes unit economics)

## 2 · Product direction based on feedback (25 min)

**Proposal to discuss**: focus Trophē on nutrition coaching, deprioritize everything else.

- **Cut**: workout module depth (Nikos's feedback + your non-use). Keep basic logging, drop form check / PR tracking / templates.
- **Cut**: Spanish language (EN + EL only). Protects translation velocity.
- **Cut**: 2/3 of the coach-dashboard surface. Keep client list, macros, notes, habit assign, activity feed.
- **Possibly cut**: supplements module — depends on whether it's core to your method.
- **Add (priority)**: nutrition-plan creator. You expected it; it doesn't exist. I want to spec it with you.
- **Add (lower)**: coach ↔ client notifications (scoped, not built).

## 3 · Trophē vs. Athletikapp positioning (15 min)

Key question: where does Trophē fit in the Athletikapp universe?

- Is Trophē complementary (Athletikapp = training, Trophē = nutrition coaching)?
- Is Trophē a feature inside Athletikapp?
- Is Trophē independent and Athletikapp is a referral partner / pilot customer?

This affects product direction (do we build anything that overlaps with Athletikapp?) and partnership structure. **Not asking for a decision today**, just surfacing the question and your current thinking.

## 4 · Partnership structure (15 min)

Pre-read sent separately — "Partnership Structure Options" (3 scenarios with pros/cons for both sides).

- High-level: we've been working as partners without a formal frame. That's fine for testing; not fine for the pilot.
- Three options on the table: (i) Trophē standalone with Michael as advisor/equity, (ii) JV between Daniel and Kavdas/Athletikapp, (iii) Trophē built into Athletikapp.
- **Goal for Monday**: not to decide. Goal is to raise the topic and agree on a decision timeline (e.g., "decide before the first paying coach signs up").
- Separate follow-up call if either party wants to dig deeper.

## 5 · Next 30 days (5 min)

- Week 1 (Apr 21-27): ship nutrition-plan creator skeleton; cut workout depth; Supabase Pro + PITR + automated backups.
- Week 2 (Apr 28-May 4): George onboards first real trainer client; first real-world plan created by Michael in-app.
- Week 3-4 (May 5-18): 5 → 10 testers; first pricing conversation; legal entity discussion timeline if partnership structure is converging.

---

## Pre-read attached
- `01-retro-apr16-18.md` — 1-page testing retrospective (3 sections)

## Pre-read NOT attached (I'll bring Monday or send after)
- Partnership structure options — share live in meeting or as follow-up

## Decisions I want to walk out with

1. **Product direction** — agreement on cut list (workout depth, ES language, coach dashboard surface)
2. **Nutrition-plan creator scope** — what does "create a nutrition plan" mean in your practice?
3. **Positioning** — one-sentence "Trophē is X, not Y" we both say the same way
4. **Partnership timeline** — when do we formalize structure?

---

*Let me know if you want to move the time or split the meeting. — Daniel*
