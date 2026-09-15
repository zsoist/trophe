# Trophē Coach Everywhere v1 — continuity and evidence register

Updated: 2026-09-14

This is the AGG/AG5 continuity record for the Coach Everywhere mandate. It is
an evidence index, not an activation switch. A capability is only called
**active** when the current target environment, authenticated identity and
the corresponding server-side gate are all proven together.

## Current release

- Branch: `codex/ag1-hotfix-ask-workout`
- Runtime changes represented in the latest production deployment: `d438b4cb`
  (`fix(workout): guard atlas observer fallbacks`), including food recovery
  (`e5bf3b33`),
  Ask panel close lifecycle (`fdb98b62`),
  memory receipt-content verification (`b965be61`), meal-planning intent
  routing (`698da756`), AG2 attachment zoom and launcher/Atlas interaction
  polish (`438ec058`, `92843904`, `341a84d4`), the reflexive Spanish intent
  fix (`77e2df9f`), the bounded time-prefixed Spanish intake fast path
  (`b4bb5b17`) and the neutral Workout empty state (`8ab66da4`)
- Production alias: `https://trophe.app`
- Latest runtime production deployment: `dpl_9tQPS2ppdTAXu7ei8VDMvZgG7L2L`
- Preview/deployment URL: `https://trophe-as0ehavhg-2p6y54z6w9-4465s-projects.vercel.app`
- Health canary: HTTP 200, database connected; no production 5xx logs in the
  post-deploy window
- Release verification: focused Ask/Food/Workout suites **107 files, 989
  tests passed, 2 skipped**, typecheck and remote Vercel build passed. The
  repository-wide verification still has one intentionally isolated PostgreSQL
  suite that cannot run without a local database; it is not claimed as passed.
- Full repository ESLint exits with code 0; it reports 77 existing warnings
  (mostly React effect set-state guidance and intentionally unused test-fake
  parameters), with no new lint errors from the release.
- Post-deploy route checks: `/api/health` returned 200 with `db: connected`,
  `/api/coach-assistant` returned the expected unauthenticated `available:false`,
  `/api/food/parse` rejected an unauthenticated POST with 401, protected
  dashboard/coach routes redirected to login, and the production 5xx log query
  returned no entries.
- Food resilience: an admitted-provider failure now attempts the same
  deterministic catalogue resolver as the denied-pilot path; a recognized
  meal returns without retry or paid fallback, while unknown food keeps the
  stable error response. Covered by the production-route test and the local
  branded-meal suite.
- Atlas resilience: `AtlasCanvas` now treats viewport observers as progressive
  enhancements and uses a window-resize fallback when `ResizeObserver` is not
  available; `IntersectionObserver` absence no longer crashes rendering. The
  premium Atlas release and its activation gate remain HOLD.
- Final independent DS4 recheck: **21 files, 245 tests passed** across advice,
  Food/Search and voice lifecycle, with no paid calls. This is a narrower
  repeat of the recorded focused run above; it does not replace the required
  authenticated production smoke.
- Latest DS follow-up checks: AG2 attachment zoom **6/6** plus panel lifecycle
  coverage (global coach suite and attachment suite **27/27**), AG3
  intent-routing **61/61** plus memory receipt verification **11/11**,
  AG2 Atlas observer contract **13/13**, TypeScript, ESLint focal and diff
  checks passed; no paid calls.
- Production environment inventory was rechecked read-only: the cohort
  allowlist variable exists, while the private history/action/reviewed-voice
  and attachment flags are not present. The variable's secret value and the
  current authenticated subject were not inferred, so no active-user claim is
  made from this inventory alone.
- Route coverage contract `05193d9e` now enumerates the dashboard, workout and
  coach layouts and prevents a future route from bypassing its single Coach
  entry point; its two tests pass.
- An authenticated smoke was attempted without exposing credentials: both
  local QA/super account records returned Supabase `401`, so Ask/Food/Workout
  production behavior remains unverified for a real identity.
- Independent AG4 release recheck confirms `dpl_9tQPS2ppdTAXu7ei8VDMvZgG7L2L`
  is READY and safe for anonymous canary/fail-closed behavior, while the full
  Coach Everywhere and premium Atlas activation remain NOT READY under the
  explicit HOLD boundaries below.

## Capability matrix

| Capability | Current evidence | State | Boundary / next proof |
| --- | --- | --- | --- |
| Global Ask mount across dashboard surfaces | `components/shared/ClientShell.tsx`, `app/dashboard/workout/layout.tsx`, `components/assistant/GlobalCoach.tsx` | Integrated | Authenticated route-by-route smoke still required |
| Profile-grounded conversation | `agents/coach-assistant/context.ts`, `conversation.ts`, `open-conversation.ts`; advice/context tests | Offline-tested / integrated | Live authorized-records smoke required |
| Controlled memory read/change | `memory-*` contracts/services, proposal/version/receipt tests | Offline-tested / HTTP contract | Production migrations and memory gate remain HOLD |
| Food read and canonical macros | `agents/food-parse/index.v4.ts`, canonical lookup, local fast path | API route integrated; local path active | Full Ask text-food actions require held schema/flags |
| Natural branded meal input | `local-fast-path.ts`, `text-food-intent.ts`; branded, reflexive and time-prefixed Spanish intake tests | Active in production deploy | Unknown catalogue entries intentionally fail closed |
| Food proposal/apply/receipt/refetch | `text-food-service.ts`, `food-service.ts`, `TextFoodReview.tsx` | Offline-tested / preview evidence | Production `0087–0090` contract and flags remain HOLD |
| Voice capture/transcript/live audio | `components/assistant/LiveVoiceControl.tsx`, `lib/voice-live`, lifecycle tests | Integrated / offline-tested | Authenticated production live and reviewed-voice smoke required |
| Images/private analysis | attachment and photo-food services plus UI contracts | Offline-tested / gated | Private bucket, signing key, schema and production flag remain HOLD |
| Workout manual flow | `WorkoutWorkspaceProvider`, `WorkoutHome`, builder/review/live routes; `NOT_FOUND` recommendation now stays a neutral empty state | Integrated / tested | Authenticated production smoke required |
| Muscle Atlas premium release | `contracts/anatomy/releases.json` (`active: null`) | HOLD | Do not activate until asset provenance, mapping, security, device and AG2/AG4 evidence exist |
| Parallel nutrition search | `lib/food/nutrition-search*.ts`, bounded fast-mode tests | Integrated / offline-tested | Production key and authorized search smoke are separate from model budget |
| Tenant / client isolation | repository authorization, RLS/HTTP holdouts and QA evidence | Offline-tested / QA HTTP evidence | No production claim without a real authenticated identity |
| Desktop/mobile presentation | responsive Ask/workout CSS and component tests | Integrated / structural tests | Physical-device frame-rate and visual canary still missing |

## Ten iteration gates

1. **Mounting:** global Ask is mounted once per eligible shell and workout has
   one contextual entry. Evidence: route/layout source and component tests.
2. **Identity:** every request derives actor/subject from the authenticated
   server guard. Evidence: handler/repository authorization tests.
3. **Context:** profile, targets, registered totals and bounded history are
   injected only from authorized records. Evidence: advice-context tests and
   `open-conversation.ts` grounding branch.
4. **Intent:** `log`, `advise`, `analyze` and `chat` are classified before food
   parsing. Evidence: `nutrition-intent` tests.
5. **Food:** deterministic catalogue hits remain usable when the model pilot is
   unavailable; proposals still require review and canonical writer receipts.
   Evidence: parser/API/food-service suites and this release's production fix.
6. **Voice:** microphone permission, interruption, mute, deadline and transcript
   lifecycle are bounded; no fake levels or hidden retries. Evidence:
   `tests/voice-live` and lifecycle modules.
7. **Images:** upload, analysis and removal stay private, scoped and reviewable.
   Evidence: attachment/photo contracts; production remains gated.
8. **Workout:** manual build/start/log survives failed recommendations and old
   preference schemas. Evidence: workout data-flow and router compatibility
   tests.
9. **Atlas/media:** assets require a release manifest, hash, provenance,
   mapping, security and representative-device performance. Evidence currently
   says HOLD; no active release is claimed.
10. **Release:** exact-head build, canary health, authenticated smoke, error
    logs and rollback evidence are required before an activation claim. Current
    unauthenticated canaries pass; authenticated and physical-device proof are
    still outstanding.

## Agent and spend boundary

- AG1 owns integration and release; AG2 owns visual/media review; AG3 is the
  runtime/server reserve; AG4 performs independent risk review. DS1–DS4
  artifacts are retained under `/Volumes/SSD/TROPHE_DS_WORKERS` and only
  verified patches are integrated.
- New DeepSeek rounds ending in `transport_uncertain`/`BrokenPipeError` are not
  completion evidence. No new paid provider call is claimed here.
- Product and worker budgets are distinct. This register never authorizes a
  budget increase, migration, secret, or production flag.

## Explicit HOLDs

Keep BD-02/PR124, migrations `0082–0085` and the later private Coach contracts,
Atlas/media publication and universal production rollout under HOLD. The
production URL is healthy, but that health check does not certify the gated
capabilities above.
