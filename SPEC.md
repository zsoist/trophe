# τροφή (Trophe) — Precision Nutrition Coaching Platform

## Problem
Professional nutritionists manage clients using spreadsheets, MyFitnessPal, and WhatsApp groups. No platform enforces Precision Nutrition's habit-based methodology at scale while providing AI-powered food tracking and coach analytics.

## Users
- **Primary: Coaches** — Professional nutritionists managing 10-50+ clients (B2B, paying customer)
- **Secondary: Clients** — Athletes, health-conscious individuals seeking guided coaching (free)

## Core Flows

### Client Flow
1. Sign up → onboarding wizard → body stats → calculated macros (Mifflin-St Jeor + ISSN)
2. Daily: log food (text/photo/voice/paste/manual) → AI parses → review → confirm
3. Daily: check in on assigned habit (one tap) → 14-day cycle → mastered → next habit
4. Optional: log workouts, track water, take supplements, run AI Form Check
5. View: calendar, trends, insights, scores, streaks, badges

### Coach Flow
1. Log in → coach dashboard → see all clients with behavioral signals (green/yellow/red)
2. Assign habits one at a time → monitor compliance → adjust when needed
3. Create supplement protocols with evidence levels → assign to clients
4. Create workout templates → assign to clients
5. Deep-dive: food log, workout history, form check results, notes

### AI Form Check Flow (new)
1. Client opens Form Check → selects exercise + side
2. Camera opens → MediaPipe Pose detects 33 landmarks (browser WASM, 30+ FPS)
3. Real-time: skeleton overlay (green), angle readout, rep counter
4. Finish → per-rep scoring against reference dataset
5. Results: 5-tier assessment (buen ejercicio → riesgo de lesion)

## Michael Kavdas Vision (from April 9 meeting)
- The nutritionist is the customer, not the athlete
- AI as assistant, not replacement (human-in-the-loop)
- East meets West: Greek ancient medicine + Chinese medicine + Western research
- Per-client AI agents with persistent "core memories"
- Endgame: distill model from nutritionist decisions → AI IS the nutritionist

## Success Criteria
- [x] Michael demo delivered (April 9)
- [x] Michael's account created (coach role)
- [x] Demo page with EN/EL toggle
- [x] AI Form Check working in browser
- [ ] 3 test subjects actively using app (April 10-18)
- [ ] Michael using coach dashboard daily
- [ ] Bug report and feature feedback collected
- [ ] Reconvene meeting (April 16-18)
- [ ] Legal entity discussion initiated

## Technical Requirements
- Trilingual UI (EN/ES/EL) — 200+ translated strings
- Evidence-based calculations (Mifflin-St Jeor BMR, ISSN protein targets)
- Zero .single() calls (use .maybeSingle() always)
- TypeScript strict mode, 0 errors
- Mobile-first (390x844)
- Deploy with `vercel --yes --prod` (env vars are Production-only)
- AI cost < $2/month per coach
