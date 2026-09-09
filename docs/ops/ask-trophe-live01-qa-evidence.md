# Ask Trophē LIVE-01 QA evidence

Captured 2026-09-08 for branch `codex/ag1-live01-integration`. The application
implementation was reviewed at SHA
`bdaa150e63500b451c01e9a3678b7762e114a308`; this receipt is its
documentation-only successor.

## Destination and isolation

- Supabase organization: `myqehkbgfbxnxzmkjsav`, Free plan.
- QA project: `Trophe-QA`, ref `nhawdvqqxscwxbpngaql`, region `us-east-2`,
  status `ACTIVE_HEALTHY`.
- Production project ref `iwbpzwmidzvpiofnqexd` was not migrated, seeded, or
  rebound.
- SSL enforcement is enabled; the migration and verification connection
  reported TLS active.
- QA Auth, Database, and Storage all responded on project ref
  `nhawdvqqxscwxbpngaql`. Auth and Storage returned HTTP 200.
- Auth contains exactly one matching synthetic LIVE-01 actor. The application
  relation set contains one profile, one client profile, one organization
  membership, and one fixed Food entry. No production user data was copied.
- QA has zero scheduled cron jobs. The migration-created job was removed before
  the environment was exposed.

## Schema receipt

- Canonical Drizzle journal count: `87`.
- Latest journal `created_at`: `1788907813843`.
- Latest journal hash (`0086`):
  `a249bb9d8e01d469af2786fff8e77fe59802f6449fcc8d8dbd03c24d5e3c5e56`.
- Repository SHA-256 for `0085`:
  `bf3701cc2e4b2db8de886148b0e75a734456f4d1b880dd40ce8041c6009b1cbd`.
- Repository SHA-256 for `0086`:
  `a249bb9d8e01d469af2786fff8e77fe59802f6449fcc8d8dbd03c24d5e3c5e56`.
- Isolated durable-actions SHA-256:
  `1b069b4a2cacbe9766a417c161001ad6df1ab2abe743c73553ce9f5f92685722`.
- Isolated Food-actions SHA-256:
  `145bb2f708ddf844f7cb25e0c3c0aeb6d843eaa210388207e8e224baadac89a2`.
- `scripts/db/verify.ts`: PASS.
- `supabase db lint --schema public,private --level error --fail-on error`:
  PASS, no schema errors.

The first canonical migration attempt rolled back as one transaction because
the new project did not yet contain the required extensions. Its journal count
remained zero. After installing `vector`, `pg_trgm`, and `pgcrypto`, and creating
the QA-only Vault secret required by migration `0048`, the complete canonical
chain succeeded.

## Shared authority proof

`private.coach_pilot_budgets` has RLS enabled and exactly one row:

- id: `a857fa8d-2bb8-4a7e-a190-5f8f1cf66229`
- scope: `ask-trophe-shared`
- allowed actor count: `1`
- daily hard cap: `3000000000` nano-USD (USD 3.00)
- initial operating target: `500000000` nano-USD (USD 0.50)
- charged: `0`
- attempts: `0`
- accounting blocked: `false`

Direct reads as `anon` and `authenticated` both returned permission denied.
Only the database owner used by the server runtime can execute the ledger path;
the browser has no ledger access.

## Food correction fixture

- Fixed entry id: `00000000-0000-4000-8000-000000000150`.
- Initial quantity: `250 g`.
- Initial revision: `1`.
- Source: synthetic `natural_language` entry.
- Intended review slice: “Fueron 150 gramos, no 250” → review-required intent
  → proposal → explicit confirmation → one receipt → refetch at `150 g`.

## Vercel Preview binding

The following ten variables exist specifically for Preview branch
`codex/ag1-live01-integration`:

- `DATABASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `COACH_ASSISTANT_ENABLED`
- `COACH_ASSISTANT_LIVE_PILOT_ENABLED`
- `TROPHE_ALLOW_PAID_AI`
- `COACH_ASSISTANT_PREVIEW_USER_IDS`
- `COACH_ASSISTANT_DATA_SOURCE`
- `COACH_ASSISTANT_FOOD_ACTIONS_ENABLED`
- `NEXT_PUBLIC_COACH_FOOD_ACTIONS_ENABLED`

The database URL and actor allowlist are Vercel Secrets. The existing Preview
OpenAI key was reused without reading its value. AG3 must use the deployment
created after these bindings for the single paid smoke.

## Open advisories

Supabase Security Advisor returned five informational notices and seven warnings
from inherited schema or project configuration. They include server-only private
tables without policies, existing security-definer/search-path advisories, the
`vector` extension in `public`, and leaked-password protection disabled. No new
rewrite was introduced in this slice; these findings remain visible for a
separate hardening decision.
