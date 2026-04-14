# τροφή (Trophe) — Business Plan

## Vision
A platform that makes every nutritionist 10x more effective by handling the work they don't have time for: meal planning, compliance tracking, food logging, and client communication. Built on Precision Nutrition methodology with AI that understands food in any language.

## Target Customer
**Primary: Professional nutritionists** (B2B)
- PN-certified coaches managing 10-50+ clients
- Struggle with: spreadsheets, multiple tools, client communication overhead
- Want: one dashboard, AI assistance, automated compliance tracking

**Secondary: Their clients** (B2C, but free)
- Athletes, health-conscious individuals, post-surgery recovery
- Need: easy food logging, habit guidance, accountability

## Market Size (researched April 14, 2026)
- **Global fitness app market**: $13.9B (2024), growing 17.6% CAGR
- **Nutrition tracking share**: 49.8% of fitness app usage
- **72% of personal trainers** want to add nutrition coaching but lack tools
- **TAM for coach-first nutrition SaaS**: $2-3B (subset of fitness apps serving professionals)
- **SAM (initial)**: Greek-speaking + Spanish-speaking nutritionists = ~50K professionals

## Revenue Model
- **SaaS per coach**: monthly subscription for N clients
- Clients use the app for free (reduces adoption friction)
- AI cost per coach: ~$1.80/month (20 API calls/day)
- Pricing TBD after testing phase

### Three-Tier Pricing Vision (validated April 14)
| Tier | Target | Model | Price Range |
|------|--------|-------|-------------|
| **Coach Tool** (current) | Independent nutritionists | Per-coach SaaS, clients free | $25-75/mo |
| **Self-Service Tracker** | Individuals without a coach | Freemium (free + Pro) | Free / $9.99/mo Pro |
| **B2B Platform** | Gyms, clinics, wellness centers | Multi-tenant, per-seat | $149-499/mo |

**Payment infrastructure**: Stripe Connect (marketplace model) — coaches collect from clients, platform takes %. Standard for multi-tenant fitness SaaS.

## Data Flywheel
1. Nutritionists use the platform → generate decision data
2. Data trains better AI models (which plans work, how they adjust)
3. Better AI attracts more nutritionists
4. Eventually: AI operates semi-autonomously with minimal human oversight
5. Endgame: distilled model IS the nutritionist. Founder becomes CEO.

## Competitive Landscape (updated April 14, 2026)

### Direct Competitors (Coach-First Nutrition SaaS)
| Competitor | Pricing | Strength | Gap vs Trophe |
|-----------|---------|----------|---------------|
| **Trainerize** | $5-175/mo | Workout templates, client management, 400K+ trainers | No AI food input, no habit methodology, no form analysis |
| **TrueCoach** | $70/mo (up to 20 clients) | Clean UX, workout programming, messaging | No nutrition tracking, no AI, no habits |
| **Healthie** | $129-349/mo | Telehealth, insurance billing, EHR integration | Enterprise pricing, no AI food parsing, no habit engine |
| **Nutrium** | $25/mo | Meal planning, client portal, 700K+ food DB | No AI, no workout module, no behavior change methodology |
| **Practice Better** | $35-89/mo | All-in-one wellness (scheduling, billing, notes) | Generic, no AI food tracking, no form analysis |
| **Evolution Nutrition** | $40-80/mo | Meal planning, recipe database | No AI, outdated UX, no habit methodology |

### Adjacent Competitors (Consumer Nutrition Apps)
| Competitor | Pricing | Strength | Gap vs Trophe |
|-----------|---------|----------|---------------|
| **Cronometer** | Free / $49.99/yr Pro | 82+ micronutrients, gold standard accuracy | No habits, no coaching workflow, no AI input |
| **MacroFactor** | $71.99/yr | Adaptive calorie algorithm, expenditure tracking | No coaching, no AI food input, no workout templates |
| **MyFitnessPal** | Free / $79.99/yr | 18M+ food database, brand recognition | No coaching integration, barcode-dependent |
| **Noom** | $70/mo | Behavior change, human coaching | Generic (not for professionals), expensive for consumers |
| **Carbon Diet Coach** | $9.99/mo | AI macro adjustments, coach marketplace | No habit methodology, no photo analysis |

### Key Differentiators
**Trophe is the only platform combining all five**:
1. Precision Nutrition habit methodology (14-day cycles, one at a time)
2. Trilingual AI food tracking (text NLP + photo analysis + voice)
3. Browser-based AI Form Check (zero server cost, privacy-first)
4. Coach dashboard with behavioral intelligence signals
5. East-meets-West philosophy (Greek ancient + Chinese + Western research)

### Pricing Positioning
- Below Healthie/TrueCoach (enterprise tier) at $25-75/mo
- Above Nutrium ($25/mo) in AI capabilities
- Free for clients (critical adoption advantage vs Trainerize's per-client fees)

## Differentiation
1. **Precision Nutrition methodology built in** — not generic tracking
2. **Trilingual AI** — understands Greek, Spanish, English food descriptions
3. **Browser-based form analysis** — zero cost, zero server, privacy-first
4. **East meets West** — potential to integrate traditional medicine knowledge
5. **Coach-first design** — behavioral signals, not just data dumps

## Partnership: Michael Kavdas
- **Who**: Greek nutritionist, PN L1 certified, COO of Athletikapp
- **What he brings**: Domain expertise, 5 years of AI nutrition thinking, client network, Athletikapp infrastructure
- **What Daniel brings**: Full-stack development, AI engineering, Mac Mini infrastructure, rapid iteration
- **Structure**: TBD after testing phase. Options: joint venture, new entity, or integration with Athletikapp
- **Status**: Testing phase (April 10-18, 2026)

## Roadmap

### Phase 1: Testing (April 10-18, 2026)
- 3 test subjects: Nikos (athlete), Daniel (post-surgery), Daniela (biomechanics)
- Michael as coach, creating nutrition plans
- Daily usage, bug reporting, feature feedback

### Phase 2: Product-Market Fit (May-June 2026)
- Incorporate testing feedback
- Build top-priority features from Michael's list
- Onboard 2-3 more nutritionists for beta
- Refine pricing model

### Phase 3: Launch (Q3 2026)
- Legal entity established
- Public launch with 5-10 coaches
- Marketing via Michael's network + Athletikapp
- Begin data collection for AI training

### Phase 4: Scale (Q4 2026+)
- 50+ coaches
- AI model distillation from collected data
- Eastern medicine module (research phase)
- Multi-country expansion (Greece, Colombia, Portugal)

### Phase 5: B2B Platform (2027)
- Multi-tenant gym/clinic tier with Stripe Connect billing
- White-label option for large wellness brands
- Central admin dashboard (gym owner → coaches → clients)
- Per-seat pricing ($149-499/mo per facility)
- API for integrations (wearables, EHR systems)

## Financial Projections (Conservative)
| Phase | Users | Revenue | Notes |
|-------|-------|---------|-------|
| Phase 3 (Q3 2026) | 10 coaches | $500/mo | $50/coach, free tier infra |
| Phase 4 (Q4 2026) | 50 coaches | $2,500/mo | Supabase Pro needed |
| Phase 5 (2027) | 50 coaches + 5 gyms | $4,000-5,000/mo | Gym tier $149-499/facility |
| Scale (2027+) | 200 coaches + 20 gyms | $15,000-20,000/mo | Stripe Connect revenue share |

- AI costs: ~$2/coach/month = negligible
- Infrastructure: Vercel + Supabase free tier covers Phase 3
- Break-even: ~5 coaches (Supabase Pro + domain costs)
- Gym tier break-even: ~3 facilities at $249/mo avg

## Risks
1. **Regulatory**: Nutrition advice varies by country. Need disclaimers.
2. **AI accuracy**: Food parsing errors could lead to wrong macro calculations.
3. **Competition**: MyFitnessPal could add coaching features.
4. **Adoption**: Nutritionists resist technology. Need very simple UX.
5. **Partnership**: If Michael/Daniel disagree on direction, need clear governance.

## Legal Considerations
- Need legal entity in at least one country
- Michael knows European company creation (Greece)
- Daniel knows Colombian/Latin American company creation
- AI-generated nutrition advice needs appropriate disclaimers
- Client data portability must comply with GDPR (Greece/EU)
