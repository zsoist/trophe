# Nik English Nutrition Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a coherent English client home, canonical English food names, grounded Colombian photo review, honest sugar completeness, and a useful zero-cost daily nutrition note for Nik.

**Architecture:** Add pure language, food-name, photo-grounding, and nutrition-summary boundaries, then make the existing React pages and API route consume them. Keep provider use to one vision call, preserve existing schemas and telemetry, and repair Nik's existing profile/meal-plan rows through a reversible operator script only after code verification.

**Tech Stack:** Next.js 16.2.12, React 19, TypeScript strict, Supabase with RLS, Vitest 4, Playwright Chromium, Framer Motion, existing semantic theme tokens, Anthropic photo lane through the governed AI runtime.

**Spec:** `docs/superpowers/specs/2026-08-20-nik-english-nutrition-feedback-design.md`

## Global Constraints

- Node.js 24 is authoritative for local verification.
- No new dependency and no database migration.
- No paid AI calls during implementation, automated tests, build, CI, or canary.
- Exactly one provider call remains in the photo flow when it is used by a real user.
- Preserve existing authentication, RLS, role switching, privacy, food-correction telemetry, and calorie-visibility preferences.
- Do not delete translation dictionaries or historical prompt versions.
- Every production change follows a witnessed red-green test cycle.

---

### Task 1: English beta runtime and clean dashboard header

**Files:**
- Create: `lib/product-language.ts`
- Create: `tests/lib/product-language.test.ts`
- Modify: `lib/i18n.tsx`
- Modify: `app/dashboard/profile/page.tsx`
- Modify: `app/dashboard/page.tsx`
- Test: `tests/components/dashboard-nik-feedback.test.tsx`

**Interfaces:**
- Produces: `ENGLISH_BETA_LANGUAGE: 'en'`
- Produces: `normalizeProductLanguage(candidate: unknown): 'en'`
- Produces: `getEnglishGreeting(hour: number): 'Good morning' | 'Good afternoon' | 'Good evening'`
- The dashboard consumes these interfaces and the existing `AppHeader` theme control.

- [ ] **Step 1: Write the failing language and greeting tests**

```ts
import { expect, it } from 'vitest';
import { getEnglishGreeting, normalizeProductLanguage } from '@/lib/product-language';

it('forces stale Greek and Spanish preferences to English during beta', () => {
  expect(normalizeProductLanguage('el')).toBe('en');
  expect(normalizeProductLanguage('es')).toBe('en');
});

it('uses a plain English afternoon greeting', () => {
  expect(getEnglishGreeting(15)).toBe('Good afternoon');
});
```

- [ ] **Step 2: Run the focused test and witness red**

Run: `npx --yes node@24 node_modules/vitest/vitest.mjs run tests/lib/product-language.test.ts`

Expected: FAIL because `lib/product-language.ts` does not exist.

- [ ] **Step 3: Implement the pure English beta boundary**

```ts
export const ENGLISH_BETA_LANGUAGE = 'en' as const;

export function normalizeProductLanguage(_candidate: unknown): 'en' {
  return ENGLISH_BETA_LANGUAGE;
}

export function getEnglishGreeting(hour: number) {
  if (hour < 12) return 'Good morning' as const;
  if (hour < 18) return 'Good afternoon' as const;
  return 'Good evening' as const;
}
```

- [ ] **Step 4: Enforce the runtime contract and simplify the first page**

In `I18nProvider`, initialize to English, replace stale `trophe_lang` with `en`, set `document.documentElement.lang = 'en'`, and make `setLang` normalize all input to English. In the profile page, replace the active language picker with non-interactive copy: `English beta · More languages return after English is stable` while retaining the dictionaries.

In `app/dashboard/page.tsx`, render one plain line `${getEnglishGreeting(new Date().getHours())}${firstName ? `, ${firstName}` : ''},`, keep the avatar/date/streak and an English `Coach view` action, remove `isLatinText`, the gold serif name, and the dashboard-local theme button/hook. Do not alter `AppHeader`.

- [ ] **Step 5: Add rendered dashboard contract coverage**

Render the extracted greeting/header surface or dashboard with mocked Supabase data and assert exactly one `Good afternoon, Nik,`, no Greek greeting, a named `Coach view` link, and no second theme-toggle button inside the page content.

- [ ] **Step 6: Run focused tests, typecheck, and commit**

Run: `npx --yes node@24 node_modules/vitest/vitest.mjs run tests/lib/product-language.test.ts tests/components/dashboard-nik-feedback.test.tsx tests/i18n/document-language.test.ts`

Run: `npx --yes node@24 node_modules/typescript/bin/tsc --noEmit`

Commit:

```bash
git add lib/product-language.ts lib/i18n.tsx app/dashboard/profile/page.tsx app/dashboard/page.tsx tests/lib/product-language.test.ts tests/components/dashboard-nik-feedback.test.tsx
git diff --cached --check
git commit -m "fix(client): make the beta experience consistently English"
```

---

### Task 2: Canonical English food-name persistence

**Files:**
- Create: `lib/food/display-name.ts`
- Create: `tests/lib/food-display-name.test.ts`
- Modify: `components/food/QuickFoodInput.tsx`
- Modify: `tests/components/quick-food-log-persistence.test.ts`

**Interfaces:**
- Produces: `selectFoodDisplayName(item: Pick<ParsedFoodItem, 'food_name' | 'raw_text' | 'name_localized'>): string`
- Consumes: the English beta contract and existing `ParsedFoodItem` fields.
- Produces: the exact `food_log.food_name` value used by dashboard, log, coach, and correction views.

- [ ] **Step 1: Write failing behavior tests**

```ts
it('keeps custom beans in English when localized output says frijoles', () => {
  expect(selectFoodDisplayName({
    food_name: 'Beans', raw_text: 'custom beans', name_localized: 'frijoles',
  })).toBe('Beans');
});

it('falls back to the raw English input when the canonical name is empty', () => {
  expect(selectFoodDisplayName({ food_name: ' ', raw_text: 'custom beans', name_localized: 'frijoles' }))
    .toBe('custom beans');
});
```

- [ ] **Step 2: Run the focused test and witness red**

Run: `npx --yes node@24 node_modules/vitest/vitest.mjs run tests/lib/food-display-name.test.ts`

Expected: FAIL because the display-name module does not exist.

- [ ] **Step 3: Implement and wire the canonical boundary**

Trim candidate strings, choose `food_name`, then `raw_text`, then `name_localized`, and return `Food` only when all are empty. In `handleConfirm`, replace `item.name_localized || item.raw_text || item.food_name` with `selectFoodDisplayName(item)`. Keep `raw_text`, `food_id`, `source`, confidence, grams, and correction telemetry unchanged.

- [ ] **Step 4: Prove the persistence boundary with rendered or injected Supabase behavior**

Extend the QuickFoodInput persistence test so a confirmed item with canonical `Beans`, raw `custom beans`, and localized `frijoles` sends `food_name: 'Beans'` to the mocked `food_log` insert. Do not use a source-string assertion when the component can be exercised.

- [ ] **Step 5: Run focused parser/log tests and commit**

Run: `npx --yes node@24 node_modules/vitest/vitest.mjs run tests/lib/food-display-name.test.ts tests/components/quick-food-log-persistence.test.ts tests/agents/food-brand-fidelity-output.test.ts`

Commit:

```bash
git add lib/food/display-name.ts components/food/QuickFoodInput.tsx tests/lib/food-display-name.test.ts tests/components/quick-food-log-persistence.test.ts
git diff --cached --check
git commit -m "fix(food): persist canonical English food names"
```

---

### Task 3: Grounded photo components for Bandeja Paisa

**Files:**
- Create: `agents/prompts/photo-analyze.v1.md`
- Create: `lib/food/photo-grounding.ts`
- Create: `tests/lib/photo-grounding.test.ts`
- Modify: `app/api/ai/photo-analyze/route.ts`
- Modify: `lib/food/photo-analysis.ts`
- Modify: `tests/api/photo-analyze-contract.test.ts`
- Modify: `tests/lib/photo-analysis.test.ts`

**Interfaces:**
- Extends `PhotoAnalysisFood` with `estimated_fiber_g`, `estimated_sugar_g`, `dish_name?: string`, and `needs_confirmation?: boolean`.
- Produces: `groundKnownDishComponents(foods: PhotoAnalysisFood[]): PhotoAnalysisFood[]`.
- The route calls `normalizePhotoAnalysisFoods`, then `groundKnownDishComponents`, then returns editable rows.

- [ ] **Step 1: Write failing normalization and Bandeja component tests**

```ts
it('preserves fiber and sugar from a valid photo component');
it('keeps a large visible beans component in Bandeja Paisa');
it('adds omitted beans as low-confidence needs-confirmation when the dish is Bandeja Paisa');
it('does not invent egg, avocado, or arepa when the dish identity is unknown');
it('drops one implausible component without dropping valid siblings');
```

Use the conservative 680g benchmark fixture with beans at 120g. Assert the added row has `confidence <= 0.45`, `needs_confirmation: true`, and an uncertainty note.

- [ ] **Step 2: Run focused tests and witness red**

Run: `npx --yes node@24 node_modules/vitest/vitest.mjs run tests/lib/photo-grounding.test.ts tests/lib/photo-analysis.test.ts`

Expected: FAIL because `photo-grounding.ts` and the nutrient fields do not exist.

- [ ] **Step 3: Version the provider contract and output schema**

Create `photo-analyze.v1.md` with stable rules: English names, dish identity, visible components, estimated edible grams, fiber/sugar, confidence below 0.75 without a visual anchor, and explicit uncertainty. Update the tool schema to require the two nutrients and optional dish identity. Import the prompt in the route and keep exactly one `executeAiTask` invocation.

- [ ] **Step 4: Implement deterministic known-dish grounding**

Normalize accents and aliases for `bandeja paisa`; map `beans`, `kidney beans`, `red beans`, and `frijoles` to the English canonical component `Beans`. Preserve provider-observed grams. Only when Bandeja identity is explicit and beans are absent, append the conservative 120g confirmation row. Never append the other reference components automatically; use them only to canonicalize returned visible rows.

- [ ] **Step 5: Flow sugar/fiber into editable ParsedFoodItem rows**

Replace the hardcoded `fiber_g: 0` and `sugar_g: 0` in `photoAnalysisToParsedItems` with normalized values. Keep `portion_explicit: false`, source `ai_estimate`, and the existing plausibility limits.

- [ ] **Step 6: Add a mocked route test and prove one-call behavior**

Inject or mock the governed provider response for a Bandeja with rice, beef, and plantain but missing beans. Assert the route returns an editable Beans confirmation row, English names, fiber/sugar, and invokes the provider exactly once. Run with every paid API key unset.

- [ ] **Step 7: Run focused tests, offline provider contracts, and commit**

Run: `env -u OPENAI_API_KEY -u ANTHROPIC_API_KEY -u DEEPSEEK_API_KEY -u VOYAGE_API_KEY -u GEMINI_API_KEY -u MISTRAL_API_KEY -u TROPHE_ALLOW_PAID_AI npx --yes node@24 node_modules/vitest/vitest.mjs run tests/lib/photo-grounding.test.ts tests/lib/photo-analysis.test.ts tests/api/photo-analyze-contract.test.ts`

Commit:

```bash
git add agents/prompts/photo-analyze.v1.md lib/food/photo-grounding.ts app/api/ai/photo-analyze/route.ts lib/food/photo-analysis.ts tests/lib/photo-grounding.test.ts tests/lib/photo-analysis.test.ts tests/api/photo-analyze-contract.test.ts
git diff --cached --check
git commit -m "fix(food): ground mixed-dish photo components"
```

---

### Task 4: Honest Total sugar and an always-visible Today's note

**Files:**
- Create: `lib/nutrition/daily-summary.ts`
- Create: `tests/nutrition/daily-summary.test.ts`
- Create: `components/summary/TodayNutritionNote.tsx`
- Create: `tests/components/today-nutrition-note.test.tsx`
- Modify: `app/dashboard/page.tsx`
- Modify: `lib/i18n.tsx`

**Interfaces:**
- Produces: `summarizeSugar(entries: Pick<FoodLogEntry, 'sugar_g'>[]): { totalGrams: number | null; completeness: 'complete' | 'partial' | 'unknown' }`.
- Produces: `buildDailyNutritionNote(input: DailyNutritionNoteInput): DailyNutritionNote` where the output has `tone`, `icon`, and one `text` string.
- `TodayNutritionNote` consumes the output and renders directly below the dashboard nutrition card.

- [ ] **Step 1: Write failing sugar-completeness tests**

```ts
it('does not turn an unknown day into zero sugar', () => {
  expect(summarizeSugar([{ sugar_g: null }])).toEqual({ totalGrams: null, completeness: 'unknown' });
});

it('marks a mixed known and unknown day partial', () => {
  expect(summarizeSugar([{ sugar_g: 8 }, { sugar_g: null }]))
    .toEqual({ totalGrams: 8, completeness: 'partial' });
});

it('accepts known zero as complete', () => {
  expect(summarizeSugar([{ sugar_g: 0 }]))
    .toEqual({ totalGrams: 0, completeness: 'complete' });
});
```

- [ ] **Step 2: Write failing deterministic-note tests**

Cover no logs, partial nutrient data, strong protein progress, low fiber after three entries, low hydration late in the day, and a balanced day. Assert no output says `too much sugar`, `WHO`, or treats total sugar as added/free sugar.

- [ ] **Step 3: Run focused tests and witness red**

Run: `npx --yes node@24 node_modules/vitest/vitest.mjs run tests/nutrition/daily-summary.test.ts`

Expected: FAIL because the daily-summary module does not exist.

- [ ] **Step 4: Implement pure summary priority**

Use this deterministic order: no logs, incomplete nutrient data, protein materially behind pace, fiber below 10g after at least three entries, hydration below 500ml after 14:00, protein target reached, varied/balanced day, keep logging. Return one note only. Accept `hour` as input so tests never depend on wall-clock time.

- [ ] **Step 5: Replace the dashboard sugar row and Smart strip**

Compute `sugarSummary` once. Replace `MacroLine label="S" target={25}` with explicit `Total sugar`, known/partial/unknown value copy, and no warning threshold. Render `TodayNutritionNote` immediately after the nutrition hero regardless of `smartInsight` preference. Remove or deduplicate the old coach-gated Smart strip so two competing notes never appear.

- [ ] **Step 6: Add rendered light/dark accessibility coverage**

Assert the card exposes heading `Today's note`, readable text, semantic status tone, no low-confidence medical threshold, and the Total sugar state. Verify 44px interactive controls remain and the note itself is non-interactive.

- [ ] **Step 7: Run focused tests and commit**

Run: `npx --yes node@24 node_modules/vitest/vitest.mjs run tests/nutrition/daily-summary.test.ts tests/components/today-nutrition-note.test.tsx tests/components/dashboard-nik-feedback.test.tsx`

Commit:

```bash
git add lib/nutrition/daily-summary.ts components/summary/TodayNutritionNote.tsx app/dashboard/page.tsx lib/i18n.tsx tests/nutrition/daily-summary.test.ts tests/components/today-nutrition-note.test.tsx tests/components/dashboard-nik-feedback.test.tsx
git diff --cached --check
git commit -m "feat(client): add honest sugar and daily nutrition feedback"
```

---

### Task 5: Reversible Nik profile and meal-plan repair

**Files:**
- Create: `scripts/ops/repair-nik-english.mjs`
- Create: `tests/scripts/repair-nik-english.test.ts`
- Modify: `package.json`

**Interfaces:**
- CLI inputs: `--user-id <uuid>`, `--email <exact-email>`, `--mapping <absolute-json>`, and explicit `--apply`.
- Dry-run output: exact user ID, current language, selected row IDs/current descriptions, proposed English values, and zero mutations.
- Apply output: backup path, updated profile ID, updated meal-plan row IDs, and post-write verification.

- [ ] **Step 1: Write failing parser and mutation-safety tests**

Test that the script rejects fuzzy name-only lookup, rejects ambiguous email matches, defaults to dry-run, requires explicit row IDs in mapping JSON, writes a backup before any update, aborts on affected-count mismatch, and performs profile plus row updates only after `--apply`.

- [ ] **Step 2: Run the focused test and witness red**

Run: `npx --yes node@24 node_modules/vitest/vitest.mjs run tests/scripts/repair-nik-english.test.ts`

Expected: FAIL because the repair script does not exist.

- [ ] **Step 3: Implement the dry-run-first script**

Use the existing local/production Supabase operations client conventions. Require service-role credentials only at execution time. Write backups to `os.tmpdir()` with ISO timestamp and user ID. Use `.select()` after update and verify exact IDs. Sanitize logs so keys and unrelated profile data never print.

- [ ] **Step 4: Wire an explicit package command and validate against fixtures**

Add `"ops:repair-nik-english": "node scripts/ops/repair-nik-english.mjs"`. Tests inject a fake Supabase client and temp backup directory; they do not connect to any database.

- [ ] **Step 5: Run the production repair after code and browser verification**

Resolve Nik by exact operator-approved email or known UUID, run dry-run, inspect every selected row and English mapping, run with `--apply`, and read back exact profile/meal-plan rows. Do not proceed if identity or mapping is ambiguous.

- [ ] **Step 6: Commit the operations safety boundary**

```bash
git add scripts/ops/repair-nik-english.mjs tests/scripts/repair-nik-english.test.ts package.json
git diff --cached --check
git commit -m "chore(ops): add reversible English data repair"
```

---

### Task 6: Release verification, review, PR, deploy, and canary

**Files:**
- Modify: `e2e/theme-accessibility.spec.ts`
- Modify: `e2e/helpers/accessibility.ts` only if a behavior assertion requires a reusable helper
- Create: `docs/quality/nik-english-feedback-verification.json`
- Modify: only production files from Tasks 1-5 when a witnessed verification failure requires a fix

**Interfaces:**
- Produces: authenticated browser evidence for client light/dark at 390x844 and desktop.
- Produces: a machine-readable zero-paid verification artifact with commands, commit SHA, test counts, build result, and screenshot paths.

- [ ] **Step 1: Add failing authenticated browser cases**

Use disposable local users and fixture data. Assert one English `Good afternoon, Nik,` greeting, exactly one global theme toggle, English nav/date/plan, canonical `Beans` after confirming `custom beans`, explicit Total sugar with partial/unknown behavior, visible Today's note, and editable photo rows containing Beans. Mock `/api/ai/photo-analyze`; abort every paid provider or paid app route.

- [ ] **Step 2: Run the focused browser cases and witness red before final fixes**

Run the local authenticated E2E wrapper with Node 24 and a grep limited to `Nik English nutrition feedback`. Confirm failures name the unimplemented behavior, not loading or fixture defects.

- [ ] **Step 3: Run all local release gates**

Run:

```bash
npx --yes node@24 node_modules/typescript/bin/tsc --noEmit
npx --yes node@24 node_modules/eslint/bin/eslint.js app/dashboard/page.tsx app/dashboard/profile/page.tsx app/api/ai/photo-analyze/route.ts components/food/QuickFoodInput.tsx components/summary/TodayNutritionNote.tsx lib/product-language.ts lib/food/display-name.ts lib/food/photo-analysis.ts lib/food/photo-grounding.ts lib/nutrition/daily-summary.ts scripts/ops/repair-nik-english.mjs
npx --yes node@24 node_modules/vitest/vitest.mjs run
npm run guard:theme
env -u OPENAI_API_KEY -u ANTHROPIC_API_KEY -u DEEPSEEK_API_KEY -u VOYAGE_API_KEY -u GEMINI_API_KEY -u MISTRAL_API_KEY -u TROPHE_ALLOW_PAID_AI npm run evals:offline:providers
npx --yes node@24 node_modules/next/dist/bin/next build
```

- [ ] **Step 4: Run the full authenticated browser matrix and inspect images**

Run the Node 24 local-auth wrapper. Require zero failed/skipped cases for the scoped matrix, zero paid-route requests, zero new disposable residues, and successful cache cleanup. Inspect every new screenshot for mixed language, duplicate theme controls, clipped header/action text, low contrast, loading/skeleton states, and wrong routes.

- [ ] **Step 5: Perform a fresh diff review and close findings**

Review the exact base-to-head diff against the approved spec. Check input trust boundaries, provider-call count, RLS/data repair safety, sugar semantics, focus/targets, reduced motion, and test fidelity. Any Critical or Important finding starts a new red-green cycle and a separate commit.

- [ ] **Step 6: Open the PR and wait for required checks**

Push `fix/nik-english-nutrition-feedback`, open a PR with the verification artifact and zero-paid statement, inspect the PR diff, and wait until required CI checks pass. Do not merge a red or pending required check.

- [ ] **Step 7: Merge, deploy, and verify production**

Merge through the repository's normal PR path, wait for the Vercel production deployment tied to the merge SHA, and run read-only production health/theme/English canaries. Confirm the deployed SHA, dashboard availability, no blank/loading state, and no mixed-language regression. The canary must block paid AI routes.

- [ ] **Step 8: Record completion**

Update `docs/quality/nik-english-feedback-verification.json` with the merge SHA, deployment URL/ID, canary result, and exact production verification timestamp. Commit documentation only if repository policy requires post-ship docs in a follow-up PR; otherwise attach it to the release report.
