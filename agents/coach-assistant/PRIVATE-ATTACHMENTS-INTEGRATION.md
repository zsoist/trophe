# Private normalized photos — isolated service slice

Implementation: attachments-storage.ts uses the existing Supabase JS SDK and
normalizeCoachImage (Sharp) for JPEG/PNG/WebP, 5MiB input/output, 16M pixels,
single frame, orientation normalization and EXIF removal. attachments-service.ts
provides real SQL reservation/lifecycle transactions. Neither stores production
state in a Map. Tests use explicit doubles; actual Storage/SQL acceptance remains
AG1's disposable hostedAuth responsibility. No vision/provider call is added.

Food has no applicable durable photo bucket in the inspected current service.
Chat uses private chat-attachments and participant/message-based policies, signed
reads and orphan deletion, but its coach/client namespace is incompatible with
AI-coach self/org/thread authorization. Reuse the existing SDK/API mechanisms,
not that bucket or its policies. No bucket is created by either factory.

## Server binding and configuration (AG1)

createPrivateCoachImageStorage({url,serviceKey,bucket,fetchImpl?}) requires an
explicit http loopback URL, no path/query/credentials, explicit bucket named
coach-attachments-<isolated suffix>, and a server-only key. No environment lookup,
production URL, public bucket fallback, arbitrary URL input or getPublicUrl.
getBucket verifies id/public=false before each storage operation. The caller
must provision an immutable private synthetic bucket in the disposable stack,
with JPEG-only MIME, 5MiB cap, and no anon/authenticated direct object policies.
Only the server service client reaches objects; scoped lifecycle authorization
uses current client role and membership locked in SQL. Signal is propagated to
SDK fetch, including inherited signal, not merely checked between calls.

createPrivateAttachmentService(db,storage,signingKey) requires >=32 secret bytes
stable across service instances using the same reservations. Keep this key in
the server harness configuration. Only SHA256(uploadToken) persists. Raw HMAC
upload tokens are returned to the authorized owner and never logged/stored.
Key rotation causes old reservation recovery to fail closed until expiry/cleanup.
No route/UI/root configuration is edited in this slice.

## Exact isolated SQL contract

private.coach_attachment_uploads columns:
- id UUID PK; actor_id/subject_id/organization_id/conversation_id/request_id UUID
  nonnull; UNIQUE(actor_id,request_id); actor_id=subject_id.
- bucket text nonnull, object_path text nonnull UNIQUE(bucket,object_path).
  Path is server-derived org/subject/conversation/attachmentId.jpg; no filenames.
- mime text enum image/jpeg,image/png,image/webp; input_bytes integer 1..5242880.
- upload_token_hash text lowercase64hex nonnull; source_digest and
  normalized_digest lowercase64hex nullable.
- state text enum prepared,available,removed; metadata JSONB nullable containing
  only normalized mime/bytes/width/height (<=16M pixels), never EXIF or source name.
  available requires both digests and metadata; prepared may have source_digest
  after the initial-byte claim; removed must not be reactivated.
- expires_at timestamptz nonnull, fixed DBclock+15min on prepare, never extended.
  Index(bucket,state,expires_at), plus complete actor/subject/org/thread scope.
- Private schema RLS/revokes; no anon/authenticated direct access. Do not cascade
  reservations away on actor/org deletion while storage objects remain: retain
  cleanup-capable tombstones until deletion via Storage API, then erase metadata
  under the project's erasure policy. SQL-only DELETE storage.objects is invalid.

States: prepare commits row before any upload. Retry prepare uses optional
requestId (UI should always generate and retain it); omitted requestId preserves
legacy call shape but cannot guarantee prepare-response recovery. Same ID with
different subject/org/thread/bucket/mime/size conflicts. Removed/expired IDs never
resurrect. Global per-bucket advisory lock serializes reservations; reserve 5MiB
per nonremoved row, including expired/uncertain rows until actual cleanup. Cap6
rows (30MiB) globally,3 per complete scope (15MiB). Removed rows may be purged only
under a separate reviewed retention policy; premature removal defeats stable IDs.

Upload commits source_digest in a separate authorized claim transaction BEFORE
external I/O. Then row lock serializes upload/remove/cleanup. Only normalized
JPEG reaches upload(upsert:false). If response is lost or object already exists,
download and SHA256-compare exact normalized bytes before accepting recovery.
Different original bytes cannot replace a claimed identity even if normalization
would yield the same JPEG. Final available/digests/metadata commit occurs after
storage success, current authorization and expiry recheck. Failure leaves the
original prepared reservation/path/digest for retry or cleanup. No new ID retry.

SQL and Storage are not one atomic system. Cancellation after upload dispatch or
commit-result loss is uncertain; a private object may exist behind a prepared
reservation. No success is reported without observed ledger commit. Late expiry
or revoked authorization also leaves an object eligible for cleanup. No attempt
to roll back external storage by pretending SQL rollback removed it.

## Existing transport shape / explicit delta

operation(scope,raw,signal) accepts existing attachment.prepare/status/remove
shapes; prepare optionally adds requestId. attachment.read adds an authorized
60-second-maximum signed read URL bounded by remaining row TTL, checked again
after signing. upload(scope+conversationId+attachmentId,token,bytes,signal) accepts
existing normalized backend upload boundary. scope is SERVER-authorized identity,
not raw request JSON. Result preserves version/attachment/metadata/state/uploadToken
fields, changes storage to private_storage, keeps analysis=not_connected and adds
uncertain/expired/idempotency_conflict errors and optional read{url,expiresIn}.
No public contract union or app route is changed until AG1 integration review.
Signed URLs are bearer capabilities until expiry; deletion removes the object,
but this is not a claim of immediate revocation of already downloaded bytes.

cleanup(signal) is an internal bounded janitor, never a client operation. It
locks <=10 expired nonremoved rows with SKIP LOCKED, removes exact paths using
Storage API, and only then commits removed metadata. Retry is idempotent. On
partial storage deletion or unknown SQL commit it returns ok:false/removed:0
(confirmed count), keeps ledger work available for retry and never releases quota
silently. AG1 must wire bounded cleanup before considering retention operational;
this slice does not install a cron or claim abandoned objects are already swept.

## Verification and limits

Six tests: SDK fetch-double with real Sharp/SDK normalization+EXIF stripping,
immutable retry, signed-read bounds, private/loopback/config checks, AbortSignal
propagation+post-upload cleanup; concrete SQL lifecycle double verifies stable
prepare/hash-only token, scope collision, revocation, committed source identity,
failed finalize orphan retention, retry, reviewed removal and cleanup failure.
These prove implementation paths with doubles, not real Storage availability,
cross-device persistence, actual RLS, cleanup scheduling or production upload.
AG1/AG4 isolated tests must exercise simultaneous upload/remove, process restart,
lost commit, expiry, revocation, signed URL origin/lifetime, bucket privacy/RLS,
unknown upload/delete outcomes, source mismatch, quota and final object cleanup.

Documentation verified 2026-09-07: Supabase changelog index and current primary
Storage access-control, upload and signed URL docs; no root/CLI upgrade performed.
https://supabase.com/docs/guides/storage/security/access-control
https://supabase.com/docs/reference/javascript/file-buckets-upload
https://supabase.com/docs/reference/javascript/file-buckets-createsignedurl

Availability recovery hardening: available status, prepare replay and upload
replay now verify the private object's SHA256 against normalized_digest before
reporting availability. If object deletion succeeded but SQL removal rolled back,
status returns uncertain rather than a false available result; retrying reviewed
removal finishes the ledger transition. This conservative verification downloads
at most5MiB per check. Signed reads reserve a two-second margin before remaining
TTL and recheck after signing, avoiding clock-floor boundary failures without
extending retention. Eight focused tests now include this delete/commit failure
and the signing clock-second boundary. Actual storage/SQL proof is still pending.
