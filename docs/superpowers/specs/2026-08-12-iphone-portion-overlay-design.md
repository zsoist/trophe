# iPhone portion review overlay fix

## Problem

The portion review save bar uses `position: fixed` inside animated meal-slot ancestors. Framer Motion leaves a `transform` on those ancestors. On iOS Safari, a transformed ancestor becomes the containing block for fixed descendants, so the save bar is positioned against the Breakfast card instead of the viewport. It lands in the middle of the editor and obscures `Enter amount`, `Take photo`, and macro details.

The review also displays abstract values such as `1 serving` and `0.7 servings` without showing the gram anchor already present in the parsed item. A tester therefore cannot tell what a serving means.

## Selected design

1. Render the save-bar shell into `document.body` with a React portal after client mount. This removes it from all transformed meal-slot ancestors while preserving the existing always-visible bottom action.
2. Keep the measured bottom inset on the review list so every control can be scrolled above the viewport-fixed bar.
3. Show a compact equivalence immediately below the quantity row for natural or volume portions: `1 serving ≈ 550 g` (or the localized unit already carried by the item).
4. Show the gram equivalent inside each Small, Medium, and Large option in addition to its human-unit amount.
5. Localize the equivalence format in all eight supported languages.

## Alternatives rejected

- **Inline/sticky save bar:** removes the overlay but makes the primary action disappear below a long editor and changes the interaction Nick is already testing.
- **Full-screen modal:** isolates layout completely but is a much larger navigation and accessibility change than this production bug requires.

## Accessibility and responsive behavior

- The portal remains in normal reading order logically through React even though it is mounted at the document root.
- Existing focusable controls and accessible names remain unchanged.
- The gram equivalence is visible text, not tooltip-only content.
- The viewport offset continues to clear the bottom navigation and iPhone safe-area behavior already used by the app.

## Test contract

- A mounted review inside a transformed ancestor must place `.portion-review-save-shell` under `document.body`, not inside that ancestor.
- Unmounting must remove the portaled bar.
- A 550 g, quantity-1 serving must visibly state `1 serving ≈ 550 g`.
- Portion choices must expose both the human amount and their hand-derived gram equivalents: 385 g, 550 g, and 770 g.
- Existing editing, clarification, light-mode, and portion calculations must remain green.

## Scope

Only `ParsedFoodList`, its localized copy, focused component tests, and release notes change. No parser, database, nutrition calculation, auth, or persisted-data behavior changes.
