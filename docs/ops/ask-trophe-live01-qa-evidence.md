# Ask Trophē LIVE-01 QA evidence

Captured 2026-09-08 through 2026-09-09 and reconciled 2026-09-09 for branch
`codex/ag1-live01-integration`. The mounted journey fixes are SHAs
`f654052fe5eb4f23d733bf63552a23f7089f05b4`,
`f0fc4052692a6447dc4f9f6d347e8f71238b625b`, and
`e47db1f74bbe8860b6a5f8c5d617a942f2b1a4f4`. The branch includes the
LIVE-01 route, durable budget authority, redacted provider-failure persistence,
closed output-rejection diagnostics, and the contextual Food corrections
described below.

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
  membership, and three isolated synthetic Food entries used by the governed
  correction slices. No production user data was copied.
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
- charged after eleven authorized provider attempts: `16911920` nano-USD
  (USD 0.01691192): three unresolved USD 0.0044 holds plus eight settled
  charges totaling USD 0.00371192
- attempts: `11`
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

The following eleven variables exist specifically for Preview branch
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
- `NEXT_PUBLIC_COACH_EVERYWHERE_ENABLED`

The database URL and actor allowlist are Vercel Secrets. The existing Preview
OpenAI key was reused without reading its value. The final mounted journey ran
on exact-head deployment `dpl_9vED1BXnpCMTawjQ5aX3Cn7Tb3VN`, URL
`https://trophe-91kn9rvdf-2p6y54z6w9-4465s-projects.vercel.app`, for branch
HEAD `7a0b0d67a31f9c436c5dadcaceb721eb415dce24` and functional SHA
`e47db1f74bbe8860b6a5f8c5d617a942f2b1a4f4`. It contains the reviewed
Responses transport, deterministic Food action review copy, and the three
context-binding corrections used by the mounted journey.

## Authorized provider attempts

Eleven separately authorized, single-attempt requests reached OpenAI through
the governed QA route. None was retried or fell back to another provider. The
first three stopped before token usage and retained the full USD 0.0044
reservation per attempt as `unknown`. The fourth through eleventh returned
measured usage and settled their reservations to measured cost.

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

Before the sixth attempt, the Food entry remained at `250 g`, revision `1`, and
durable proposal and receipt counts remained zero. The corrective slice keeps Luna responsible for selecting
the typed Food action and validates its old/new quantities against the exact
server-bound target. Only for that valid action path, user-facing answer and
follow-up copy become deterministic before the numeric-prose guard. General
answers, evidence references, the independent review gate, explicit user
confirmation, writer authority, and receipt behavior remain unchanged.

The sixth attempt ran from reviewed SHA
`77dd45b19f782923bff124c097380fe504d62ec9` and deployment
`dpl_EnzvXhxtQsiRBX9F9qiKn7tA8oMp`. It completed the intended Food vertical:

- conversation: `aac8bdad-84e7-42ae-8832-275c22144a12`
- turn: `ef4bf8f8-a233-4037-81c3-be2d5b6d0cec`
- attempt: `bfa975c8-ca67-4b32-97ec-32062dfb3001`
- agent run: `915e7667-d27d-4f7f-8798-ea8f9c33fbb5`
- application HTTP status: `200`
- one Luna call selected the exact review-required `250 g` to `150 g` Food
  intent; retries/fallbacks: `0/0`
- input/output/reasoning tokens: `1211/200/90`
- cache read/write tokens: `1082/0`
- measured cost: `287440` nano-USD (USD `0.00028744`)
- ledger state: `settled`; accounting alert: `false`
- proposal: `eb765857-eae9-42cc-a19e-5351638cd3f6`, resource version `1`
- confirmed action: `180742be-3940-41a7-b100-31fa82e6833f`
- receipt: `2e1208cc-74a4-439c-82bf-86ae3058a438`, status `applied`
- refetch: Food `150 g`, resource version `2`; receipt recovery returned the
  same receipt and did not apply the action again

Its final immutable artifact is
`control/ag3/live01-qa-smoke6-aac8bdad-84e7-42ae-8832-275c22144a12.final.v1.json`,
SHA-256
`1d1733ed09efd0d16640ec4ed125e2e2b405c0eb60ac78102d203e9027407f23`.
Its manifest is
`control/ag3/live01-qa-smoke6-aac8bdad-84e7-42ae-8832-275c22144a12.manifest.json`,
SHA-256
`39e79998322311e41b144aaeaea19a3f6ea2ff489f928f36ffbd61181210c1f6`.

## Mounted Food journey, attempts seven through ten

A second fixed QA entry exercised the real Food screen and the mounted global
Ask Trophē panel:

- entry: `00000000-0000-4000-8000-000000000151`
- date and meal: `2026-09-08`, Lunch
- label: `Arroz integral cocido · LIVE-01 APP7`
- starting state: `250 g`, `310 kcal`, resource version `1`
- requested correction: `Fueron 150 gramos, no 250`

Attempt seven returned a valid Luna Food action intent but omitted the optional
entry hint. The mounted UI then combined that intent with the snapshot window
end date instead of the already-authorized entry selected on the Food screen.
Resolution returned `not_found`; no proposal, receipt, or Food mutation was
created. Its settled provider record is:

- turn: `fcca6b67-0e1b-456e-9822-828f2641eaaa`
- attempt: `beda3c95-3237-43c8-9a6d-13cab09152f9`
- agent run: `af89c810-bb21-4bf8-8c5a-54d01a9d439a`
- provider request: `req_8fd50abecdcf4740bf2090c602762e64`
- input/output/reasoning tokens: `1233/238/127`
- cache read/write tokens: `0/1104`
- measured cost: `587400` nano-USD

SHA `f654052fe5eb4f23d733bf63552a23f7089f05b4` preserves the selected,
authenticated Food entry when the valid provider intent omits its optional
entry hint and the selected grams match the provider's stated previous grams.
The focused regression proves that a different or stale quantity is not
silently adopted.

Attempt eight exercised that correction. Luna completed and settled, but the
candidate was rejected at the closed `numeric_prose` gate. The provider request
still lacked the selected meal as structured screen context, so the model had
to infer the target from prose. No proposal, receipt, or Food mutation was
created.

- turn: `a6fd9843-cbb6-43e7-bb22-cb0b89703bfd`
- attempt: `fa441e82-da7f-4ec8-a3b6-fe830074d992`
- agent run: `e458c6fc-bc25-4d81-a4c0-3d5a889525c8`
- provider request: `req_01544fd8f84c4e3a9b047aba56c5173b`
- input/output/reasoning tokens: `1233/321/175`
- cache read/write tokens: `1104/0`
- measured cost: `433080` nano-USD

SHA `f0fc4052692a6447dc4f9f6d347e8f71238b625b` sends the already-authorized
Food selection as the current `meal` entity when screen context is enabled.
This adds the missing selection identity to the provider request without
granting the model writer authority.

Attempt nine returned a valid Luna intent. Food resolution received both the
correct entry id and the unrelated snapshot window end date. The service
correctly found the entry by id, then failed closed because the returned entry
date did not match the redundant date hint. No proposal, receipt, or Food
mutation was created.

- turn: `4fe89aea-4beb-4b39-b9bd-b1a92d0c47d3`
- attempt: `ed225f26-1cfe-4afa-b0c2-ce41632a176d`
- agent run: `aec7c978-a981-41d3-8518-1bea4bdefebc`
- provider request: `req_a2a76e399970466386139a121efa9aa7`
- input/output/reasoning tokens: `1233/361/204`
- cache read/write tokens: `1104/0`
- measured cost: `481080` nano-USD

SHA `e47db1f74bbe8860b6a5f8c5d617a942f2b1a4f4` gives the exact selected
entry id precedence and omits the date hint when that identity is available.
The regression suite locks this request envelope and the pre-existing
fail-closed behavior for ambiguous or stale selections.

Attempt ten then completed the mounted inference and review boundary on that
exact SHA. The Food page selection was visible before the single send. Luna
returned one valid review-required action intent, `food.resolve` returned 200,
and `food.propose` returned 200. The mounted panel displayed the deterministic
answer and a before/after table for grams, calories, protein, carbohydrates,
fat, fiber, and sugar.

- conversation: `90b04e22-1402-4b64-ab4f-cf2450f64390`
- turn: `9dfe3244-98bc-446b-9d52-60de486b2d63`
- attempt: `ff192410-e113-4ab3-bf0e-9b8cb9cbd33b`
- agent run: `1fc0e0e9-9c1b-4af0-94e8-786b95816e2d`
- provider request: `req_d8de28ff43854d6ebfbe54a4db66b4da`
- input/output/reasoning tokens: `1233/267/120`
- cache read/write tokens: `1104/0`
- measured cost: `368280` nano-USD
- proposal: `cc3f4025-5554-4490-8d81-0897cbd0b601`
- proposal hash:
  `30b37c9340acdf9e676222fdfe8b1da0db6da7a71c4a49f8bd4b00dbb12fc3f0`
- proposed change: `250 g` to `150 g`, resource version `1`
- writer activity before review: zero receipts and Food unchanged at `250 g`

The browser automation process restarted after the proposal screenshot and
before the confirmation click. The proposal expired at
`2026-09-09T06:56:59.885Z` without a receipt or mutation. It was not replayed,
extended, or represented as a completed end-to-end journey.

The writer boundary was then exercised separately from the same mounted
deployment without another provider request. The user-visible entry action
opened Ask Trophē, loaded the exact `250 g` entry, created a fresh before/after
review for `150 g`, and required an explicit click on `Confirm quantity change`.
That click produced one apply response, one read response, one durable receipt,
and a mounted Food refetch:

- manual review conversation: `9bdfae95-eca4-4b14-9157-c5af10675634`
- proposal: `040d9841-f3c5-4863-9810-fd69c5b5be26`
- confirmed action: `904af74d-649f-435b-b6c7-7cd73740bc30`
- receipt: `a815886a-3a33-401a-8436-fd4d778dca5b`, status `applied`
- persisted result: `150 g`, `186 kcal`, `3.9 g` protein, `38.4 g`
  carbohydrates, `1.5 g` fat, `2.7 g` fiber, `0.5 g` sugar
- resource version: `1` to `2`
- mounted Lunch total: `496` to `372` kcal after refetch
- additional provider calls: `0`; ledger remains at `10` attempts

This split evidence proves the mounted model-to-proposal path and the mounted
review-to-write-to-readback path. It does not claim that attempt ten itself was
confirmed after the browser restart.

- mounted attempt-ten proposal screenshot:
  `control/ag1/live01-mounted-app10-proposal.final.v1.png`, SHA-256
  `8d315a97fe89788299adcc7a1a272896432f7f035de87b74ed01a8973f96b608`
- mounted manual review screenshot:
  `control/ag1/live01-mounted-manual-review.final.v1.png`, SHA-256
  `5fe2864f3364687a363fb804d6ed5f05791bb38cdfb0d913550ea8588683b527`
- mounted receipt and Food readback screenshot:
  `control/ag1/live01-mounted-confirm-readback.final.v1.png`, SHA-256
  `68a502452bff4d8349d645b3d93317e115076f9a52445dd2a9cf5aa50d8492e7`
- bounded evidence:
  `control/ag1/live01-mounted-food-closure.final.v1.json`, SHA-256
  `a8a0df37223363debbdd45e17c38926bce356c1f4900af22344d0e79d12a0d9e`
- manifest:
  `control/ag1/live01-mounted-food-closure.manifest.json`, SHA-256
  `8037811b36dd94e135e63365572e00505fdba9913a5ab74e577e0312883e2b83`

## Continuous mounted Food journey, attempt eleven

A third unique QA entry was created for the coordinator-authorized final
journey. Production remained untouched.

- entry: `00000000-0000-4000-8000-000000000152`
- date and meal: `2026-09-08`, Lunch
- label: `Arroz integral cocido · LIVE-01 APP11`
- starting state: `250 g`, `310 kcal`, resource version `1`
- requested correction: `Fueron 150 gramos, no 250`

Immediately before the single send, the database showed the fixture at its
starting state, zero proposals, zero receipts, and a ledger at ten attempts
without an accounting block. One `gpt-5.6-luna` request at frozen `low`
reasoning returned a valid review-required Food action. The mounted panel
displayed the deterministic before/after table. The exact proposal was
confirmed in the same uninterrupted browser process before its five-minute
expiry. The writer produced one durable receipt, the application refetched the
entry, and the mounted Food screen changed Lunch from `682` to `558` kcal.

- conversation: `f545ce83-b6b7-42cf-a4e6-fb1f19b14fa0`
- turn: `f26bc418-5dca-4ee4-b854-9cd81857dd80`
- attempt: `b282f3af-3860-4f6a-9ed0-28bf367ea432`
- agent run: `fb542df7-c5f7-4da5-a68f-cd910d09b53f`
- provider request: `req_a33d745c19824e7a82939d9157af85f1`
- model calls: `1`; retries/fallbacks: `0/0`
- input/output/reasoning tokens: `1255/216/100`
- cache read/write tokens: `0/1126`
- measured cost: `566500` nano-USD (USD `0.0005665`)
- ledger state: `settled`; accounting alert: `false`
- proposal: `da517c74-48f8-4b38-b97c-1a92f24fd75a`
- proposal hash:
  `1d75ea249f56d8fa19d1c64b5808b2d47043da55d4ad76c0fa80c7c26b708be0`
- proposal created: `2026-09-09T12:18:02.881730Z`
- proposal expiry: `2026-09-09T12:23:02.896Z`
- confirmed action: `b8feb2d3-7f30-42e9-82c3-74803f1b01cc`
- receipt: `6a2417a9-980c-48d9-8d8e-2a5716aada20`, status `applied`
- persisted result: `150 g`, `186 kcal`, `3.9 g` protein, `38.4 g`
  carbohydrates, `1.5 g` fat, `2.7 g` fiber, `0.5 g` sugar
- resource version: `1` to `2`; refresh strategy: `refetch`
- final ledger: `11` attempts, `16911920` nano-USD charged,
  accounting blocked `false`

This attempt closes the earlier split-boundary limitation with one observable
mounted journey from selected entry through Luna proposal, explicit
confirmation, durable receipt, refetch, and visible final state.

- composer and initial-state screenshot:
  `control/ag1/live01-app11-composer-before-send.final.v1.png`, SHA-256
  `7e30d11c76c102f196870fbbb745c0e7b158a59b3a69412740f1a2a1331492f0`
- proposal screenshot:
  `control/ag1/live01-app11-proposal-before-confirm.final.v1.png`, SHA-256
  `e42d9cadec49ef54d1368a348e7cf347d7fc0b6f28694a608429d267cf18a8ba`
- confirmed mounted readback screenshot:
  `control/ag1/live01-app11-confirmed-readback.final.v1.png`, SHA-256
  `f9f91bbe517d35ef1c055eb1da2f2ea2fcc122b047ff267dd73b393406998b83`
- bounded evidence:
  `control/ag1/live01-app11-continuous-journey.final.v1.json`, SHA-256
  `f518f55d0d75a44c0794df8b9af42b1c92a125d8cda3a11c9e759650f4b96544`
- manifest:
  `control/ag1/live01-app11-continuous-journey.manifest.json`, SHA-256
  `7c0447dcff00a33653b5f115db08ecfa848d572e4381d6e50cb50e5b68ca04d7`

AG3 independently reconciled the immutable evidence without a provider call or
QA/production mutation and returned PASS:

- reconciliation:
  `control/ag3/live01-app11-continuous-journey.reconciliation.final.v1.json`,
  SHA-256
  `3cc3405106bd206b824af59dad95c9d2b17728a816c75c86bc2e21f49a746040`
- reconciliation manifest:
  `control/ag3/live01-app11-continuous-journey.reconciliation.manifest.json`,
  SHA-256
  `10a54195305c30accf9be0781fae93d098826cb1d365f7adedd8173e6406fe22`

AG4 returned PASS with no blocking findings and marked PR #137 review-ready
after this documentation-only seal. Its non-blocking limit is that the mounted
browser evidence covers desktop QA, not a physical mobile device or other
product domains.

## Visible QA readback

An authenticated browser opened the exact Preview, selected 2026-09-08,
expanded Lunch, and opened the entry detail without saving. The mounted Food
UI displayed `Arroz integral cocido · LIVE-01 QA`, `150 g`, and the recomputed
nutrition (`186 kcal`, `3.9 g` protein, `38.4 g` carbs, `1.5 g` fat, `0.5 g`
sugar). The browser performed zero mutations and zero provider calls.

- screenshot:
  `control/ag1/live01-qa-food-150g-readback.final.v1.png`, SHA-256
  `7ac2ec9e2ef5d08ed3c487a58486870617c016f4127bf36bb4df41abffc8998d`
- bounded UI evidence:
  `control/ag1/live01-qa-food-150g-readback.final.v1.json`, SHA-256
  `a923d63b2fcb225e41eb7883300ab5ed08488e95d8569f5287c43413849c935e`
- manifest:
  `control/ag1/live01-qa-food-150g-readback.manifest.json`, SHA-256
  `7eb336a7e07db99fe9304cee53b6f1dbb38bdb5458153a65b6ecba51f3c19ccc`

The screenshot proves the mounted application readback at `150 g`. The
provider turn, proposal, confirmation, writer, receipt, and idempotent recovery
were exercised by the governed HTTP runner and reconciled in the database; the
current UI does not expose the receipt id or resource version and this capture
must not be presented as a complete on-screen Ask Trophē journey.

Future provider failures may also retain `error.param` when it exactly matches
the closed request-field allowlist. Arbitrary paths and provider messages remain
discarded. This cannot reconstruct the missing parameter from either historical
attempt.

SHA `a35880acf835276c47608d130a5d941d46ce5da4` adds bounded success
provenance for future settled attempts: the verified exact Luna response model
and an allowlisted `req_...` request id are persisted with the ledger record,
and the request id is copied to the existing `agent_runs.request_id` column.
Idempotent settlement accepts only the same usage and the same success identity;
mismatched, omitted-after-present, or backfilled historical identity fails
closed. The sixth attempt predates this persistence and remains explicitly
inconclusive for returned model and provider request id; neither value was
backfilled or inferred.

## Open advisories

Supabase Security Advisor returned five informational notices and seven warnings
from inherited schema or project configuration. They include server-only private
tables without policies, existing security-definer/search-path advisories, the
`vector` extension in `public`, and leaked-password protection disabled. No new
rewrite was introduced in this slice; these findings remain visible for a
separate hardening decision.
