# Nik Food-Logging Recovery Design

**Status:** Approved on 2026-08-11

## Outcome

Food logging must recover gracefully when a portion is uncertain, distinguish nutrient facts from food weight, and never trap the app in voice mode. Nik's reported scenarios are the acceptance cases:

- `ajiaco` offers practical Small, Medium, and Large choices based on the parsed food's own estimated serving, plus Take Photo and Enter Amount.
- A user can replace the grams value with `700` without the input forcing `1` while they edit.
- `protein bar with 13 g protein` records 13 g as the bar's total protein and does not reinterpret the bar as weighing 13 g.
- Voice input always returns to an editable state after success, Stop, permission denial, recognition failure, or inactivity.

## Interaction Design

### Portion clarification

Every parsed item with `portion_explicit === false` receives a compact portion chooser inside its review card:

- **Small**, **Medium**, and **Large** use the item's current food-specific gram estimate as the center. The options are rounded, positive gram values derived with `0.7x`, `1x`, and `1.4x` multipliers.
- **Enter amount** focuses the item's amount field and selects the existing value.
- **Take photo** opens the existing photo analyzer from both clarification states: a parsed estimated item and a no-items clarification question.
- Choosing a size or committing an amount recalculates macros from the current per-gram ratios, marks the portion explicit, and removes the unresolved warning for that item.
- Saving an estimate remains possible. The chooser guides rather than blocks.

The same controls work for volume items, preserving the existing display-unit conversion.

### Amount editing

The numeric control keeps a local string draft while focused. Empty text is valid during editing. The value is committed only on blur or Enter when it is a positive number; invalid or empty drafts restore the previous amount. Focus selects the whole value so typing `700` replaces the estimate in one action. Escape restores the previous amount.

### User-stated nutrients

A deterministic nutrient-claim layer extracts explicit totals for protein, carbohydrates, fat, fiber, sugar, and calories in the supported core languages. Claims adjacent to a nutrient name are nutrient facts, not portion measurements. Examples include:

- `13 g protein`, `13g of protein`, `protein 13 g`
- `20 g carbs`, `7 g fat`, `180 calories`
- equivalent common Spanish, Greek, and French nutrient words

The parser prompt is versioned from v7 to v8 and explicitly teaches the same distinction, but correctness does not depend on the model alone. After structured extraction:

1. If the model used a nutrient claim as `quantity` plus a mass unit, the candidate is repaired to one normal item/serving and its estimated food weight is cleared.
2. The normal database and portion pipeline resolves the food and its weight.
3. Explicit nutrient totals override only the corresponding final macro fields.
4. The result carries optional `user_stated_nutrients` metadata so review can say which label facts were used.

Claims attach to the matching parsed item's raw text. Whole-input claims apply automatically only when one food item was parsed; ambiguous multi-item claims do not silently overwrite multiple foods.

### Voice lifecycle

Voice recognition moves into a small browser-independent controller with one terminal path. It registers handlers before calling `start()`, keeps the latest combined final and interim transcript, and supports:

- successful natural end, which parses the latest transcript;
- manual Stop, which waits briefly for a final browser event and then falls back to the latest interim transcript;
- synchronous `start()` failure;
- browser `error` events, including permission denial;
- a 30-second hard watchdog when the browser never emits completion;
- idempotent cleanup so late or duplicate events cannot parse twice.

The UI does not preflight with `getUserMedia()`. Web Speech owns the permission request, avoiding the unbounded permission promise that can freeze the current flow. Unsupported or denied microphones leave the typed text intact and return immediately to idle with actionable copy.

## Architecture and File Boundaries

- `components/food/portion-controls.ts` owns pure portion-option and amount-draft behavior.
- `components/food/voice-input.ts` owns the recognition session controller and transcript collection.
- `agents/food-parse/nutrient-claims.ts` owns deterministic nutrient extraction, candidate repair, and final overrides.
- `components/food/ParsedFoodList.tsx` renders portion choices, editable drafts, and stated-nutrition confirmation.
- `components/food/QuickFoodInput.tsx` wires photo capture and the voice controller into the existing modes.
- `agents/prompts/food-parse.v8.md` documents the provider contract without changing v7 in place.
- `agents/food-parse/index.v4.ts` invokes deterministic nutrient handling at the parser boundaries.
- `lib/i18n.tsx` contains all new user-visible copy.

No database migration or new dependency is required.

## Error Handling

- Portion values are clamped to the parser's existing sane range and never become zero or negative.
- Invalid amount drafts do not mutate nutrition values.
- Implausible nutrient claims remain subject to the existing metabolic and mass safety barriers; a claim never bypasses parser safety.
- Voice completion is idempotent, clears timers, and never fires a parse after cancellation or unmount.
- Photo failure returns to the existing editable flow with the user's original text preserved.

## Verification

Test-first coverage must prove:

- food-specific Small/Medium/Large values and amount-draft commit/cancel behavior;
- clearing a field does not coerce it to `1`, and `700` commits;
- nutrient extraction and candidate repair for Nik's protein-bar wording;
- explicit macro overrides leave food grams unchanged;
- voice handlers are attached before start, Stop preserves interim speech, watchdogs recover, start failures recover, and completion cannot happen twice;
- integration contracts expose photo and size controls in both clarification paths;
- typecheck, lint, unit tests, production build, and focused browser QA pass.

## Baseline Note

The isolated worktree baseline on 2026-08-11 passed 546 tests. Five existing tests failed only because the documented local Supabase service was not running at `127.0.0.1:54322`; this feature adds no database dependency.
