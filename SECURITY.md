# Security

Threat model, controls, and guidelines for Trophē v0.3. This is a low-traffic app (5–20 testers now, targeting 100–500 in B2B pilot) handling personal health data.

_Last updated: 2026-05-03_

---

## Threat model (STRIDE-lite)

| Threat | Asset | Likelihood | Impact | Control |
|--------|-------|------------|--------|---------|
| Account takeover | User session | Medium | High (health data exposed) | `@supabase/ssr` HTTP-only cookies + middleware role gate + RLS |
| Cross-client data leak | Other users' food logs, notes | Low | High (GDPR) | Postgres RLS — `auth.uid() = user_id` on every client table |
| Coach sees wrong client | client_profile of non-roster client | Medium | Medium | Coach RLS: `auth.uid() IN (SELECT coach_id FROM client_profiles WHERE user_id = row.user_id)` |
| Role escalation | Accessing /admin or /super routes | Low | Critical | Middleware role gate (server-side, pre-render). `require-role.ts` checks `profiles.role` enum. RLS secondary barrier. |
| Prompt injection via food input | LLM goes off-script | Medium | Low | 500-char cap, control-char strip, LLM output contract enforced by `extract.ts` type-guard |
| Wearable token theft | Spike OAuth tokens | Low | Medium | Tokens stored encrypted via `pgcrypto pgp_sym_encrypt` in `wearable_connections` |
| SQL injection | DB compromise | Low | High | All queries use Drizzle parameterized or Supabase PostgREST parameterized. No raw `ilike` on unsanitized input. |
| Admin bypass | Full DB access | Low | Critical | 4-tier role enum in `profiles.role`. `super_admin` required for `/super/*`; `admin+` for `/admin/*`. Enforced in middleware before render. |
| Secret exfiltration | API keys | Low | High | `.env.local` in `.gitignore`; service role key never `NEXT_PUBLIC_`; `grep` in pre-deploy checklist |
| LLM cost abuse | Anthropic/Gemini bill | Medium | Low ($) | `guardAiRoute` rate limiter (20 req/60s auth, 5 req/60s anon); Langfuse cost tracking per trace |
| XSS via user content | Session hijack | Low | High | React auto-escapes; CSP header; no `dangerouslySetInnerHTML` except hardcoded pre-paint theme script |
| Clickjacking | Phishing | Low | Medium | `X-Frame-Options: DENY`, `frame-ancestors 'none'` in CSP |
| Memory poisoning | Agent reads false facts | Low | Medium | `memory_chunks` RLS — `user_id = auth.uid()`; coach block writes verified by coach JWT |

---

## Controls

### Authentication (v0.3)

- **`@supabase/ssr`** replaces localStorage sessions. Tokens live in HTTP-only cookies — inaccessible to JavaScript, readable by server middleware.
- **`proxy.ts` (Next.js middleware)** runs before every request. Creates a server Supabase client from `request.cookies`, calls `getUser()` (not `getSession()` — re-validates against auth server), enforces role routing:
  - `/coach/*` → role ∈ `{coach, admin, super_admin}` required
  - `/admin/*` → role ∈ `{admin, super_admin}` required
  - `/super/*` → role = `super_admin` required
  - `/api/admin/*` and `/api/seed/*` → authenticated privileged session required
  - Unauthenticated or wrong role → 302 to `/login` or `/dashboard`
- **`lib/auth/require-role.ts`** — callable from server components and route handlers for double-checking inside a route.
- **Auth methods**: email+password (default) + magic link (`/auth/login/magic-link`). Sign-in-with-Apple/Google wired but OAuth client provisioning is operator-gated.
- **Admin gate**: admin access uses `profiles.role = 'admin'|'super_admin'` plus organization membership where applicable. No hardcoded emails.

### Authorization (RLS)

Every client-accessed table has Row-Level Security enabled. Examples:

```sql
-- Users see only their own food log
CREATE POLICY "Users access own food_log"
  ON food_log FOR ALL USING (auth.uid() = user_id);

-- Coaches see only their assigned clients
CREATE POLICY "Coaches access roster food_log"
  ON food_log FOR SELECT
  USING (auth.uid() IN (
    SELECT coach_id FROM client_profiles WHERE user_id = food_log.user_id
  ));

-- Memory chunks: scope-isolated, user-owned
CREATE POLICY "Users access own memory_chunks"
  ON memory_chunks FOR ALL USING (user_id = auth.uid());
```

CI gate: `tests/db/rls.test.ts` runs on every PR. Uses `SET LOCAL "request.jwt.claims"` to impersonate each role tier and asserts correct row visibility.

### Input sanitization (AI routes)

All `/api/food/*` and `/api/meals/*` routes:
- Cap input length (food-parse 500 chars, recipe-analyze 4000)
- Strip control chars: `replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')`
- System prompt has explicit output contract; `extract.ts` validates JSON shape with type-guard before returning
- **v0.3**: LLM never emits macro numbers — all nutrition values come from `foods` table. Eliminates a class of injection where crafted input inflates macros.

### Wearable token security

`wearable_connections` stores Spike OAuth tokens encrypted at rest:
```sql
access_token_encrypted bytea — pgcrypto pgp_sym_encrypt(token, app_secret)
```
Tokens are decrypted server-side only when making Spike API calls. Never serialized to client JSON.
Webhook endpoint (`/api/integrations/spike/webhook`) verifies HMAC signature before processing any payload.

### Rate limiting

`lib/api-guard.ts` → `guardAiRoute(req)`:
- Requires a verified Supabase user from bearer token or cookie session
- 60 req / 15 min per authenticated user
- Returns 401, 429, or user-safe typed errors with `Retry-After` when limited

### Transport + headers

`next.config.ts` emits on every response:
- `Content-Security-Policy` — explicit Supabase domain, Anthropic, Gemini, Google Fonts. `unsafe-inline` retained for Framer Motion style attributes (tracked below).
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(self)`

### Secrets management

- `.env.local` in `.gitignore`
- `.env.local.example` committed (names only, no values)
- Pre-deploy check: `git diff --staged | grep -E '(sk-ant-|sbp_|AIza|key=)'` → must be empty
- Service role key: server-only (no `NEXT_PUBLIC_` prefix)
- Vercel env vars: `SUPABASE_SERVICE_ROLE_KEY` is server-only and Production-scoped; `NEXT_PUBLIC_*` vars are safe public anon URL/key values.
- Rotation: quarterly or after suspected compromise

### Audit trail

`audit_log` table (v0.3 Phase 1): append-only log of sensitive mutations (client_profile updates, habit reassignment, coach_notes creation, role changes). Written via Drizzle in service-role context — bypasses RLS write but is itself RLS-read-protected.

---

## Data classification

| Data | Classification | Where | Retention |
|------|----------------|-------|-----------|
| User email, hashed password | PII | `auth.users` | Life of account |
| Body stats (weight, height, age, sex) | PII / Health | `client_profiles` | Life of account; export on request (GDPR) |
| Food log | Health | `food_log` | Life of account |
| Habit check-ins | Behavioral | `habit_checkins` | Life of account |
| Coach notes about clients | PII / Sensitive | `coach_notes` | Coach-deletable, client cannot read |
| Memory chunks | Behavioral / PII | `memory_chunks` | 365d (user scope), 30d (session scope), indefinite (agent scope until cleared) |
| Wearable data | Health | `wearable_data` | Life of connection; deletable via settings |
| API usage log (tokens, cost, endpoint) | Operational | `api_usage_log` | 90 days |
| Form Check video | — | Not stored; all processing in-browser (MediaPipe WASM) | — |
| Langfuse traces | Operational | Configured `LANGFUSE_HOST` endpoint | 30 days |

---

## Incident response

See `RUNBOOK.md` for operational playbooks. For security incidents:

1. **Containment**: rotate affected key (Anthropic / Supabase / Spike) via each provider's dashboard; if session compromise suspected, invalidate all sessions via Supabase Auth dashboard
2. **Assessment**: pull `audit_log` + `api_usage_log` + Vercel function logs for the affected window
3. **Notification**: if user data exposed, notify affected users + Michael (co-business) within 72 hours (GDPR baseline)
4. **Post-mortem**: document in `docs/incidents/YYYY-MM-DD-summary.md`; capture as OpenBrain `PITFALL:` entry

---

## Known residual risks

| Risk | Status | Mitigation |
|------|--------|------------|
| `unsafe-inline` in CSP | Open | Needed for Framer Motion inline styles. Nonce-based CSP deferred to v1.0. |
| No brute-force protection beyond Supabase defaults | Open | Free tier: 5 signins/5 min/IP. Adequate for ≤20 users; revisit at 100+. |
| No per-user rate limiting (in-memory map resets on deploy) | Open | Upstash-based persistent rate limiting deferred to v1.0. |
| Wearable token encryption uses symmetric key (pgcrypto) | Open | KMS-style envelope encryption deferred to v1.0. Symmetric key is `SUPABASE_SERVICE_ROLE_KEY` — server-only. |
| Vercel preview env vars | Note | `NEXT_PUBLIC_*` keys are visible in preview deploys. Acceptable for anon-key + public URL. Service role key is Production-only. |

## Completed (was v0.2 scheduled work)

- ✅ Migrated to `@supabase/ssr` — server-side middleware auth with HTTP-only cookies (Phase 2)
- ✅ Email allowlist admin gates replaced with canonical role guards and invariant tests
- ✅ Middleware now enforces role gates server-side before any page render (Phase 2)
- ✅ `audit_log` table + Drizzle writes on sensitive mutations (Phase 1)
- ✅ RLS test suite in CI (`tests/db/rls.test.ts`) (Phase 1)
- ⬜ Nonce-based CSP — deferred v1.0
- ⬜ Upstash rate limiting — deferred v1.0
- ⬜ Supabase Pro (PITR) — deferred v1.0
