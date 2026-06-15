# WP1 part 2 — route wiring requirements (binding)

Part 1 (the reservation state machine + recovery worker) is done on this branch. These
are the invariants the **signup / client-activation route refactors (part 2)** must
satisfy. They are enforcement points the worker depends on but cannot implement itself.

## 1. Tag every created Auth user with `app_metadata.reservation_id`

The recovery worker's deletion authority is `app_metadata.reservation_id` (service-role
write-only; see `lib/auth/auth-admin.ts`). The route MUST create the Auth user with it:

```ts
await service.auth.admin.createUser({
  email, password,
  email_confirm: false,                 // unconfirmed until finalize — see §2
  ban_duration: '876000h',              // BANNED until finalize lifts it — see §2 (never 'none' here)
  app_metadata: { reservation_id },     // NOT user_metadata (user-editable)
  user_metadata: { full_name },
});
```

An Auth user created without this tag is invisible to recovery and will be stranded.

## 2. Prevent pre-finalization login (deleted ≠ revoked)

Supabase does **not** invalidate already-issued JWTs when a user is deleted
([docs](https://supabase.com/docs/guides/auth/managing-user-data)). A user created with
`email_confirm: true` could obtain a session **before** `finalize_*` runs (or after the
reservation is cancelled but before recovery deletes them). Deletion alone is therefore
not sufficient access control.

Required: a freshly-created-but-not-yet-finalized user MUST NOT be able to authenticate.
Create the user **banned and/or unconfirmed**, then lift the restriction only inside the
success path, after `finalize_*` returns true:

```ts
// create: email_confirm:false AND ban_duration:'876000h' (effectively until lifted)
// on finalize success: service.auth.admin.updateUserById(userId, { ban_duration: 'none', email_confirm: true })
```

This closes the window where a half-created account is both loginable and recoverable.

**Enable-after-finalize failure path (IMPLEMENTED — three layers of self-heal).**
`finalize_*` flips the reservation to `completed` *before* the route unbans the user, so a
failed `updateUserById(unban, confirm)` would otherwise leave a `completed`-but-banned,
permanently-locked-out account. All three mitigations are now in place:

1. **In-request bounded retry** — `buildSignupAuth.enableUser` retries the idempotent
   `updateUserById(unban+confirm)` up to 3× with short backoff before giving up.
2. **No false success** — on exhausted retries `runReservedSignup` returns
   `{ ok:false, reason:'enable_failed' }` (HTTP 500), never a 200 over a banned account;
   and the `replayed_completed` branch **re-asserts** enable, so the user's natural retry
   heals the limbo.
3. **Worker self-heal** — the recovery completed-stray pass (`sweepCompletedStrays`) calls
   `ensureEnabled(keepUserId)` (idempotent unban+confirm) before sealing, and **refuses to
   seal** a completed row whose user can't be enabled — so a missed unban is re-enabled on
   a later run instead of stranding a paying customer (surfaced via the run's error count).

## 3. Compensation flow (route owns the synchronous path)

```
claim_* → createUser(tagged, banned) → attach_reservation_user
        → finalize_*  ── true ──→ updateUserById(unban, confirm) → done
                      ── false/throw ──→ deleteUser(userId) → cancel_reservation_for_route(reservation_id, userId)
```

ALL route cancellations MUST go through `cancel_reservation_for_route` (0045) — never the
legacy `release_invite_reservation` / `cancel_attached_reservation` (revoked from
service_role). It arms a tombstone so a *concurrent* request's in-flight `createUser`,
tagged to the same reservation, is reaped even after this request cancels. Forms:

- attached compensation (finalize failed): `cancel_reservation_for_route(reservation_id, userId)` (user must match)
- abort after create, before attach: `deleteUser(userId)` then `cancel_reservation_for_route(reservation_id)` (unattached release)
- abort before create (e.g., consent missing): `cancel_reservation_for_route(reservation_id)` (unattached release)

On a route crash before compensation, the reservation stays `reserved`; recovery leases
it, reconciles the (still-banned) Auth user, and frees the slot. The part-1 tombstone
(0044/0045) additionally reaps an Auth user whose `createUser` lands **after** a cancel,
and the completed-stray sweep (0046) reaps a stray carrier on a `completed` row.

### 3a. Replay branch — do NOT create a second Auth user

`claim_*` returns `replayed_reserved` / `replayed_completed` when a concurrent or retried
request hit the same reservation. The route MUST handle these:

- `replayed_completed` → the account already exists; return success using `res_user_id`. Do NOT `createUser`.
- `replayed_reserved` with `res_user_id` set → resume: reuse that user (attach is idempotent on the same user), finalize. Do NOT `createUser` a second one.
- `replayed_reserved` with `res_user_id` NULL → another request reserved first but hasn't attached. Safest: fail closed (ask the user to retry) rather than create a competing Auth user; if you do create one, its `attach` will lose the compare-and-set and you MUST delete it + `cancel_reservation_for_route(reservation_id)`.

Creating a second `createUser` on a replay is what produces a stray carrier against a
`completed` row. The DB now backstops this (0046 reaps it), but the route must still avoid
it — a stray that exists for minutes is a banned, loginable-after-unban account in limbo.

## 4. Explicit consent (BLOCKER-03)

`finalize_*` already persists a consent row. The route MUST require an explicit consent
input (`consent: z.literal(true)` + version) and pass `p_consent_version` /
`p_consent_evidence`; never fabricate it. Fail closed if absent.
