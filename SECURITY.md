# Security

Threat model, controls, and guidelines for Trophē. This is a low-traffic app (10-20 users during testing, targeting 100-500 in B2B pilot) handling health data. Controls sized accordingly.

## Threat model (STRIDE-lite)

| Threat | Asset | Likelihood | Impact | Control |
|---|---|---|---|---|
| Account takeover | User session | Medium | High (client health data exposed) | Supabase Auth + RLS + rate-limited AI routes |
| Cross-client data leak | Other users' food logs, notes | Low | High (GDPR) | Postgres RLS policies — `auth.uid() = user_id` on every client table |
| Coach sees wrong client | client_profile of non-roster client | Medium | Medium | Coach RLS: `auth.uid() IN (SELECT coach_id FROM client_profiles WHERE user_id = row.user_id)` |
| Prompt injection via food input | LLM goes off-script | Medium | Low (read-only LLM output) | Input sanitization: 500-char cap, control-char strip, LLM system prompt has explicit output contract |
| SQL injection on search | DB compromise | Low | High | All `ilike` calls use parameterized queries + sanitized input |
| Admin bypass | Full DB access | Low | Critical | Server-side admin guard in `app/admin/layout.tsx` — verifies JWT + email against `TROPHE_ADMIN_EMAILS`, uses service role key |
| Secret exfiltration | API keys | Low | High | `.env.local` in `.gitignore`; service role key only server-side; `grep` in pre-deploy checklist |
| LLM cost abuse | Anthropic bill | Medium | Low ($) | Per-user rate limit via `guardAiRoute`; prompt caching on system prompts |
| XSS via user content | Session hijack | Low | High | React auto-escapes; CSP header; no `dangerouslySetInnerHTML` except for pre-paint theme script (content is hardcoded) |
| Clickjacking | Phishing | Low | Medium | `X-Frame-Options: DENY`, `frame-ancestors 'none'` in CSP |

## Controls

### Authentication
- **Supabase Auth**: email + password, JWT-based, 1-hour access token + 30-day refresh
- **Session storage**: localStorage (Supabase JS v2 default). Means auth cannot be read by server middleware — auth happens client-side on each protected page
- **Admin gate**: `app/admin/layout.tsx` (server component) uses the service role key to verify the Supabase JWT, checks email against `TROPHE_ADMIN_EMAILS`, redirects non-admins to `/dashboard`
- **Role gates**: every `/dashboard/*` page checks `profile.role !== 'client'` client-side; every `/coach/*` page checks `profile.role !== 'coach'` client-side

### Authorization (RLS)
Every client-accessed table has Row-Level Security enabled. Policy examples:

```sql
-- Users see only their own food log
CREATE POLICY "Users access own food_log"
  ON food_log FOR ALL
  USING (auth.uid() = user_id);

-- Coaches see only their clients
CREATE POLICY "Coaches access roster food_log"
  ON food_log FOR SELECT
  USING (auth.uid() IN (
    SELECT coach_id FROM client_profiles WHERE user_id = food_log.user_id
  ));
```

Scheduled v0.2: pgTAP tests in CI to lock in RLS behavior and catch policy regressions.

### Input sanitization (AI routes)
All `/api/food/*` and `/api/meals/*` routes:
- Cap input length (food-parse 500 chars, recipe-analyze 4000)
- Strip control chars: `replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')`
- System prompt has explicit output contract; `extract.ts` validates JSON shape with type-guard before returning

### Rate limiting
`lib/api-guard.ts` → `guardAiRoute(req)`:
- 20 req / 60s for authenticated users
- 5 req / 60s for anonymous (by IP)
- Returns 429 with Retry-After header

Scheduled v0.2: per-user quota via Upstash free tier for more sophisticated limits.

### Transport + headers
`next.config.ts` emits on every response:
- `Content-Security-Policy` — explicit Supabase domain (NOT `*.supabase.co` — breaks mobile), Anthropic, Gemini, Google Fonts. `unsafe-inline` for now (nonce migration scheduled v0.2)
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(self)` (mic allowed for voice-to-food)

### Secrets management
- `.env.local` in `.gitignore`
- `.env.local.example` committed (shows names, no values)
- Pre-deploy: `git diff --staged | grep -E '(sk-ant-|sbp_|AIza|key=)'` → empty
- Service role key: server-only (no `NEXT_PUBLIC_` prefix)
- Vercel env vars: Production scope only for service role key
- Rotation: quarterly or after suspected compromise; Anthropic + Supabase both support key rotation without downtime

## Data classification

| Data | Classification | Where | Retention |
|---|---|---|---|
| User email, hashed password | PII | `auth.users` | Life of account |
| Body stats (weight, height, age, sex) | PII / Health | `client_profiles` | Life of account; export on request (GDPR) |
| Food log | Health | `food_log` | Life of account |
| Habit check-ins | Behavioral | `habit_checkins` | Life of account |
| Coach notes about clients | PII / Sensitive | `coach_notes` | Coach-deletable, client cannot read |
| API usage log (tokens, cost, endpoint) | Operational | `api_usage_log` | 90 days (scheduled v0.2 archive) |
| Form Check videos | — | Not stored; all processing in-browser | — |

## Incident response

See `RUNBOOK.md` for operational playbooks. For security incidents:

1. **Containment**: rotate affected key (Anthropic / Supabase / admin email allowlist) via each provider's dashboard
2. **Assessment**: pull `api_usage_log` + Vercel function logs for the affected window
3. **Notification**: if user data exposed, notify affected users + Michael (as co-business) within 72 hours (GDPR baseline)
4. **Post-mortem**: document in `docs/incidents/YYYY-MM-DD-summary.md`; capture as OpenBrain `PITFALL:` entry

## Known residual risks

- **Pre-v0.2 middleware auth is client-side only**. A malicious client could bypass role gates in their own browser, but RLS at the DB prevents them reading data they shouldn't. Trust boundary = Postgres, not Next.js middleware. Scheduled to migrate to `@supabase/ssr` with cookie-based sessions in Wave D.
- **`unsafe-inline` in CSP**. Needed for Framer Motion + style attributes. Nonce-based CSP scheduled Wave D.
- **No audit trail**. Sensitive mutations (client_profile updates, coach_notes creation, habit reassignment) are not logged. `audit_log` table with triggers scheduled for Wave C.
- **No brute-force protection beyond Supabase defaults**. Free tier allows 5 signins / 5 min per IP. Adequate for 10-20 users; revisit at 100+.

## Scheduled security work (v0.2)

- [ ] Migrate to `@supabase/ssr` → restore server-side middleware auth with cookies
- [ ] Nonce-based CSP (replace `unsafe-inline`)
- [ ] Per-user rate limiting via Upstash (replace in-memory map)
- [ ] `audit_log` table + triggers on sensitive writes
- [ ] pgTAP RLS tests in CI
- [ ] Quarterly dependency audit (`npm audit fix` + Snyk free tier)
- [ ] Supabase Pro ($25/mo): enables PITR — backup/restore is a security control, not just ops
