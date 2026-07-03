# Perf Overhaul + Command Center Rebuild — Ship Runbook (2026-07-03)

Trigger: Nik + Michael reported the app "slow in loading times, home page slow af";
operator requested a mega overhaul of the super command center (rich info, filters,
no emojis, AI cost + user tracking).

## Shipped (PRs #40, #41, #42 → main → prod)

### Perf (#40)
Root causes found (in order of impact):
1. **Invisible below-fold landing** — framer-motion `initial={{opacity:0}} whileInView`
   on every landing section meant the prerendered HTML arrived with hidden content
   that stayed blank until ~381KB (brotli) of JS downloaded + hydrated. On mobile
   this reads as "the page is broken/slow". Replaced with CSS scroll-driven reveals
   (`animation-timeline: view()` behind `@supports`, visible fallback elsewhere).
2. **304KB of dictionaries in every page bundle** — `lib/i18n.tsx` statically imported
   all 5 overlay locales (fr/de/it/pt/nl). Now lazy `import()` on first language
   switch; dictionary chunk 80KB→29KB gz. Core en/es/el stay inline (compiler-enforced
   coverage).
3. **framer-motion in the global provider tree** — Toast + ThemeMode imported it
   (~42KB gz on literally every page) for a slide-in and an icon swap. Now CSS
   (`.toast-in`, `.toast-bar`, `.theme-icon-in` in globals.css).
4. **Auth round-trip for anonymous visitors** — middleware called
   `supabase.auth.getUser()` even with no `sb-` cookie present. Now skipped
   (protected paths still fail closed).
5. **Dashboard query waterfall** — 5 sequential Supabase queries after the first
   batch (notes → plan → intake → checkin → all-checkins). Now one parallel batch;
   3 round trips total.
6. `optimizePackageImports: ['framer-motion', 'lucide-react']` in next.config.

**Measured (prod)**: landing first-load JS 390,701 → 285,280 bytes brotli (−27%);
TTFB ~0.35s (unchanged, was never the problem); content paints pre-hydration.

### Command Center (#40 + #42)
`/super` rebuilt as **Trophē Operations** — 6 sections, no emojis, dense mono
metrics, pure CSS/SVG charts (zero chart deps):
- **Overview**: health strip (spend today/30d, error rate 24h, AI p95, active
  clients, logs today), activity grid, 14d log-volume columns, people, spend by
  task, recent failures with real error text.
- **Costs**: window 24h/7d/30d/90d/all × groupBy model/provider/task/user/status ×
  provider/model/task selects; daily spend chart; cache-hit + failure + fallback
  rates; latency p50/p95/p99; top-10 expensive runs.
- **Users**: full roster (auth.users ⋈ profiles ⋈ activity ⋈ spend) — sign-in
  recency, logs 30d/total, AI runs+cost 30d, messages, workouts; role + activity
  filters; sortable columns; click-through per-user drawer (recent logs, spend by
  task, recent runs).
- **Runs**: paginated agent_runs feed (50/page), status/task/model/window filters,
  expandable full error messages + fallback chains.
- **Data**: foods by source with embedding coverage.
- **Audit**: first-ever read surface for `audit_log` (existed since W5, never had a
  viewer) + GDPR `data_requests` queue + corrections-flywheel counter + external
  links (Vercel/Supabase/GitHub).
- Customization: active tab, refresh cadence (manual/30s/60s/5m), cost window —
  persisted in localStorage.

New APIs (all `requireSuperAdmin()`): `/api/super/costs`, `/api/super/users`
(+`?userId=` drill-down), `/api/super/runs`, `/api/super/audit`; overview extended
with p95 latency, logsByDay, facets.

### Drive-by fixes (#41) — pre-existing, surfaced by the QA walk
- `/coach` habits batch-assign 400'd **silently for months**: queried nonexistent
  `habits.is_active` (correct: `is_template`). The available-habits list was
  always empty.
- `/coach` React #418 on every load: `weekLabel` baked the build-time UTC week
  into prerendered HTML; client recomputed with local today. Now client-only.

## Verification
- tsc + eslint (0 errors) + build green; CI green on all 3 PRs.
- vitest 453 pass; 4 fails = pre-existing local stale-DB-password (28P01) in
  food-parse accuracy tests (green in CI).
- Live authed probes (scripts/debug/probe-super-cc.ts, probe-routes-errors.ts):
  all 6 CC tabs + all 8 app routes → 0 console errors, 0 failed requests
  (post-#41; before it, /coach carried the two pre-existing errors).
- Column names in new SQL verified against live information_schema BEFORE ship —
  caught `messages.sender_id`→`client_id` and `workout_sessions.client_id`→`user_id`.

## Pitfalls (self-teaching)
- PITFALL: framer-motion `whileInView` on prerendered marketing pages = content
  invisible until full hydration. Use CSS `animation-timeline: view()` +
  `@supports` fallback.
- PITFALL: static locale imports in a root provider ship every language to every
  visitor. Lazy-import overlays; keep compiler-enforced core inline.
- PITFALL: hand-written SQL column names can't be typechecked — probe
  information_schema against prod before shipping new admin queries.
- PITFALL: client components with `new Date()`-derived TEXT rendered
  unconditionally = guaranteed hydration mismatch on static prerender (build-time
  UTC vs client-local). Compute date labels in useEffect.

## Follow-ups (not blocking)
- Remaining landing weight: react-dom (63KB), Next runtime (62KB), supabase-js
  (51KB), polyfills (39KB) gz — structural; would need a providers-free marketing
  route group. Diminishing returns.
- Audit log has 0 rows — writes only come from coach-edit/GDPR paths so far;
  wire more mutations through recordAuditEvent as WP5 work.
- organization_ai_budgets (daily/monthly limits + kill switch) exists but is not
  yet surfaced in the CC Costs tab — natural WP4/WP6 addition.
