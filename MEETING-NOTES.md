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
