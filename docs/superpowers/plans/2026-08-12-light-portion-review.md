# Light-mode Portion Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the mobile food portion-review state readable, touch-friendly, and space-efficient in light mode without changing food calculations or dark-mode behavior.

**Architecture:** Add component-scoped semantic class names to `ParsedFoodList` and define their theme-aware presentation in `app/globals.css`. Keep portion state and calculations unchanged; prove interaction behavior with the mounted component test and prove the real stylesheet contract with a focused CSS test.

**Tech Stack:** React 19, Next.js 16, Tailwind CSS 4, CSS custom properties, Vitest 4, Testing Library, jsdom.

## Global Constraints

- Mobile baseline is exactly 390x844.
- Primary touch targets are at least 44px; steppers are exactly 52px square.
- Quantity value is at least 20px; portion labels are at least 14px.
- Light-mode instructional amber uses the readable semantic warning token; dark mode retains the current warm amber treatment.
- Food parsing, natural-unit conversion, macro recalculation, and confirmation payloads must not change.
- No new runtime dependency.

---

### Task 1: Protect the review's accessibility and visual contract

**Files:**
- Modify: `tests/components/parsed-food-list-ajiaco.test.ts`
- Create: `tests/components/parsed-food-list-light-mode.test.ts`

**Interfaces:**
- Consumes: `ParsedFoodList` and `app/globals.css`.
- Produces: regression coverage for accessible item removal, 52px steppers, 20px amount text, 58px portion choices, compact mobile spacing, and light-mode warning contrast.

- [ ] **Step 1: Write the failing mounted accessibility assertion**

Add the localized mock value and assertion below; removing the production `aria-label` must make this test fail:

```ts
'food.remove_item_aria': 'Remove {name}',

expect(screen.getByRole('button', {
  name: 'Remove ajiaco santafereño',
})).toBeTruthy();
```

- [ ] **Step 2: Write the failing stylesheet behavior test**

Load `app/globals.css` with PostCSS, resolve declarations by selector/property, and assert these independently derived limits:

```ts
expect(px('.portion-review-stepper', 'width')).toBeGreaterThanOrEqual(52);
expect(px('.portion-review-stepper', 'height')).toBeGreaterThanOrEqual(52);
expect(px('.portion-review-amount', 'font-size')).toBeGreaterThanOrEqual(20);
expect(px('.portion-review-choice', 'min-height')).toBeGreaterThanOrEqual(58);
expect(rem('.portion-review-list', 'padding-bottom')).toBeLessThanOrEqual(9);
expect(value('.light .portion-review-estimate-copy', 'color')).toBe('var(--warn)');
expect(contrast(lightWarn, lightBackground)).toBeGreaterThanOrEqual(4.5);
```

- [ ] **Step 3: Run the focused tests and verify RED**

Run: `npx vitest run tests/components/parsed-food-list-ajiaco.test.ts tests/components/parsed-food-list-light-mode.test.ts`

Expected: failures for the missing accessible label and missing component-scoped CSS declarations.

### Task 2: Implement the dense, high-contrast review surface

**Files:**
- Modify: `components/food/ParsedFoodList.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: existing `ParsedFoodItem`, portion-control helpers, and theme tokens.
- Produces: the same `onConfirm(items)` payload with improved responsive presentation.

- [ ] **Step 1: Add semantic component classes and accessible labels**

Attach scoped classes to the item card, amount row, steppers, amount input, unit, estimate panel, size choices, macro row, item list spacer, and save bar. Add `aria-label={t('food.remove_item_aria', { name })}` to the remove button.

```tsx
const itemName = item.name_localized || item.food_name;

<button
  className="portion-review-remove ..."
  aria-label={t('food.remove_item_aria', { name: itemName })}
>
  <X size={16} />
</button>
```

- [ ] **Step 2: Add localized remove-item copy**

Add `food.remove_item_aria` to the base dictionary and overlays with these values:

```ts
// lib/i18n.tsx
'food.remove_item_aria': {
  en: 'Remove {name}',
  es: 'Eliminar {name}',
  el: 'Αφαίρεση {name}',
},

// fr / de / it / pt / nl overlays
'food.remove_item_aria': 'Supprimer {name}',
'food.remove_item_aria': '{name} entfernen',
'food.remove_item_aria': 'Rimuovi {name}',
'food.remove_item_aria': 'Remover {name}',
'food.remove_item_aria': '{name} verwijderen',
```

- [ ] **Step 3: Define responsive and light-mode styles**

Use the following component contract; minor ordering changes are allowed but the values and selectors are fixed:

```css
.portion-review-list { padding-bottom: 9rem; }
.portion-review-item { padding: 10px; }
.portion-review-quantity {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr) 52px;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.portion-review-stepper { width: 52px; height: 52px; }
.portion-review-amount { width: 96px; min-height: 52px; font-size: 20px; font-weight: 600; }
.portion-review-unit { min-width: 0; overflow: hidden; text-overflow: ellipsis; font-size: 14px; }
.portion-review-choice { min-height: 58px; }
.portion-review-choice-label { font-size: 14px; font-weight: 600; }
.portion-review-choice-value { font-size: 12px; }
.portion-review-item-macros { display: flex; flex-wrap: wrap; column-gap: 12px; row-gap: 4px; font-size: 13px; }
.portion-review-save { padding: 12px; }
.portion-review-total-value { font-size: 16px; }
.portion-review-total-label { font-size: 11px; }
.light .portion-review-estimate {
  background: rgba(180, 83, 9, 0.06);
  border-color: rgba(180, 83, 9, 0.28);
}
.light .portion-review-estimate-copy,
.light .portion-review-choice-label,
.light .portion-review-save-note { color: var(--warn); }
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npx vitest run tests/components/parsed-food-list-ajiaco.test.ts tests/components/parsed-food-list-light-mode.test.ts tests/components/portion-controls.test.ts`

Expected: all tests pass and the ajiaco interaction payload remains unchanged.

### Task 3: Verify, review, and deploy

**Files:**
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: completed UI change and test suite.
- Produces: reviewed production deployment on `main`.

- [ ] **Step 1: Verify code quality and production compilation**

Run `npm run typecheck`, `npm run lint`, focused Vitest, and `npm run build`. Run the repository's full CI after pushing the PR.

- [ ] **Step 2: Capture mobile light- and dark-mode screenshots**

Render the real authenticated review flow at 390x844, compare it with the supplied screenshot, and check overflow, contrast, target sizes, fixed-bar overlap, and both themes.

- [ ] **Step 3: Record the user-visible change**

Add this dated changelog entry:

```md
### [Light-mode portion review] — 2026-08-12

- Increased light-mode contrast and type size throughout food portion review.
- Enlarged amount and size controls while reducing nested-card padding and unused bottom space.
- Preserved natural-unit editing, macro recalculation, and confirmation behavior.
```

- [ ] **Step 4: Commit, open the PR, merge, and deploy**

Stage only the scoped files, commit, push `fix/light-portion-review`, open a PR to `main`, wait for green CI and preview deployment, merge with the approved operator gate, and verify `https://trophe.app/api/health` plus the production page canary.
