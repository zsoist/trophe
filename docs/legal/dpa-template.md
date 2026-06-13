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
e) assist the Controller in responding to data-subject rights requests (Arts. 12–23) via in-product export and deletion tooling;
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
transfer outside the EEA, transfers are governed by the European Commission's Standard
Contractual Clauses (2021/914) incorporated in the Processor's agreements with Supabase
and AWS (and, where applicable, an adequacy decision such as the EU-US Data Privacy
Framework). AI inference requests contain only the minimal task context (food text or
coach-visible snapshot), never full account records.

## 8. Audits
The Processor will make available, on request and under NDA: this Agreement, the technical-measures annex, sub-processor agreements summaries, and penetration/security review summaries. On-site audits maximum once per 12 months with 30 days notice, at Controller's cost.

## 9. Deletion and return
On termination, the Controller may export all client data in machine-readable format for 30 days. Thereafter the Processor deletes all personal data within 30 days, including rotation out of backups, unless EU or Member-State law requires retention.

## 10. Personal data breach
The Processor notifies the Controller **without undue delay and within 72 hours** of becoming aware of a personal data breach affecting the Controller's data, providing the information required by Art. 33(3).

## 11. Liability and governing law
Liability follows the main Terms of Service. This Agreement is governed by the law of [Greece / Member State], with disputes before the courts of [VENUE].

---

## Annex I — Processing details
As described in §§2–4.

## Annex II — Technical and organisational measures (Art. 32)
- Row-level security enforced in PostgreSQL on every table; coach access scoped by `is_coach_of()` policy, fail-closed
- TLS 1.2+ in transit; AES-256 at rest; HTTP-only cookie sessions with short-lived tokens
- Role-based access (super_admin / admin / coach / client) with database-enforced policies
- Automated backups with point-in-time recovery; restore runbook tested
- Rate limiting and input validation (zod) on all mutation endpoints
- AI calls governed: budgets, run recording (`agent_runs`), no training on customer data
- Secrets in environment configuration only, never in source; CI gate on type-checks and tests before deploy
- Pseudonymous AI telemetry pruned at 90 days
- Incident response runbook with 72h notification commitment

## Annex III — Authorised sub-processors
| Sub-processor | Purpose | Location |
|---|---|---|
| Supabase | Database, auth, storage | United States (AWS us-east-2) — EU migration planned |
| Vercel | Hosting & delivery | United States (us-east-2 / cle1) |
| DeepSeek | AI text inference (minimal task context) | per platform terms |
| Anthropic | AI vision inference (meal photos, zero-retention tier) | US |
| Voyage AI | Embeddings (food names only) | US |
| Langfuse | AI observability (pseudonymous) | EU |

---

**Signatures**

Controller: ____________________  Date: ________

Processor (Trophē): ____________________  Date: ________
