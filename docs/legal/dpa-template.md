# Data Processing Agreement (DPA) — Template

> **Status: DRAFT for legal review.** This template must be reviewed by Greek/EU
> counsel before being signed with any clinic or coach. It tracks GDPR Article 28(3)
> requirements. Send executed copies to dpo@trophe.app records.

---

**DATA PROCESSING AGREEMENT**

between

**[CONTROLLER NAME]**, a nutrition practice / clinic established at [ADDRESS], ("**Controller**")

and

**Trophē** ("**Processor**", contact: dpo@trophe.app)

effective as of [DATE] (the "**Agreement**"), supplementing the Trophē Terms of Service.

## 1. Subject matter and duration
1.1 The Processor provides the Trophē nutrition coaching platform (the "Service") and processes personal data on behalf of the Controller solely to deliver the Service.
1.2 This Agreement applies for as long as the Controller maintains an active subscription, plus the deletion period in §9.

## 2. Nature and purpose of processing
Hosting, storage, transmission and analysis of client nutrition, lifestyle and coaching data to provide: food logging and analysis, meal planning, coach–client messaging, intake questionnaires, appointment booking, progress analytics, and AI-assisted coaching summaries.

## 3. Categories of data subjects
Clients of the Controller; staff/coach users of the Controller.

## 4. Categories of personal data
- Identity and contact data (name, email, language, timezone)
- Body metrics (age, sex, height, weight, body-fat %, activity level)
- Nutrition and lifestyle data — **special-category data under Art. 9 GDPR** (food logs, intake questionnaire answers, daily check-ins including sleep/energy/digestion, goals, coach assessments)
- Communications between Controller's coaches and their clients
- Appointment and billing metadata

The Service deliberately does **not** accept uploads of medical documents (blood panels, prescriptions, diagnoses).

## 5. Obligations of the Processor (Art. 28(3))
The Processor shall:
a) process personal data only on documented instructions from the Controller, including with regard to international transfers;
b) ensure persons authorised to process the data are bound by confidentiality;
c) implement the technical and organisational measures in **Annex II**;
d) respect the sub-processor conditions in §6;
e) assist the Controller in responding to data-subject rights requests (Arts. 12–23) via available export tooling and the documented manual rights-request process, while automated deletion tooling is in development;
f) assist the Controller with Arts. 32–36 obligations (security, breach notification, DPIA);
g) at the Controller's choice, delete or return all personal data at end of services (§9);
h) make available all information necessary to demonstrate compliance and allow for audits (§8).

## 6. Sub-processors
6.1 The Controller grants general authorisation for the sub-processors listed in **Annex III** (also published at trophe.app/trust).
6.2 The Processor shall notify the Controller at least **30 days** before adding or replacing a sub-processor; the Controller may object on reasonable data-protection grounds.
6.3 The Processor imposes equivalent data-protection obligations on each sub-processor by contract.

## 7. International transfers & data location
**Current hosting:** primary data is stored in Supabase (PostgreSQL) on AWS in the
**United States (us-east-2)**. Migration to an EU region is planned. Because this is a
transfer outside the EEA, the Processor relies on the EU Standard Contractual Clauses
(2021/914) offered in its agreements with Supabase and AWS; the Processor's own
transfer-impact assessment and executed processor DPAs are in progress. Text AI
inference for coaching features sends client-provided and coach-visible text — which can
include names, contact details and health-adjacent information — to DeepSeek, which
processes inputs in China and whose terms permit it to use
inputs to improve its services — the data-use basis is under review and the Processor
is minimising what is sent.

## 8. Audits
The Processor will make available, on request and under NDA: this Agreement, the technical-measures annex, sub-processor agreements summaries, and penetration/security review summaries. On-site audits maximum once per 12 months with 30 days notice, at Controller's cost.

## 9. Deletion and return
On termination, the Controller may export all client data in machine-readable format for 30 days. Thereafter the Processor deletes all personal data within 30 days where technically feasible; an automated erasure workflow including backup handling is in development, and backup-rotation handling will follow the Supabase Pro migration. EU or Member-State law may require retention.

## 10. Personal data breach
The Processor notifies the Controller **without undue delay** on becoming aware of a personal data breach affecting the Controller's data, and provides the information required by Art. 33(3) to support the Controller's own notification obligations.

## 11. Liability and governing law
Liability follows the main Terms of Service. This Agreement is governed by the law of [Greece / Member State], with disputes before the courts of [VENUE].

---

## Annex I — Processing details
As described in §§2–4.

## Annex II — Technical and organisational measures (Art. 32)
- Row-level security enabled in PostgreSQL on every table; coach access scoped by `is_coach_of()` policy, fail-closed (comprehensive cross-tenant policy tests in progress)
- TLS 1.2+ in transit; AES-256 at rest; cookie-based sessions (not browser localStorage)
- Role-based access (super_admin / admin / coach / client) with database-enforced policies
- Automated backups and point-in-time recovery planned with the Supabase Pro migration; not yet enabled (no restore drill yet)
- Input validation (zod) and durable rate limiting on key mutation endpoints (e.g. signup, activation, messaging); coverage across all endpoints is being completed
- AI calls governed: per-org budgets, run recording (`agent_runs`). Note: the text provider (DeepSeek, China) may use inputs to improve its services — data-use/transfer basis under review; the vision provider (Anthropic) does not train on API inputs
- Secrets in environment configuration only, never in source; CI gate on type-checks and tests before deploy
- Pseudonymous AI run telemetry; automated retention/pruning policy in development
- Incident response runbook; as processor we notify controllers without undue delay

## Annex III — Authorised sub-processors
| Sub-processor | Purpose | Location |
|---|---|---|
| Supabase | Database, auth, storage | United States (AWS us-east-2) — EU migration planned |
| Vercel | Hosting & delivery | United States (functions cle1) + global edge |
| DeepSeek | AI text inference (food + coaching) | China — may use inputs to improve services; basis under review |
| Anthropic | AI vision inference (meal photos) | US — no training on API inputs |
| Voyage AI | Embeddings over food + memory/conversation/knowledge text (may include personal data) | US — basis under review |
| Langfuse | Self-hosted AI observability (pseudonymous) | Self-hosted via Cloudflare Tunnel — region not independently verified |

---

**Signatures**

Controller: ____________________  Date: ________

Processor (Trophē): ____________________  Date: ________
