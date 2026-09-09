# Ask Trophē LIVE-01 QA evidence

Captured 2026-09-08 and reconciled 2026-09-09 for branch
`codex/ag1-live01-integration`. The reviewed strict-schema implementation is SHA
`a5db89ef850d195d2d2c0037bee6a08f3b447d00`; the reviewed Luna transport
candidate is SHA `f51e3dd97cca5b476cfb81e691567b72537509ca`. The branch
includes the LIVE-01 route, durable budget authority, redacted provider-failure
persistence, and the compatibility corrections described below.

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
- charged after the three authorized provider attempts: `13200000` nano-USD
  (USD 0.0132)
- attempts: `3`
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
OpenAI key was reused without reading its value. The latest provider-tested
Preview is deployment `dpl_2AFFtLnrETJxJDYf6fof2UWbveXk`, URL
`https://trophe-25fzl000w-2p6y54z6w9-4465s-projects.vercel.app`, for SHA
`afacb5c3b4aa70893d2e0c5433deb58ed7666dd5`. The reviewed Responses transport
candidate has not yet been deployed or sent to the provider.

## Authorized provider attempts

Three separately authorized, single-attempt requests reached OpenAI through the
governed QA route. None was retried or fell back to another provider.
All three stopped before token usage and retained the full USD 0.0044 reservation
per attempt as `unknown`.

The first attempt predated durable provider diagnostics. Its final immutable
artifact is
`control/ag3/live01-qa-smoke-84781575-662a-431e-8d70-8a2952f6a4e7.final.v1.json`,
SHA-256
`c20ea28d4539674f6b7fc1d7d7f7c360158e90dc3108a10c4395852b51a4f270`.
Its provider cause remains permanently unresolved.

The second attempt ran from reviewed SHA
`385d546f7c09e5c6eb221be124f57bf1aeb65df4` and deployment
`dpl_C8CwC7vpMmejPb2Yy8idJ1D6J1du`. It persisted this bounded diagnostic:

- attempt: `7a415559-6583-4426-a7b8-5905d4322d67`
- agent run: `a53f0d48-4ae6-41ac-8973-33c9f6d9c642`
- HTTP status: `400`
- provider type: `invalid_request_error`
- request id: `req_a69eb3d8929d4b26a8e86879d91d5249`
- usage: absent; intent/proposal/receipt counts: `0/0/0`

Its final immutable artifact is
`control/ag3/live01-qa-retry-28af2046-cba1-4dba-87c8-345939616c9a.final.v1.json`,
SHA-256
`ce5fe9a9d7fa821903d901732c0f71884e8bb3ceb8335eb375ce9334e537bb1d`.

Offline inspection reproduced the invalid strict function schema: the declared
nullable `actionIntent` property was omitted from the root `required` list.
OpenAI strict function schemas require every declared object property to be
required. SHA `a5db89ef850d195d2d2c0037bee6a08f3b447d00` corrects only that wire schema,
keeps `actionIntent` nullable, and leaves the runtime Zod validator and review
authority unchanged. Sixty-seven focused tests, typecheck, focused ESLint, and
the full CI workflow passed. AG4 approved the integrated correction for review.

The third attempt ran from reviewed SHA
`afacb5c3b4aa70893d2e0c5433deb58ed7666dd5` and deployment
`dpl_2AFFtLnrETJxJDYf6fof2UWbveXk`. It persisted this bounded diagnostic:

- conversation: `bcc41000-0e28-4952-85aa-b9debff923f5`
- turn: `2ff1ba24-10c9-4505-884f-311319cf5e9b`
- attempt: `96b71731-97b1-4f49-842d-c00be4062787`
- agent run: `cc91d3e0-6a41-48ec-80a3-8883468f1fba`
- application HTTP status: `503`
- provider HTTP status: `400`
- provider type: `invalid_request_error`
- rejected parameter: `reasoning_effort`
- provider request id: `req_d2e84946cd544708b477e1d3cabcc1ba`
- model calls: `1`; retries/fallbacks: `0/0`
- usage: absent; input/output/reasoning tokens: `0/0/0`
- intent/proposal/receipt counts: `0/0/0`

Its final immutable artifact is
`control/ag3/live01-qa-smoke3-bcc41000-0e28-4952-85aa-b9debff923f5.final.v1.json`,
SHA-256
`1812b5ab463a92ac2a1ad8cb3ba9111920ede5bdc063ea9b6f2356e91dfa668e`.
Its manifest is
`control/ag3/live01-qa-smoke3-bcc41000-0e28-4952-85aa-b9debff923f5.manifest.json`,
SHA-256
`f8238145d574dcb9f7f41351bda8bc398bdc0c51ee5a16a8e5df0351508111a4`.
The manifest marks the earlier mutable capture as superseded. Both files parse
as JSON and passed a local credential-marker scan.

This response established that the deployed Chat Completions wire contract was
rejected before generation. It did not prove that the model, strict schema, or
Food action semantics were invalid. The provider message was not retained and
the closed diagnostic allowlist stored only the parameter name.

SHA `f51e3dd97cca5b476cfb81e691567b72537509ca` routes only exact
`gpt-5.6-luna` structured calls through the OpenAI Responses endpoint. It keeps
the frozen `low` reasoning policy, the 2,000-token bound, one transport attempt,
`store: false`, the stable prompt-cache key, the forced strict function, the
existing Zod validator, abort behavior, paid-attempt debit, and error
redaction. Other OpenAI models and Mistral remain on Chat Completions. The
Responses parser requires one completed named function call, permits only
opaque reasoning siblings, and rejects text, refusals, missing or multiple
calls, incomplete output, invalid JSON, and schema-invalid arguments. AG4
approved this exact candidate for code integration. This is OFFLINE evidence;
it does not yet prove provider success.

The Food entry remains at `250 g`, revision `1`; durable proposal and receipt
counts remain zero. Daniel authorized one fourth single-attempt QA smoke through
the coordinator, conditional on AG4 PASS, a Ready deployment of the corrected
wire contract, and reconciliation of the third reservation. Those conditions
do not authorize a fifth attempt or any production action.

Future provider failures may also retain `error.param` when it exactly matches
the closed request-field allowlist. Arbitrary paths and provider messages remain
discarded. This cannot reconstruct the missing parameter from either historical
attempt.

## Open advisories

Supabase Security Advisor returned five informational notices and seven warnings
from inherited schema or project configuration. They include server-only private
tables without policies, existing security-definer/search-path advisories, the
`vector` extension in `public`, and leaked-password protection disabled. No new
rewrite was introduced in this slice; these findings remain visible for a
separate hardening decision.
