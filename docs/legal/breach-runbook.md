# Personal Data Breach Runbook (GDPR Art. 33/34)

> Referenced by the DPA Annex II and trophe.app/trust. Owner: Daniel (acting DPO).
> The 72-hour clock starts at **awareness**, not at full diagnosis.

## 1. Detect & contain (hour 0–2)
- Sources of awareness: Supabase auth/database logs, Vercel runtime logs,
  Langfuse anomalies, user report, security researcher email to dpo@trophe.app
- Immediately: rotate affected credentials (Supabase service key, Vercel env),
  revoke suspect sessions (`auth.sessions` delete), disable the affected
  endpoint via middleware flag if exploitation is ongoing
- Snapshot evidence BEFORE remediation: export relevant logs, `agent_runs`,
  affected table rows (timestamps, IPs)

## 2. Assess (hour 2–24)
Record in an incident note (docs/legal/incidents/YYYY-MM-DD.md):
- What data categories were exposed (identity / body metrics / Art. 9 lifestyle
  data / messages)? How many data subjects? Which coach orgs (controllers)?
- Risk to rights and freedoms: low / risk / high risk (drives Art. 34 duty)

## 3. Notify (within 72h of awareness)
- **Controllers (coaches/clinics)**: email every affected controller without
  undue delay — they own the relationship with the supervisory authority for
  their clients' data. Include: nature of breach, categories + approximate
  counts, likely consequences, measures taken, DPO contact
- **If trophē is controller** (direct consumer users): notify the Greek DPA
  (HDPA, www.dpa.gr) within 72h; if high risk, notify data subjects directly
  (Art. 34) in plain language, EL + EN
- Template: see §Annex below

## 4. Remediate & close (day 3–14)
- Root-cause fix shipped with test; CI green; verify no recurrence in logs
- Update Annex II measures if the breach revealed a gap
- Post-mortem in the incident note: timeline, blast radius, fix, prevention

## Annex — Controller notification template
Subject: [trophē] Security incident affecting your client data — action required

We are writing to inform you of a personal data breach affecting the trophē
platform, detected on [DATE/TIME UTC].
- Nature: [unauthorised access / disclosure / loss] of [data categories]
- Affected: approximately [N] of your clients
- Likely consequences: [...]
- Measures taken: [containment + remediation]
- Recommended actions for you: [...]
Contact: dpo@trophe.app. We will provide updates as the investigation proceeds.
