# WP1 part 2 — route wiring requirements (binding)

Part 1 (the reservation state machine + recovery worker) is done on this branch. These
are the invariants the **signup / client-activation route refactors (part 2)** must
satisfy. They are enforcement points the worker depends on but cannot implement itself.

## 1. Tag every created Auth user with `app_metadata.reservation_id`, created UNCONFIRMED, NO ban

The recovery worker's deletion authority is `app_metadata.reservation_id` (service-role
write-only). The route MUST create the Auth user with it — **email-unconfirmed** (the
pre-finalization hold, §2) and with **NO `ban_duration`** (`ban_duration` is reserved
exclusively for administrative suspension, §2):

```ts
await service.auth.admin.createUser({
  email, password,
  email_confirm: false,               // UNCONFIRMED = the pre-finalization-login hold (§2)
  app_metadata: { reservation_id },    // NOT user_metadata (user-editable); recovery's trusted tag
  user_metadata: { full_name },
  // NO ban_duration — admin suspension owns that field exclusively (§2)
});
```

An Auth user created without this tag is invisible to recovery and will be stranded.

## 2. Email verification is the hold; administrative ban is independent

Two distinct controls, deliberately **not** sharing one mechanism:

- **Pre-finalization-login hold = email-UNCONFIRMED.** With the project's "Confirm email"
  setting ON, Supabase blocks password login until the address is confirmed. The user is
  created unconfirmed; the confirmation email is sent only **after** `finalize_*` commits.
  So a half-created (pre-finalize) account is unconfirmed *and* was never sent a link ⇒
  cannot log in ⇒ reaped by recovery. (Deletion ≠ JWT revocation, so a *ban* was the wrong
  tool: it overloaded the same field admin suspension needs and created a read-update race.)
- **Email-ownership proof.** `sendConfirmation` (Supabase signup confirmation link/OTP) is
  sent after finalize; the route returns **HTTP 202 `verification_required`** ("check your
  email"), NOT an immediate session. The frontend must show that state and not attempt a
  password login. Confirmation completes via Supabase's callback. A replay re-sends.
- **Administrative suspension = `ban_duration`, independent.** Signup NEVER sets, lifts, or
  reads `ban_duration`. There is no `enable`/`unban` step anywhere in the flow, so a replay
  or the recovery worker can never undo an admin/fraud/security ban (no race, no bypass).

> PREVIEW-GATE (must validate on local/preview Supabase before approval): (a) unconfirmed
> users cannot password-login; (b) the confirmation link/OTP is actually delivered for an
> Admin-created user (confirm `resend` vs `admin.generateLink`); (c) the callback enables
> login; (d) replay re-sends without duplicating accounts.
>
> RUN IT (one command — repeatable evidence): `scripts/test/wp1-signup-confirm-e2e.ts`
> asserts all of (a)–(d). Local:
> ```
> supabase start                 # brings up Auth + Mailpit; note the keys/ports from `supabase status`
> # apply migrations 0042–0047 to the local DB; run the app with NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000
> E2E_SUPABASE_ANON_KEY=… E2E_SUPABASE_SERVICE_KEY=… npx tsx scripts/test/wp1-signup-confirm-e2e.ts
> ```
> The harness is LOOPBACK-ONLY by default (it is destructive and Trophē has no isolated
> Supabase preview branch). The Mailpit-based delivery checks (3 + replay-email) are
> therefore LOCAL-ONLY — a hosted SMTP inbox exposes no Mailpit API. To run the non-delivery
> checks (1, 2, 5-dup) against a hosted preview, set `E2E_ALLOW_REMOTE=true` AND
> `E2E_EXPECTED_PROJECT_REF=<ref>` (it aborts on a ref mismatch — never run it at prod);
> delivery (3/4/replay-email) is then SKIPPED+flagged and must be verified MANUALLY (send a
> real signup, confirm the email arrives via your SMTP, click the link). Also confirm
> Confirm-Email is ON + reliable custom SMTP in preview AND production.

## 3. Compensation flow (route owns the synchronous path)

```
claim_* → createUser(tagged, unconfirmed) → attach_reservation_user
        → finalize_*  ── true ──→ sendConfirmation(email) ── sent ──→ 202 verification_required
                      │                                    └─ failed ─→ 503 delivery_failed (retryable; row stays completed)
                      └─ false ──→ resolveFailure: re-read state; completed-with-our-user ⇒
                                   idempotent success; else cancel-FIRST, delete ONLY if proven orphaned
```

ALL route cancellations go through `cancel_reservation_for_route` (0045) — never the legacy
`release_invite_reservation` / `cancel_attached_reservation` (revoked from service_role).
It arms a tombstone so a *concurrent* request's in-flight `createUser` is reaped even after
this request cancels. On any attach/finalize failure the flow re-reads reservation state:
if it is `completed` with **our** user, that is idempotent success (NEVER delete it); only a
user proven orphaned (cancel succeeded, or the row completed under a different user) is
deleted. A crash before compensation leaves the row `reserved`; recovery reaps the
unconfirmed Auth user. Tombstones (0044/0045) reap a late `createUser` after a cancel, and
the completed-stray sweep (0046) reaps a stray carrier on a `completed` row.

### 3a. Replay branch — do NOT create a second Auth user

`claim_*` returns `replayed_reserved` / `replayed_completed` for a concurrent/retried
request on the same reservation:

- `replayed_completed` → the account exists; re-send confirmation, return 202. Do NOT `createUser`.
- `replayed_reserved` with `res_user_id` set → resume that user (attach is idempotent), finalize, send confirmation. Do NOT `createUser` a second one.
- `replayed_reserved` with `res_user_id` NULL → fail closed (ask the user to retry); never create a competing user.

A second `createUser` on a replay would produce a stray carrier against a `completed` row;
the DB backstops it (0046), but the flow avoids it by construction.

## 4. Explicit consent (BLOCKER-03)

`finalize_*` already persists a consent row. The route MUST require an explicit consent
input (`consent: z.literal(true)` + version) and pass `p_consent_version` /
`p_consent_evidence`; never fabricate it. Fail closed if absent.
