# Meeting Notes — Michael Kavdas × Daniel Reyes

## Date: April 9, 2026
## Participants: Michael Kavdas (nutritionist/COO Athletikapp), Daniel Reyes (developer)

---

## Key Takeaways

### 1. The Nutritionist Is the Customer
Athletes come and go. Nutritionists are lifers. Build B2B, not B2C. The client uses the app for free; the nutritionist pays.

### 2. AI as Assistant, Not Replacement
The AI does tedious work (plans, tracking, compliance). The human nutritionist adds judgment, relationships, and "lowers the perfect plan to a more human level." Human-in-the-loop is both technically easier and commercially safer.

### 3. East Meets West
Michael has Western research training + Chinese/Greek ancient medicine knowledge. Traditional medicine across cultures converges on similar principles. The platform should incorporate non-Western nutritional knowledge, presented in a way "Western people don't feel offended about it."

### 4. Per-Client AI Agents
Each client gets their own AI agent with persistent "core memories": athlete status, allergies, habits, life changes (became a mother, post-surgery, etc.). The agent checks in: "You haven't logged in for a month — are you okay?"

### 5. The Endgame
Start with 5-10 nutritionists using the tool. Collect decision data. Train/distill a model. Eventually the AI IS the nutritionist. Michael becomes CEO, not practitioner. "AI capabilities are doubling every two months. By end of year, you don't need more nutritionists — you need only a CEO."

### 6. Client Profile Portability
Clients should own their data and be able to switch nutritionists without losing history. This protects both parties and motivates quality.

---

## Feature Requests from Michael

| Feature | Description | Priority |
|---------|-------------|----------|
| Nutritional Plan Generator | AI builds plan, nutritionist reviews/adjusts | High |
| Supermarket List | Local products from client's area | High |
| Recipe Suggestions | Culture/city-specific recipes | Medium |
| Drink/Herb Recommendations | Eastern medicine integration (herbs, hard water blends) | Medium |
| Client Diary → Pattern Mapping | "If 3/4 weeks show no breakfast, maybe breakfast is not your thing" | High |
| Educational Content | Trend updates for nutritionists (they don't follow tech) | Medium |
| Gamification | "You're doing great, you're missing your breakfast" — reaffirmation | Medium |
| Eastern Medicine AI | Train with non-Western data (DeepSeek for Chinese medicine concepts) | Long-term |
| Client Profile Portability | Own your data, switch nutritionists freely | Medium |

---

## Action Items

| Action | Owner | Deadline |
|--------|-------|----------|
| Create nutrition plans for test subjects | Michael | Apr 12-13 |
| Set up 3 test accounts | Daniel | Done |
| Test as client (daily logging) | Nikos, Daniel, Daniela | Apr 10-18 |
| Test as coach (monitor, assign habits) | Michael | Apr 10-18 |
| Girlfriend feedback (engineer perspective) | Daniela | Apr 14-18 |
| Bug/feature request log | All | Ongoing |
| Reconvene with findings | Both | Apr 16-18 |
| Legal entity discussion | Both | After testing |

---

## Business Discussion

- SaaS per coach model confirmed
- Legal entity needed but deferred until after testing
- Options: joint venture, Daniel under Athletikapp, or new entity
- Michael has 2 companies, knows how to create legal entities
- Daniel's priorities: finish master's (2027), continue Dialectica, build this on the side
- Monetization: subscription plan, to be refined after testing

---

## Quotes Worth Remembering

> "A system could make mistakes... a human person can lower that down to a more human level."

> "I am the prism from the knowledge that exists, from the customer that I have in front of me. This is the nutritionist, the actual work of nutritionists."

> "At the end of the day, you don't need more nutritionists — you need only a CEO."

> "Old school nutrition is not that good. Old school, like ancient Greece, is good; old school, like 10 years before, is not good."

---

## Next Meeting
- When: Mid-to-end of April (Apr 16-18)
- Agenda: Testing results, bug reports, feature priorities, legal entity
- Participants: Michael, Daniel, possibly Daniela (girlfriend)

---

## Michael's Testing Feedback #1 — April 13, 2026

_First notes after testing phase began (April 10-13). Direct from Michael:_

### UX Issues (high priority)
**(a) Meal slot drag-and-drop** — wants to drag and reorder slots freely, not tap ▲▼ repeatedly. His protocol doesn't follow breakfast→lunch→dinner — e.g. Snack → Lunch → Dinner → Snack. Fixed April 13: drag handle added to MealSlotConfig.

**(b) Copy / duplicate meal slots** — needs to create variants without rebuilding from scratch. Fixed April 13: duplicate button added.

**(c) Microphone permission** — browser asks for mic permission cold when the button is tapped, feels like it's spying. Needs a friendly pre-prompt UX ("We'll use your mic to log food by voice"). Fixed April 13.

**(d) Personalized insights** — current health tips are generic ("eating X leads to Y"). Michael wants context-aware, personalised nudges tied to the client's actual data. He has all the prompts ready from his years of practice — this is his year's work. Will be supplied when ready. Phase 3.

### Emotional Signal
> "Too good to be true as an expression of what it could be and had in mind! We are so lucky to stepped on each other's path!"

This is a strong signal — Michael sees the vision clearly and is emotionally invested. Partnership is real.

---

## April 20 Meeting Preparation — as of April 19

### Participants
- **Michael Kavdas** — nutritionist, Athletikapp COO
- **George Tsatsaronis** — Michael's trainer partner, ~21 yrs deal-making experience. First-time introduction.
- **Daniel Reyes** — technical / AI
- **Daniela Gutiérrez** — technical / AI

### Format
90 minutes, video. 20-min deck delivery (capabilities / testing / partnership thinking) + ~70-min conversation.

### Daniel's stated position (internal frame; not shared as pre-read)

**Archetype**: Technical Co-Founder Who Treats This Like a Paid Apprenticeship. Named through reflective work April 19. Not a founder-archetype; a high-agency professional optimizing a life portfolio.

**Top goals (ranked by Daniel)**:
1. **A — Meaningful money**: €500–2K/mo side income within 12 months feels real.
2. **D — Dialectica + master's protection**: primary commitment. AI master's is remote; no conflict.
3. **G — CV credential**: wants "Co-founder" or "Technical Co-founder" on LinkedIn.
4. **H — Fun**: vibe-code alone, learn complex AI + dev skills with Codex / Claude / OpenAI frontier tools.

**Time ceiling**: 4–8 hrs/week steady-state.

**Role preference**: Technical Co-Founder / CTO. Owns code, architecture, AI. Does NOT own commercial / sales / operations.

**Equity**: Open 20–40% range. Comfortable with three-way equal split. Not defending majority. IP must live in the operating entity (not Michael personally, not Athletikapp).

**Walk-away triggers**:
- Contractor-only with no equity
- Steady-state time > 10 hrs/week
- IP held outside a new entity
- Perceived conflict with Dialectica proprietary data
- Forced commercial / sales responsibility (kills the fun condition)

**Entity openness**: Colombia SAS / Delaware C-corp / Greek — defers to whichever makes legal/tax sense for the first paying customer.

**Decision timeline proposal**: not to decide Monday; agree a date. Realistic: before first paying coach signs up, mid-to-late May 2026.

### Opening statement (2 min, scripted)

> "Before testing data, one thing. I want to put my cards on the table openly, because I think it'll make this meeting more productive. I'm continuing at Dialectica in Colombia; Trophē is a serious side project for me at 4–8 hours per week. What I want from Trophē, honestly, is three things: meaningful side income in the next 12 months, the chance to lead the technical and AI side of a real product, and the opportunity to learn partnership and business from both of you. I'm not trying to be CEO. I'm not trying to run the business. I'm very open on structure. What I care about is being the technical co-founder, being paid meaningfully for that work, protecting my primary commitments, and working with people I respect. With that on the table, let's talk about the real stuff."

### Agenda (post-deck, ~70 min)
1. Testing learnings (theirs first, then mine) — 30 min
2. Product direction: cut workout depth, EN+EL only, nutrition-plan creator priority — 25 min
3. Trophē vs. Athletikapp positioning — 15 min
4. Partnership decision *timeline* (not the decision) — 15 min
5. Next 30 days — 5 min

### Pre-reads
- Sunday ~noon Colombia (≈ 8pm Athens): retro (`docs/monday-prep/01-retro-apr16-18.md`) only.
- NOT sent: partnership options, positioning doc, cut-decision doc (all internal).
- Deck is meeting artifact, NOT pre-read.

### Walk-out decisions (target)
1. Product direction agreement.
2. Nutrition-plan creator scope in Michael's practice.
3. One-sentence positioning both say the same way.
4. Partnership decision *date*.

### Michael's deck feedback (April 19, voice note review)

Full slide-by-slide review drove deck v7. Highlights:
- **Slide 1**: bigger τροφή typography; confirm Monday April 20; 4 attendees incl. Daniela.
- **Slide 2** ("what is Trophē"): keep it visual; flip-card interaction revealing app screens + feature bullets on back.
- **Slide 3**: rename "Wizard" → "AI Engineer"; more technical density, less bullet verbosity; visual architecture diagram feel.
- **Slide 4**: active accounts only — drop Dimitra / George-seed / Lilly (didn't test). Transition slide into findings.
- **Slide 5**: testing findings + "moves we're building toward" (strategy, not feature list). Remove Michael's name from strong-side captions.
- **Slide 6**: Greek numerals instead of roman (ένα / δύο / τρία); no timeframes; Phase I = "hardening + clear guidance" (not "plan creator doesn't exist" — that reads as throwing shade).
- **Slide 9** (questions): don't bias per-person; ask generally.
- **Slide 10/11** (partnership / "where I fit"): no Dialectica/master's in the slide — Daniel says those verbally. Three-seat "what each brings" frame. No self-deprecating disclaimers ("not trying to CEO", "not full-time" — Daniel said these feel like kneeling).

---

## Apr 20 Meeting — POST-MEETING DEBRIEF

Full transcript: `docs/monday-prep/06-meeting-apr20-transcript.md`
Decisions summary: `docs/monday-prep/07-meeting-apr20-decisions.md`

### Headline

**Trophē is no longer a standalone product — it's the nutrition vertical inside AthletiKapp's proposed "house of apps for the sports industry"** (alongside Reventy events + Holiday Your Fitness retreats). Daniel is invited as a partner, not a contractor.

### What shifted vs. pre-meeting plan

- **Partnership option (i) is dead**: Daniel-standalone. Neither Mike nor George entertained it.
- **Options (ii) JV and (iii) absorb are both live**, George leaned (iii) without naming it.
- **Scope expanded**: 2–3 apps proposed (coach dashboard for gym/trainer + coach dashboard for nutritionist + shared client interface), not one.
- **Revenue story**: George brought Reventy × Nike (25k runners, direct advertising) as live monetization proof. AthletiKapp is already a marketplace.

### Unresolved tension (Daniel's own pre-meeting stance)

Pre-meeting doc: *"IP must live in the operating entity — not Michael personally, not Athletikapp."* → If Trophē gets absorbed into AthletiKapp, this walk-away trigger fires. Needs a conscious decision before next call, not a drift.

### Decisions made

- Partnership over contract ✅
- Nutrition vertical first (continue Trophē w/ Mike) ✅
- Cost-sharing at entity level (when entity forms) ✅
- Weekly cadence + organized comms (Daniel sets up Slack/WhatsApp) ✅
- Follow-up end of week ✅

### Decisions explicitly deferred

- Entity structure (new JV vs absorb into AthletiKapp)
- Equity split
- Trophē naming (rename / Trophy X Brain / keep / absorb into AthletiKapp brand)
- Daniela's role (Daniel briefs her separately)

### Immediate action items

- [ ] Daniel: create Slack group (fallback WhatsApp)
- [ ] Daniel: brief Daniela with transcript + decisions doc
- [ ] Daniel: request AthletiKapp review access (Reventy + Holiday Your Fitness) from Mike
- [ ] Daniel: clarify IP-entity stance in group chat before next call
- [ ] Daniel + Mike: continue Trophē v0.2 iteration
- [ ] All: end-of-week check-in

### Honest Gandalf read

Meeting landed for rapport and strategic clarity. Weaker on defending Daniel's structural position — the IP-entity question got glossed over. Name the tension explicitly in the next message to the group. If it's no longer a non-negotiable, decide consciously.

---

## Apr 20 — POST-MEETING · DANIELA CONSULTATION

Full Daniela input: `docs/monday-prep/08-daniela-consultation.md`

### Headline shift

**Daniela is IN as partner stakeholder.** She ACCEPTS option (iii) absorption under three conditions (fair remuneration / full technical control / clear stakeholder share — last two inferred in conversation, not asked frontally).

### What she changed in the strategy

1. **Equity conversation is not frontal.** No "¿cómo se ve el equity?" in the next call. Implicit, amigable, read terrain first with information in hand.
2. **Portfolio verification is the prerequisite.** Daniela flagged: *"la única aplicación real que ellos tienen es la nuestra y una website."* If true, our leverage is much higher. Must verify Reventy + Holiday Your Fitness are real before negotiating.
3. **Trojan horse strategy**: use "understanding the customer journey" as legitimate pretext to get into the full AthletiKapp ecosystem. Become indispensable, not just contributors.
4. **Capacity unlocked**: Daniela can potentially go full-time at AthletiKapp within 15-30 days (between jobs now), as both employee and stakeholder. Takes team capacity 4-8h/wk → ~48h/wk.
5. **Technical control is non-negotiable** — protects against becoming disposable contract.
6. **Long-term money** is the frame. Flexible short-term, portfolio-class long-term.

### Daniela's roles (now defined)

- **Partner stakeholder** with full technical control on her scope
- Strategic direction taken with input from the rest of the team
- Bio-mechanical / AI / UX engineer depth
- Potentially full-time employee of AthletiKapp + stakeholder (decision pending 15-30 days)

### Immediate action items (revised post-consultation)

- [ ] Daniela creates Slack group (Mike hasn't responded; she has the initiative)
- [ ] Daniel drafts soft message to Mike + George: pretext ecosystem access + introduce Daniela as partner stakeholder
- [ ] Request AthletiKapp demo access: Reventy + Holiday Your Fitness (customer-journey pretext)
- [ ] Daniel continues Trophē iteration with Mike (rolling)
- [ ] Verify portfolio before equity conversation
- [ ] Next call end-of-week
