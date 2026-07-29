# Nick Food Experience — Zero-Spend Quality Handoff

Date: 2026-07-29  
Branch: `codex/trophe-10x-quality`  
Scope: food parsing, nutrition review/logging, photo/manual boundaries, local DB lookup, performance, and zero-spend AI contracts.

## Release evidence

- Bounded release verifier: **passed**
  - typecheck: passed
  - full lint: passed
  - unit/integration suite: 932 passed, 33 intentionally skipped
  - production build: passed
- Deterministic food lookup gate: **43/43 coverage (100%) and 43/43 accuracy (100%)**
  - required coverage: 100%
  - required accuracy: at least 95%
  - missing DB rows are failures; they are no longer removed from the denominator
- Focused food/nutrition regression suite: **198/198 passed**
- Offline provider contracts: **17/17 passed**
  - production adapters exercised with injected fixture transports
  - provider keys and paid-tool approval forcibly blanked
  - live transport attempts: 0
- Authenticated local browser matrix: **22/22 passed**
  - Chromium mobile and desktop projects
  - client, coach, and super-admin role journeys
  - parser rate-limit, timeout, malformed-payload, editable-review, and manual-validation states
  - settings, language/units, stable loading, safe destination handling, and logout
  - three random disposable local users created for the run and removed afterward
  - independent database check after the run: 0 matching auth users and 0 matching profiles
  - Supabase API and database targets are guarded as loopback-only; paid-provider keys and approval are forcibly blanked
- DB read-only verification: schema, RLS policies, functions, vector columns, audit immutability, and required indexes passed.
- Query-plan check:
  - food full-text lookup uses `idx_foods_search_text`
  - memory lookup uses `idx_mc_user_scope_active`
  - wearable lookup uses `idx_wd_user_type_recorded`
  - tiny local `food_log` and organization fixture tables use cheaper sequential scans; their production indexes are present
- Public local-search hardening:
  - malformed limits fall back safely; valid limits are clamped to 1–50
  - database failures return stable public copy without raw database details
  - migration `0060_food_database_trigram_search` adds GIN trigram indexes for English, Greek, and Spanish substring search
  - a rolled-back 50,000-row local simulation used a `BitmapOr` across all three indexes and completed in about 3 ms
  - the simulation left 0 probe rows
- Bundle budgets: `/` and `/login` passed.

## Product changes Nick should notice

- Greek accented lookup works for `φέτα`, `ελαιόλαδο`, and `κοτόπουλο στήθος`.
- The deterministic local/CI catalog covers the complete 43-case golden set, including Colombian, Mediterranean, fitness, and edge-case portions.
- Nutrition calculations keep two-decimal precision at the lookup boundary, preventing small macros from being hidden by early rounding.
- Parser results fail closed when values are missing, non-finite, negative, implausible, out of bounds, or from an unknown source.
- A partial dish decomposition now keeps its category-default provenance and computed confidence after caching; cache hits can no longer turn a mostly guessed recipe into a 0.75-confidence `local_db` result.
- Decomposition confidence is monotonic at the 50% ingredient-match boundary instead of scoring 50% coverage below 40% coverage.
- Common piece weights use whole normalized food tokens: short names such as `ham` and `pea` can no longer inherit `hamburger` or `peach` weights, while real matches such as `butter croissant` and `souvlaki chicken pita` still resolve.
- Composite-dish ingredient lookups run through the order-preserving parallel batch API instead of one database round-trip at a time.
- Edited portions are capped and validated again before the food-log insert.
- Manual entry rejects invalid calories/macros before writing and now displays the validation error in the manual-entry view.
- Photo analysis drops malformed or implausible items, caps confidence, and preserves an uncertainty note.
- Food text, ingredient names, provider messages, stacks, and nested errors are no longer written to server logs.
- Public landing/login delivery and coach analytics loading are lighter; recorded performance evidence is in `docs/quality/performance-final-2026-07-29.md`.

## Nick acceptance checklist

Use a non-production client tester account on the release candidate.

1. Open `/dashboard/log`, choose a meal, and confirm the food input is immediately usable on desktop and mobile.
2. Exercise text review with:
   - `100g feta cheese`
   - `1 tbsp olive oil`
   - `1 cup black beans`
   - `1 rice cake`
   - `φέτα`
   - `ελαιόλαδο`
   - `κοτόπουλο στήθος`
3. Confirm every result shows a recognizable name, portion, macros, and provenance; no item should jump directly into the log without review.
4. Change a 100 g portion to 150 g. The displayed macros should scale immediately and the save action should remain available.
5. Remove one item from a multi-item meal and confirm totals update.
6. Submit an ambiguous serving and answer the clarification question. The original text must remain recoverable on cancel.
7. Try manual entry:
   - valid: 300 kcal, 20 g protein, 35 g carbs, 9 g fat
   - invalid: -1 kcal, `Infinity`, negative macros, and an overlong name
   - only the valid entry may reach save
8. Try a clear food photo and a deliberately unclear photo. Results must be labeled as estimates with uncertainty; an unreliable response must suggest a clearer photo or manual entry.
9. Trigger Retry after a parser error. A failed photo must never be silently resubmitted after switching to text.
10. Confirm the success state returns to the meal and the logged row is editable/undoable where the flow provides an inserted row ID.

The authenticated local matrix can be repeated with `npm run test:e2e:local-auth`. The harness refuses non-loopback Supabase API or database targets, creates random disposable client/coach/admin identities, runs the three authenticated browser specs sequentially, blanks paid-provider capabilities, and removes the identities even if the browser run fails. It does not require persistent tester credentials.

## Explicit limits

- No live AI/provider call was made. Real-model quality and live photo latency were not measured in this zero-spend run.
- No production database was read or changed.
- Migration `0060_food_database_trigram_search` was applied and profiled only on loopback Supabase; production application remains an operator action.
- The formal security plan requires a separate protected control-plane repository, signed broker/controller release, protected host identity, required GitHub App check, and Podman-based attestation. Those external prerequisites are not installed on this workstation, so no formal protected-lane attestation is claimed.
- Production deployment, merge, and external writes remain operator actions.
