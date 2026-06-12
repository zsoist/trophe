# Trophē — B2B Pricing Tiers (Draft v1, June 2026)

> Proposed numbers for the Michael/Nutrafit beta. Benchmarked against Nutrium
> (€33-60/mo), Practice Better ($25-145/mo), Healthie ($49-135/mo). Final
> price points are a founder decision — validate against beta-cohort willingness
> to pay before publishing on the landing page.

## Philosophy
Charge the **coach**, not the client. The client app is always free — it is the
coach's retention tool, not our revenue line. Booking commission monetizes
client transactions without subscription friction (Michael: Greek coaches
resist creating Stripe accounts — we onboard payments for them).

## Tiers

### Coach Free — €0
The hook. A solo nutritionist runs a real (small) practice forever free.
- Up to **5 active clients**
- Food logging + AI analysis, meal plans, intake questionnaire (default set)
- Messaging, basic dashboard
- "Powered by trophē" in client app

### Coach Pro — €29/mo (€290/yr)
The workhorse tier for Michael's profile: established solo coach, 30-80 clients.
- **Unlimited clients**
- Business KPIs + contact-due engine (retention dashboard)
- Booking calendar with paid consults (we take **8% commission** on consults booked in-app; payouts handled by us)
- Custom intake questions, daily check-ins, AI coach insight (with monthly token allowance)
- Branded client experience (logo, colors)
- Signable DPA + data export

### Clinic — €99/mo per location
Multi-coach practices / clinics (the Daily Nutrafit B2B target).
- Everything in Pro for up to **8 coach seats** (then €12/seat)
- Org-level dashboard: per-coach KPIs, client transfer between coaches
- Org AI budget controls (existing `organization_ai_budgets` table)
- Priority support, DPO walkthrough, security questionnaire support
- SSO (later)

## Commission model (booking)
- 8% on consults booked + paid through trophē (Pro/Clinic)
- 12% on Free tier (incentive to upgrade)
- Coach sets price; client pays in-app; payout minus commission

## Implementation notes
- Schema is ready: `0014_b2b_billing_readiness` migration already carries org +
  subscription fields; `organization_ai_budgets` (0017) handles AI metering
- Enforcement order: client-count limit on Free → seat count on Clinic →
  commission at appointment-payment time (Stripe Connect, later phase)
- No paywall code ships before the beta cohort gives pricing feedback —
  Michael's circle of nutritionists is the validation panel

## Open questions for Daniel + Michael
1. Annual-only discount or monthly default?
2. Greek-market VAT handling (24%) — display inclusive or exclusive?
3. Commission % tolerance — Michael estimated 5-10%; we propose 8%
4. Does AthletiKapp partnership warrant a partner/reseller tier?
