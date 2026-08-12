# Nik Food-Logging Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make uncertain portions practical to resolve, preserve normal grams editing, treat stated macro grams as nutrition facts, and guarantee voice input always recovers.

**Architecture:** Add three pure, testable boundaries for portion controls, nutrient claims, and browser speech lifecycle. Existing React and food-parser files consume those boundaries; the provider prompt reinforces nutrient intent but deterministic code owns correctness.

**Tech Stack:** Next.js 16.2.7, React 19, TypeScript strict, Vitest 4, Web Speech API, Framer Motion, existing i18n dictionary.

## Global Constraints

- No database migration and no new dependency.
- Keep `agents/prompts/food-parse.v7.md` immutable; create v8 and make it the default.
- All new user-visible strings use `t('key')` with entries in `lib/i18n.tsx`.
- Preserve mobile-first layout at 390x844 and the existing calm-mode calorie gate.
- Never reinterpret `13 g protein` as a 13 g food portion.
- Voice has one idempotent terminal path and a 30-second hard watchdog.
- Each production change follows a witnessed red-green test cycle.

---

### Task 1: Portion choices and editable amount drafts

**Files:**
- Create: `components/food/portion-controls.ts`
- Create: `tests/components/portion-controls.test.ts`
- Modify: `components/food/ParsedFoodList.tsx`
- Modify: `components/food/QuickFoodInput.tsx`
- Modify: `lib/i18n.tsx`

**Interfaces:**
- Produces: `getPortionSizeOptions(grams: number): PortionSizeOption[]`
- Produces: `resolveAmountDraft(draft: string, previous: number): number`
- Consumes: `ParsedFoodItem`, the existing `recalcMacros()` ratio behavior, and `fileInputRef` photo capture.

- [ ] **Step 1: Write failing pure behavior tests**

```ts
import { describe, expect, it } from 'vitest';
import { getPortionSizeOptions, resolveAmountDraft } from '@/components/food/portion-controls';

describe('portion choices', () => {
  it('derives food-specific choices from an ajiaco estimate', () => {
    expect(getPortionSizeOptions(500)).toEqual([
      { size: 'small', grams: 350 },
      { size: 'medium', grams: 500 },
      { size: 'large', grams: 700 },
    ]);
  });
});

describe('amount drafts', () => {
  it('allows an empty editing draft and commits 700', () => {
    expect(resolveAmountDraft('', 500)).toBe(500);
    expect(resolveAmountDraft('700', 500)).toBe(700);
  });
});
```

- [ ] **Step 2: Run the focused test and witness the missing-module failure**

Run: `npx vitest run tests/components/portion-controls.test.ts`

Expected: FAIL because `components/food/portion-controls.ts` does not exist.

- [ ] **Step 3: Implement the pure portion boundary**

```ts
export type PortionSize = 'small' | 'medium' | 'large';
export interface PortionSizeOption { size: PortionSize; grams: number }

const roundPractical = (grams: number) => Math.max(1, Math.round(grams / 5) * 5);

export function getPortionSizeOptions(grams: number): PortionSizeOption[] {
  const center = Math.max(1, Math.min(15_000, grams));
  return [
    { size: 'small', grams: roundPractical(center * 0.7) },
    { size: 'medium', grams: roundPractical(center) },
    { size: 'large', grams: roundPractical(center * 1.4) },
  ];
}

export function resolveAmountDraft(draft: string, previous: number): number {
  const parsed = Number(draft);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(15_000, parsed) : previous;
}
```

- [ ] **Step 4: Run the focused test and witness green**

Run: `npx vitest run tests/components/portion-controls.test.ts`

Expected: PASS.

- [ ] **Step 5: Wire draft editing and portion actions into review**

In `ParsedFoodList.tsx`:

- add `onTakePhoto?: () => void`;
- keep `amountDrafts: Record<number, string>` separate from numeric item state;
- show the draft string while focused and permit `''` in `onChange`;
- on focus select the whole value;
- on Enter/blur commit with `resolveAmountDraft`, and on Escape discard;
- render Small/Medium/Large, Enter amount, and Take photo for implicit portions;
- choosing a size calls the existing macro recalculation path and marks the item explicit.

In `QuickFoodInput.tsx`, mount the hidden photo input inside confirmation and question returns, and pass `onTakePhoto={() => fileInputRef.current?.click()}`.

- [ ] **Step 6: Add localized copy**

Add keys for `food.portion_small`, `food.portion_medium`, `food.portion_large`, `food.enter_amount`, `food.take_photo`, `food.estimated_portion_help`, and amount-field ARIA copy in English, Spanish, and Greek inline dictionaries, with existing locale fallback behavior for other languages.

- [ ] **Step 7: Run focused tests, typecheck, and commit**

Run: `npx vitest run tests/components/portion-controls.test.ts tests/components/volume-display.regression-1.test.ts`

Run: `npm run typecheck`

Commit:

```bash
git add components/food/portion-controls.ts tests/components/portion-controls.test.ts components/food/ParsedFoodList.tsx components/food/QuickFoodInput.tsx lib/i18n.tsx
git diff --cached --stat
git commit -m "fix(food): make uncertain portions easy to resolve"
```

---

### Task 2: Deterministic user-stated nutrient intent

**Files:**
- Create: `agents/food-parse/nutrient-claims.ts`
- Create: `tests/agents/nutrient-claims.test.ts`
- Create: `agents/prompts/food-parse.v8.md` by copying v7 and adding the nutrient-fact rule
- Modify: `agents/food-parse/index.v4.ts`
- Modify: `agents/schemas/food-parse.ts`
- Modify: `components/food/ParsedFoodList.tsx`
- Modify: `lib/i18n.tsx`

**Interfaces:**
- Produces: `extractNutrientClaims(text: string): UserStatedNutrients`
- Produces: `repairNutrientClaimPortion<T extends NutrientCandidate>(candidate: T, claims: UserStatedNutrients): T`
- Produces: `applyUserStatedNutrients<T extends NutrientResult>(item: T, claims: UserStatedNutrients): T`
- Adds optional `user_stated_nutrients` to `ParsedFoodItem`.

- [ ] **Step 1: Write failing extraction, repair, and override tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  applyUserStatedNutrients,
  extractNutrientClaims,
  repairNutrientClaimPortion,
} from '@/agents/food-parse/nutrient-claims';

it('reads 13 g protein as a nutrient fact', () => {
  expect(extractNutrientClaims('protein bar with 13 g of protein')).toEqual({ protein_g: 13 });
});

it('repairs a model that made the nutrient claim the bar weight', () => {
  const repaired = repairNutrientClaimPortion({
    quantity: 13,
    unit: 'g',
    portion_explicit: true,
    estimated_grams: 13,
  }, { protein_g: 13 });
  expect(repaired).toMatchObject({ quantity: 1, unit: 'piece', portion_explicit: false });
  expect(repaired.estimated_grams).toBeUndefined();
});

it('overrides protein without changing the bar weight', () => {
  const result = applyUserStatedNutrients({ grams: 60, protein_g: 20, carbs_g: 18, fat_g: 6 }, { protein_g: 13 });
  expect(result).toMatchObject({ grams: 60, protein_g: 13, carbs_g: 18, fat_g: 6 });
});
```

- [ ] **Step 2: Run the focused test and witness red**

Run: `npx vitest run tests/agents/nutrient-claims.test.ts`

Expected: FAIL because the nutrient-claims module does not exist.

- [ ] **Step 3: Implement deterministic claim extraction and candidate repair**

Use bounded regular expressions for value-first and nutrient-first phrases. Normalize decimal commas. Support protein, carbohydrate, fat, fiber, sugar, and calories with common English, Spanish, Greek, and French labels. Only match a gram value when a nutrient label is adjacent; a standalone `60 g bar` remains a portion.

Repair only when all are true:

- candidate unit is `g`, `gram`, `grams`, `gr`, or `γρ`;
- candidate quantity equals a claimed nutrient gram value;
- there is no independent portion measurement in the input;
- the candidate represents one countable product or serving.

- [ ] **Step 4: Apply claims at parser boundaries**

In `index.v4.ts`:

1. extract claims once from sanitized input;
2. repair candidates immediately after structured provider output and before lookup;
3. attach claims by candidate raw text, or to the sole item for whole-input claims;
4. apply explicit totals after food resolution but before the final safety barrier;
5. preserve grams and non-claimed macros.

Set the default prompt version to `v8`. Copy v7 to v8 and add explicit examples stating that nutrient grams are label totals, not food weight.

- [ ] **Step 5: Render trust feedback and localize it**

When `user_stated_nutrients` is non-empty, render a small calm line such as `Using label: 13 g protein`. Build the list from localized nutrient names and values; do not expose calories when `showCalories` is false.

- [ ] **Step 6: Run focused parser tests and commit**

Run: `npx vitest run tests/agents/nutrient-claims.test.ts tests/agents/food-parse-clarification.test.ts tests/agents/food-parse-structured-output.test.ts`

Run: `npm run typecheck`

Commit:

```bash
git add agents/food-parse/nutrient-claims.ts tests/agents/nutrient-claims.test.ts agents/prompts/food-parse.v8.md agents/food-parse/index.v4.ts agents/schemas/food-parse.ts components/food/ParsedFoodList.tsx lib/i18n.tsx
git diff --cached --stat
git commit -m "fix(food): distinguish nutrient facts from portion weight"
```

---

### Task 3: Recoverable voice lifecycle

**Files:**
- Create: `components/food/voice-input.ts`
- Create: `tests/components/voice-input.test.ts`
- Modify: `components/food/QuickFoodInput.tsx`
- Modify: `lib/i18n.tsx`

**Interfaces:**
- Produces: `startVoiceSession(options: VoiceSessionOptions): VoiceSession`
- `VoiceSession` exposes `stop()` and `cancel()`.
- `VoiceSessionOptions` exposes `recognition`, `language`, `onListening`, `onTranscript`, `onComplete`, and `onError` callbacks plus optional timer injection for tests.

- [ ] **Step 1: Write failing lifecycle tests with a small recognition fake**

Cover these behaviors with Vitest fake timers:

```ts
it('attaches handlers before start and completes once with final speech');
it('manual stop preserves interim speech when no final event arrives');
it('recovers when start throws synchronously');
it('aborts and recovers after the 30 second watchdog');
it('ignores duplicate end and error events after completion');
```

The fake records whether handlers existed when `start()` was called and exposes `emitResult`, `emitError`, and `emitEnd` methods. Assertions target completion/error callbacks and transcript values, not fake call counts alone.

- [ ] **Step 2: Run the focused test and witness red**

Run: `npx vitest run tests/components/voice-input.test.ts`

Expected: FAIL because `components/food/voice-input.ts` does not exist.

- [ ] **Step 3: Implement the controller**

The controller must:

- assign `onresult`, `onerror`, and `onend` before `start()`;
- combine final and interim alternatives into `latestTranscript`;
- call `onListening()` only after `start()` returns successfully;
- use a 30,000 ms hard watchdog;
- on manual Stop, call `recognition.stop()` and use a 1,500 ms completion fallback;
- funnel success, error, timeout, cancel, and duplicate events through one guarded finalizer;
- clear every timer in the finalizer.

- [ ] **Step 4: Replace the inline recognition refs in QuickFoodInput**

Remove the `getUserMedia()` warmup and direct event-handler block. Keep one `voiceSessionRef`. On Voice:

- construct recognition;
- call `startVoiceSession`;
- set mode listening only from `onListening`;
- write live transcript through `onTranscript`;
- parse the terminal transcript through `onComplete`;
- map permission denial, timeout, no-speech, unsupported, and generic errors to localized copy;
- `stopVoiceInput` delegates to `voiceSessionRef.current?.stop()`;
- unmount and Cancel delegate to `.cancel()`.

- [ ] **Step 5: Run lifecycle tests, typecheck, and commit**

Run: `npx vitest run tests/components/voice-input.test.ts tests/components/quick-food-garbage.regression-1.test.ts`

Run: `npm run typecheck`

Commit:

```bash
git add components/food/voice-input.ts tests/components/voice-input.test.ts components/food/QuickFoodInput.tsx lib/i18n.tsx
git diff --cached --stat
git commit -m "fix(food): make voice input always recover"
```

---

### Task 4: Integration contracts and release verification

**Files:**
- Create or modify: `tests/components/food-logging-nik-feedback.test.ts`
- Modify if required by observed failures: only files already listed in Tasks 1-3

**Interfaces:**
- Consumes the final portion, nutrient, and voice APIs from Tasks 1-3.
- Produces a single regression suite mapping directly to Nik's four reports.

- [ ] **Step 1: Add integration-level regression cases**

Exercise real exported behavior and assert:

- a 500 g ajiaco estimate offers 350/500/700 g choices;
- an empty amount draft keeps the prior value and `700` commits;
- `protein bar with 13 g of protein` extracts 13 g protein, repairs a 13 g model portion, and preserves a normal bar weight after override;
- voice Stop with only interim speech returns that speech once;
- voice start failure and watchdog each reach an error terminal state rather than listening forever.

- [ ] **Step 2: Run the complete non-database unit suite**

Run all tests except the five documented local-Supabase cases:

```bash
npx vitest run --exclude tests/agents/food-parse.accuracy.test.ts --exclude tests/db/agent-runs-metadata.test.ts
```

Expected: all selected tests pass.

- [ ] **Step 3: Run static and production-build gates**

Run:

```bash
npm run typecheck
npm run lint
npm run build
```

Expected: all commands exit 0 with no errors.

- [ ] **Step 4: Run focused browser QA at mobile and desktop widths**

Start the app with usable local environment values, then verify at 390x844 and 1280x720:

- clarification controls fit without horizontal overflow;
- tapping Enter amount selects the numeric value and accepts 700;
- Take photo opens the file chooser from clarification;
- Voice Stop returns to the normal editor;
- no console error is produced.

If browser automation cannot access microphone hardware, inject the tested Web Speech fake and verify UI state transitions while retaining the controller's real behavior tests as the speech lifecycle authority.

- [ ] **Step 5: Review the diff and commit the integration gate**

Run:

```bash
git diff --check
git diff --stat HEAD~3
git status --short
```

Commit:

```bash
git add tests/components/food-logging-nik-feedback.test.ts
git diff --cached --stat
git commit -m "test(food): cover Nik logging regressions"
```

- [ ] **Step 6: Final requirement-by-requirement audit**

For each design acceptance case, cite the passing test or browser observation that proves it. Do not complete the goal if any case has only source inspection or indirect evidence.
