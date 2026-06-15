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
  email_confirm: false,                 // see §2
  ban_duration: 'none',                 // set a ban until finalized — see §2
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

## 3. Compensation flow (route owns the synchronous path)

```
claim_* → createUser(tagged, banned) → attach_reservation_user
        → finalize_*  ── true ──→ updateUserById(unban, confirm) → done
                      ── false/throw ──→ deleteUser(userId) → cancel_attached_reservation
```

On a route crash before compensation, the reservation stays `reserved`; recovery leases
it, reconciles the (still-banned) Auth user, and frees the slot. The part-1 tombstone
(0044) additionally reaps an Auth user whose `createUser` lands **after** a cancel.

## 4. Explicit consent (BLOCKER-03)

`finalize_*` already persists a consent row. The route MUST require an explicit consent
input (`consent: z.literal(true)` + version) and pass `p_consent_version` /
`p_consent_evidence`; never fabricate it. Fail closed if absent.
