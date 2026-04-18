# Partnership Structure — Options Document

**Author**: Daniel · **For**: internal prep + Monday 04-20 meeting
**Status**: draft for discussion — do NOT send to Michael pre-meeting

> **Purpose of this doc**: raise the partnership-structure topic before it gets decided by default. We've been collaborating for months without a formal frame. That's fine for testing; it's not fine once a paying coach signs up or a legal entity is required.
>
> My role is not to pick the answer. It is to make sure we choose deliberately, with both sides' trade-offs visible.

---

## Context

- Daniel has built the product (37K LOC, 117 components, 6 weeks of work, infrastructure, docs, CI).
- Michael provides domain expertise, the methodology Trophē encodes, the first testing cohort, and B2B distribution via his network + Athletikapp.
- George (Michael's training partner) is joining as a trainer-side validator.
- Athletikapp exists as a separate business Michael is COO of.
- Testing phase ends Apr 18; first paying coach is a realistic May goal.

## Three scenarios

### Option (i) — Trophē is a standalone entity · Daniel majority · Michael advisor + equity

**Structure**: Daniel incorporates (likely Colombia SAS or Delaware C-corp depending on first-customer location). Daniel holds majority (e.g., 70-85%). Michael receives advisor equity (e.g., 5-15% vesting over 2-4 years) + revenue share on customers he sources.

**Pros for Daniel**:
- Clear decision rights, capital structure is VC-compatible if that path opens
- Full product ownership — can pivot, cut features, change model without negotiation
- Aligns with execution leverage (Daniel ships; Michael advises)

**Cons for Daniel**:
- Michael might prefer more upside given methodology contribution
- Harder to raise if Michael is "just advisor" — stronger story with co-founder title

**Pros for Michael**:
- Low risk — no capital commitment, no operational obligation
- Keeps Athletikapp career fully separate, no conflict of interest
- Still upside via equity + revenue share on his network

**Cons for Michael**:
- Limited control over product direction
- If Trophē succeeds large, advisor stake is small relative to methodology contribution
- Signals "this is Daniel's thing" externally, dilutes Michael's identity in the product

---

### Option (ii) — JV between Daniel and Kavdas/Athletikapp

**Structure**: New entity, co-owned (likely 50/50 or 60/40 Daniel given engineering contribution). Athletikapp contributes distribution + domain + testing cohort; Daniel contributes product + infrastructure. Board of 2-3. Revenue shared by formula.

**Pros for Daniel**:
- Shared burden — product decisions, go-to-market, legal, all co-owned
- Athletikapp's network becomes a formal channel, not ad-hoc goodwill
- Michael's reputation becomes a marketing asset on purpose, not by accident

**Cons for Daniel**:
- 50/50 decisions deadlock on ambiguity; needs explicit deadlock mechanism
- Shareholder structure harder to sell to investors ("who is this JV partner?")
- Less flexibility to pivot if founders disagree

**Pros for Michael**:
- Equal footing — co-founder, not advisor
- Methodology contribution valued appropriately
- If Athletikapp invests people/time, that's tracked as contribution
- Brand + distribution are shared assets, not one-sided

**Cons for Michael**:
- Operational obligation — has to show up as executive, not just advisor
- Legal exposure (personal liability depending on entity type)
- Conflict management with Athletikapp — when does Athletikapp vs Trophē priority apply?

---

### Option (iii) — Trophē is built into Athletikapp

**Structure**: Trophē becomes a module/product inside Athletikapp. Daniel either joins Athletikapp as employee/contractor with equity/options, or licenses Trophē IP to Athletikapp.

**Pros for Daniel**:
- Immediate distribution, no go-to-market grind
- Salary / stable income vs. startup risk
- Simplest legal structure
- Athletikapp's infrastructure (legal, billing, sales) is available

**Cons for Daniel**:
- Loses entity / dilutes ownership — upside capped by Athletikapp's trajectory
- Product direction is Athletikapp's call, not his
- Hard to reverse — can't easily spin out later
- Colombia-based Daniel inside a Greek company is complex employment

**Pros for Michael / Athletikapp**:
- Locks in the engineering talent
- Trophē becomes a moat feature, not a standalone competitor
- Simpler cap table, simpler brand story
- Everything under one roof — cross-sell, unified billing

**Cons for Michael / Athletikapp**:
- Buys down Daniel's motivation (no founder upside)
- Athletikapp has to integrate product + tech it didn't build, with all the ownership issues that come with that
- If Athletikapp pivots, Trophē is collateral

---

## Decision factors

These are the questions whose answers change which option is right:

1. **Is Trophē for Michael's practice, or for 10-20 nutritionists eventually?**
   - Just Michael → (iii) Athletikapp-built is cheapest.
   - 10-20 nutritionists → (i) or (ii), because the product needs its own GTM.

2. **Does Daniel want to run a business, or build great product?**
   - Business → (i) or (ii).
   - Product only → (iii) or (i) with Michael as CEO-ish.

3. **Does Michael want ownership risk, or distribution partnership?**
   - Ownership → (ii).
   - Distribution → (i).

4. **Do we think nutrition coaching is a feature or a standalone category?**
   - Feature → (iii).
   - Category → (i) or (ii).

## What I want from Monday

Not a decision. A decision **timeline**.

Proposal: we frame the question, both of us go away and think, and we decide before the first paying coach signs up (May realistic). Also propose: neither of us proposes a number on Monday. Numbers before we agree on structure poison the conversation.

## Worst outcomes I want to avoid

- **Defaulting**: we never decide, and when we have to (paying customer, legal paperwork), we pick under pressure.
- **Asymmetric asks**: one of us proposes a number to the other, and it becomes "take it or negotiate" rather than "figure it out together."
- **Friends-to-strangers**: poorly-structured partnerships end friendships. The point of this doc is to protect the friendship by making the structure intentional.

---

*This stays in `docs/monday-prep/` as internal prep. Do not share pre-meeting. Bring printed to meeting, or send as follow-up with "per our conversation, here's how I'm thinking about it."*
