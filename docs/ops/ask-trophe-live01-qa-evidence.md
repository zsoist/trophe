# Ask Trophē LIVE-01 QA evidence

Captured 2026-09-08 and reconciled 2026-09-09 for branch
`codex/ag1-live01-integration`. The reviewed strict-schema implementation is SHA
`a5db89ef850d195d2d2c0037bee6a08f3b447d00`; the reviewed Luna transport
candidate is SHA `f51e3dd97cca5b476cfb81e691567b72537509ca`. The branch
includes the LIVE-01 route, durable budget authority, redacted provider-failure
persistence, closed output-rejection diagnostics, and the compatibility
corrections described below.

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
- charged after five authorized provider attempts: `14188140` nano-USD
  (USD 0.01418814): three unresolved USD 0.0044 holds plus two settled
  charges totaling USD 0.00098814
- attempts: `5`
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
Preview is deployment `dpl_5aGvovpAwaoeV7J4zy9oYZZv5piL`, URL
`https://trophe-5xlqi844u-2p6y54z6w9-4465s-projects.vercel.app`, for SHA
`c412d8a1834b51d36a73d6c279dfaf5646d4fc8c`. That deployment contains the
reviewed Responses transport and closed output-rejection diagnostics.

## Authorized provider attempts

Five separately authorized, single-attempt requests reached OpenAI through the
governed QA route. None was retried or fell back to another provider. The first
three stopped before token usage and retained the full USD 0.0044 reservation
per attempt as `unknown`. The fourth and fifth returned measured usage and
settled their reservations to measured cost.

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

The fourth attempt ran from reviewed SHA
`51286a8c620f23bde465e22cc7cd838925d0057b` and deployment
`dpl_4X2aKetvcrtHaLZcYztQkV5n8sr9`. The Responses transport reached Luna and
returned measured usage, then the application rejected the generated candidate
as `invalid_output` before exposing text or creating an action:

- conversation: `211f69ef-a3c4-44c7-89ab-5d5690a42ed8`
- turn: `841e11a5-611c-421d-972e-3fcf19eddaec`
- attempt: `3b15e065-c7fa-46f6-82c0-3b3d7d51ad02`
- agent run: `28ce15b9-7cfe-4a67-8134-f3ba0fe38137`
- application HTTP status: `503`; application error: `invalid_output`
- model calls: `1`; retries/fallbacks: `0/0`
- input/output/reasoning tokens: `1211/276/130`
- cache read/write tokens: `0/1082`
- measured cost: `627500` nano-USD (USD `0.0006275`)
- ledger state: `settled`; accounting alert: `false`
- intent/proposal/receipt counts: `0/0/0`

The provider response body, returned model, provider request id, and exact
post-generation rejection stage were not retained. The run therefore proves
the corrected Responses transport and measured accounting, but not the Food
correction behavior. Its final immutable artifact is
`control/ag3/live01-qa-smoke4-211f69ef-a3c4-44c7-89ab-5d5690a42ed8.final.v1.json`,
SHA-256
`b2b58a6f9b45e5a95bcb7e196be68dac517ccd76e55c406e47f74df05a54f66e`.
Its manifest is
`control/ag3/live01-qa-smoke4-211f69ef-a3c4-44c7-89ab-5d5690a42ed8.manifest.json`,
SHA-256
`ea7d892f273f85b55a726339adc343df3a471caf90d5405ef4e0cb5b9bf8a4de`.
Both files parse as JSON and preserve only bounded evidence.

The fifth attempt ran from reviewed SHA
`c412d8a1834b51d36a73d6c279dfaf5646d4fc8c` and deployment
`dpl_5aGvovpAwaoeV7J4zy9oYZZv5piL`. It proved that the closed diagnostic works:
the candidate was rejected specifically at `numeric_prose`, with no candidate
text retained in logs or artifacts.

- conversation: `5b1f926b-ea09-43b3-8e92-8ced8752be2f`
- turn: `83e51e12-36c5-4b26-b06d-8f08a8e73016`
- attempt: `f13efcbc-bb15-4042-919f-786dbc250105`
- agent run: `0a2008cc-a144-4db0-80fc-e3ee06728c74`
- application HTTP status: `503`; application error: `invalid_output`
- closed rejection stage: `numeric_prose`
- model calls: `1`; retries/fallbacks: `0/0`
- input/output/reasoning tokens: `1211/261/130`
- cache read/write tokens: `1082/0`
- measured cost: `360640` nano-USD (USD `0.00036064`)
- ledger state: `settled`; accounting alert: `false`
- intent/proposal/receipt counts: `0/0/0`

Its final immutable artifact is
`control/ag3/live01-qa-smoke5-5b1f926b-ea09-43b3-8e92-8ced8752be2f.final.v1.json`,
SHA-256
`640f238f0586210390cd1f02d14e55d2577c934fbe2b6546714cdb41b35e89cf`.
Its manifest is
`control/ag3/live01-qa-smoke5-5b1f926b-ea09-43b3-8e92-8ced8752be2f.manifest.json`,
SHA-256
`c990e197d2ef1264b9b9a5fc7d517d9d77c92338632c9e89471a056251a1730f`.
Both files parse as JSON and preserve only bounded evidence.

The Food entry remains at `250 g`, revision `1`; durable proposal and receipt
counts remain zero. The corrective slice keeps Luna responsible for selecting
the typed Food action and validates its old/new quantities against the exact
server-bound target. Only for that valid action path, user-facing answer and
follow-up copy become deterministic before the numeric-prose guard. General
answers, evidence references, the independent review gate, explicit user
confirmation, writer authority, and receipt behavior remain unchanged.

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
