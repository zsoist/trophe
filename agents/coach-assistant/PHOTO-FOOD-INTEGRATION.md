# P5: existing photo observation → explicit portion review → Food creation

This slice consumes an existing observation; it does not analyze an image. API
cost remains US$0, cap0. No UI/route/model registration, attachment upload redo,
provider invocation, SQL installation or production activation is included.

## Native seams reused

- `normalizePhotoAnalysisFoods` and `photoAnalysisToParsedItems`: existing bounded
  photo parser, estimate labeling, confidence cap and plausibility checks.
- `deriveFoodLogEdit`: existing deterministic quantity correction math, used here
  against the parsed basis without writing a temporary row. After creation, the
  existing amount-correction service remains the correction path.
- `buildReviewedFoodLogEntries`: existing native confirmed-photo mapping including
  `source=photo_ai`, `llmRecognized=false`, canonical quantity fields and nutrients.
- `foodLogAddSchema`: extracted verbatim into `lib/food/log-create-validation.ts`
  and re-exported from its existing router entry point. Native add implementation
  and parsing behavior remain identical. AG1 granted this narrow shared lease.

Native `QuickFoodInput.handleConfirm` uses that builder then direct Supabase
insert; `food.log.add` also inserts inline. Neither exports a caller-transaction
creation service. The new small `insertReviewedPhotoFood` reuses their schema and
builder to insert one reviewed item in the same transaction as proposal/receipt.
AG1 may adopt it for native UI separately; this delivery does not change the UI.

Photo v3 returns only normalized provider components. Neither the native route
nor P5 completes recipes with assumed ingredients. A candidate marked
needs_confirmation is rejected until the observation source resolves it.

## Observation boundary and explicit disconnected state

`createPhotoFoodService(db, observationPort?)` requires a server-only
`PhotoFoodObservationPort` for photo reads/proposals and new applications. No port
or missing observation yields not_connected. Receipt recovery does not require an
observation or a surviving image/food row, because it describes an earlier commit.

The port must load the current validated observation using the supplied caller
transaction and lock its canonical row through commit. It must bind actor,
subject, organization, conversation, attachment, normalized image digest and an
immutable observation revision. Re-analysis and authorization lineage changes,
including revoke/restore ABA, must invalidate that revision. It must return null
for withdrawn/unauthorized data. This contract is an integration prerequisite,
not a claim that the current HTTP photo route already provides such storage or
locking: that route currently returns a provider analysis without this attachment
binding. A production adapter has not been fabricated in this slice.

The existing private attachment reservation is locked and checked for exact
scope, available state, digest and expiry. The loader is bounded by five seconds
and cancellation. No public URL or image bytes enter proposals, receipts or audit.
The current attachment lifecycle remains responsible for actual object integrity.

The durable adapter now requires an existing exact saved client chat thread and
the `coach-assistant.chat.v1` contract at every authorization boundary. Its
permanent `access_revoked` bit blocks revoke/restore during provider execution,
even before the first observation exists. Legacy arbitrary conversation IDs
cannot use this adapter. `load` holds `FOR UPDATE OF o,a FOR SHARE OF g` through
the caller's Food commit, including generation status and metadata stability.
AG1/AG4 must validate with native concurrent SQL sessions that generation UPDATE
blocks until that commit and that membership revoke/restore during a paused
provider leaves the saved thread permanently revoked. Injected SQL tests verify
rejection and lock clauses; they do not establish native concurrency behavior.

`createDatabasePhotoFoodObservationAdapter` closes the previously disconnected
production seam without invoking it during this delivery. Its composed
`analyzeAndRecord` flow reads the exact normalized JPEG bytes directly from the
private Storage adapter, verifies their SHA-256 digest, reauthorizes before and
after Storage access, then invokes the existing `photo_analyze` task once with
those bytes and the repository's fixed `photo-analyze.v3.md` prompt. It does not
accept a URL, base64 image, prompt, task name or normalized foods from a browser.
The integrating server supplies only the existing provider invocation callback;
that callback receives a defensive copy of the verified JPEG bytes.

The exact task result is represented by a process-local WeakMap proof. Output must
contain one bounded `submit_food_photo_analysis` call under Luna's existing
`photo-analyze-v3` policy. Historical v1/v2 observations remain readable under the
same authorization, attachment, generation, and ledger checks. An absent identity
assessment reads as `unassessed`; it is never upgraded to identified. New proposals
and applications require `identity_status=identified`, separately from estimated
portion weight. Uncertain components remain hypotheses for clarification or a
separate canonical Food entry; changing a name never reuses their estimated macros.
Previously applied receipts remain recoverable. Invalid candidates are not silently dropped and dish
prior additions requiring confirmation are rejected. Recording accepts only that
proof, locks the attachment again, checks current scope/digest/expiry and verifies
the completed `agent_runs` row plus server-authored attachment metadata. A browser
cannot serialize or fabricate `validated_photo_analysis` provenance.

The proposed `private.coach_photo_food_observations` sidecar stores only normalized
foods, scope, attachment/digest, generation and an immutable UUID revision. A new
analysis deactivates the prior revision under one attachment advisory lock; old
review proposals then fail CAS. `load` joins and locks the active observation,
attachment and completed generation inside the caller's Food transaction. Missing,
removed or expired attachments and changed/missing generation lineage fail closed.
Authorization lineage triggers conservatively deactivate observations on profile,
client-profile or membership changes, including revoke/restore ABA. SQL is a review
artifact only; AG3 did not execute it or add it to the migration ledger.

The current `/api/ai/photo-analyze` route still analyzes browser-supplied base64 and
returns an ephemeral result. It is not connected to this durable adapter and must
not label its response `validated_photo_analysis`. AG1 must explicitly replace
that path with the private attachment + composed adapter flow after schema/RLS and
provider-budget review; importing the recorder alone is insufficient.

`createOfflinePhotoFoodObservationPort` preserves `offline_fixture` provenance.
Every snapshot and proposal also carries `trust=untrusted_image_data`; neither a
validated model observation nor an offline fixture becomes an instruction. Food
candidates containing control-shaped fields such as `operation`, `action`,
`tool`, `prompt`, `system` or `instructions` are rejected before normalization,
so image-derived text cannot smuggle a capability request into the Food contract.
In the normal service, offline review proposals are ephemeral and cannot apply.
The separate server-minted `createIsolatedPhotoFoodBoundary` permits the SAME
reviewed transaction path only in the existing disposable CI/Auth/DB-loopback
environment, with an additional server-only isolated-photo flag. Its WeakMap
capability binds the exact database/pool connection configuration, observation
port and up to eight explicit fixture scopes; forged/copied capabilities, wrong
ports/pools/scopes, production/paid/remote environments and later guard drift fail
closed. No browser flag grants this authority. The existing engine boundary guard
is reused without invoking its model fixture or making any provider call.

Under this boundary, observations remain `offline_fixture` and persisted results
use `storage=isolated_database_fixture` with evaluation metadata:
`mode=isolated_authorized_fixture`, `observation=offline_fixture`,
`visionVerified=false`, `paidApiCalls=0`. That metadata is stored in the SAME
receipt JSON; proposal evidence also remains explicitly synthetic. The normal
runtime cannot apply or recover an isolated-fixture receipt. The canonical
food_log source enum stays `photo_ai`; join its sourceId/proposal/receipt to retain
the fixture provenance, and clean fixture rows after isolated tests. No new schema
or production data labeling claim is made.

The full apply tests use this guard and a transactional test double, without
reclassifying synthetic input as validated_photo_analysis. No real SQL, image
interpretation or API execution has occurred. A future isolated runner must use
actual disposable database/auth fixtures and the same current authorization checks.

## Operations and review

`executePhotoFoodAction` obtains org/current self-client authorization from the
server repository before and after service execution. Service SQL independently
locks current profile/client/membership authorization. No cross-client mode added.

- `photo.food.read`: conversationId, turnId, attachmentId. Returns at most eight
  candidates with stable index, basis version, estimate and uncertainty label.
- `photo.food.propose`: same scope plus observationId, selected itemIndex,
  resourceVersion, and exact after `{loggedDate, mealType, grams}`. These are user
  values; no defaults. Only one selected item is proposed at a time.
- `photo.food.apply`: proposalId, hash, resourceVersion, actionId and reviewed true
  from the user's confirmation of the exact card. Client-supplied macros are not
  accepted; grams rescale the existing estimate in code.
- `photo.food.receipt`: actionId for uncertain/lost-acknowledgement recovery.

The reviewed card retains `nutrition=estimated`, `source=photo_ai` and explicit
portion provenance. Confirming weight does not make estimated nutrition exact.
Grams must be 0.1–10000 and representable to two decimal places, matching existing
numeric storage without silent portion rounding. The resulting nutritional values
must also pass the existing parsed-item/add bounds. No food matching is invented:
this photo parser emits AI estimates, so foodId stays null. The existing canonical
Food amount correction route remains available for later corrections.

Proposals expire in five minutes and are hashed over scope, exact review and
observation evidence. Apply locks the proposal, checks receipt consumption, reloads
the locked observation and recomputes the review using the same calculator. It
requires matching basis/expiry before writing. Proposal ID is the canonical new
food entry ID; durable receipt consumption prevents another action ID from
recreating the entry after deletion. Same-action recovery is scoped to actor, org,
conversation and proposal/hash. Current authorization is still required.

The shared writer inserts one row with sourceId `coach-photo:<observationId>:<index>`.
Canonical returned IDs, nutrients, quantity, provenance and the existing Food
entry revision are validated. Insert, receipt and minimal ID/version audit share
one transaction. Failure rolls back; lost acknowledgement returns uncertain and
must be resolved by same-action receipt recovery, not another creation request.
No correction/training label is synthesized from these estimates.

## Verification and acceptance still required

23 tests pass across three files: 14 new injected/domain tests and nine existing
food.log.add boundary regressions. Scoped TypeScript and file-scoped ESLint pass.
The injected transaction models rollback and lost acknowledgement; it does not
prove real PostgreSQL concurrency/RLS or a vision model's accuracy.

No new table or ledger. AG1 must extend the existing proposal action CHECK with
`food.photo.create` while preserving every other accepted action, and retain the
existing private attachment schema and Food entry revision trigger. Missing
prerequisites fail closed. No DDL is included or executed here.

Required before connection: an authorized, transaction-aware validated observation
adapter; real RLS/locking/expiry/native Food-trigger and concurrent action tests;
revocation/re-analysis ABA tests against that adapter; outer handler confirmation,
refetch/recovery and UI provenance presentation. AG1's current history integration
has priority. The slice does not claim full photo-to-product activation or vision
accuracy. Applied Food entries survive ordinary chat-history removal, consistent
with the existing history cleanup contract; unapplied drafts are removable there.

## Review availability after companion context limits

The food observation and its explicit portion review do not depend on a successful
conversational explanation. The UI offers the existing authorized Photo read from
the submitted turn, including failed companion turns and remounts; the server
still enforces observation scope, expiry, identity and revision on every action.

The companion keeps complete identity notes and the 7,500-byte bound. General
record explanations are sent in the selected response language only. If an
otherwise reviewable photo still exceeds the bound and no other capability is
selected, a deterministic response makes Photo review available and explicitly
states that the additional explanation is unavailable. It invokes no companion
provider and reserves no extra budget. It neither changes nor saves food.

Uncertain and historically unassessed names use neutral component labels in the
UI, companion payload and summary. Their original observations and complete notes
remain unchanged. These labels do not resolve identity or make their macros
eligible for logging. Identified items remain separately selectable and reviewable.
