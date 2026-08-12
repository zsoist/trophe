# iPhone Portion Review Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the portion review action bar attached to the iPhone viewport and explain every abstract serving with its gram equivalent.

**Architecture:** `ParsedFoodList` will use the repository's existing hydration-safe `useSyncExternalStore` pattern and `createPortal` to mount the save bar under `document.body`, outside transformed Framer Motion ancestors. Existing portion data supplies visible gram anchors; nutrition calculations remain unchanged.

**Tech Stack:** React 19, React DOM portals, Framer Motion, TypeScript, Vitest, Testing Library, Next.js 16 i18n dictionaries.

## Global Constraints

- Verify mobile behavior at exactly 390×844.
- Keep the save action always visible above the existing bottom navigation.
- Use the parsed item's existing grams and quantity; do not change parser or nutrition math.
- Localize new user-visible copy in all eight languages.
- Do not add dependencies, schema changes, or auth changes.

---

### Task 1: Body-level save bar

**Files:**
- Modify: `components/food/ParsedFoodList.tsx`
- Test: `tests/components/parsed-food-list-ajiaco.test.ts`

**Interfaces:**
- Consumes: `document.body`, the existing `.portion-review-save-shell`, `saveBarRef`, and `saveBarInset` measurement.
- Produces: a hydration-safe portal whose shell is a direct child of `document.body` and is removed on unmount.

- [ ] **Step 1: Write the failing transformed-ancestor regression**

Render the real component under a wrapper with `style={{ transform: 'translateY(0)' }}`. Assert that `.portion-review-save-shell` exists under `document.body` but is not contained by the transformed wrapper. Unmount and assert the shell is removed.

```tsx
const { unmount } = render(
  <div data-testid="transformed-meal" style={{ transform: 'translateY(0)' }}>
    <ParsedFoodList items={[AJIACO]} onConfirm={vi.fn()} onCancel={vi.fn()} logging={false} />
  </div>,
);
const transformedMeal = screen.getByTestId('transformed-meal');
const saveShell = document.body.querySelector('.portion-review-save-shell');
expect(saveShell).not.toBeNull();
expect(transformedMeal.contains(saveShell)).toBe(false);
unmount();
expect(document.body.querySelector('.portion-review-save-shell')).toBeNull();
```

- [ ] **Step 2: Run the regression and verify RED**

Run:

```bash
npx vitest run tests/components/parsed-food-list-ajiaco.test.ts
```

Expected: FAIL because the current fixed shell remains inside the transformed wrapper.

- [ ] **Step 3: Implement the hydration-safe portal**

Import `useSyncExternalStore` and `createPortal`, define stable client/server snapshot helpers at module scope, and derive `canUseDom` inside `ParsedFoodList`:

```tsx
const subscribeToClient = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

const canUseDom = useSyncExternalStore(
  subscribeToClient,
  getClientSnapshot,
  getServerSnapshot,
);
```

Extract the existing save shell JSX into `saveBar`. Replace the inline shell with:

```tsx
{canUseDom && createPortal(saveBar, document.body)}
```

Keep `saveBarRef` on the inner save card so the existing `ResizeObserver` continues to measure the portaled element.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npx vitest run tests/components/parsed-food-list-ajiaco.test.ts
```

Expected: PASS, including portal cleanup after unmount.

- [ ] **Step 5: Commit the isolated fix**

```bash
git add components/food/ParsedFoodList.tsx tests/components/parsed-food-list-ajiaco.test.ts
git diff --cached --stat
git commit -m "fix(food): anchor portion actions to iphone viewport"
```

### Task 2: Explain serving grams

**Files:**
- Modify: `components/food/ParsedFoodList.tsx`
- Modify: `app/globals.css`
- Modify: `lib/i18n.tsx`
- Modify: `lib/locales/de.ts`
- Modify: `lib/locales/fr.ts`
- Modify: `lib/locales/it.ts`
- Modify: `lib/locales/nl.ts`
- Modify: `lib/locales/pt.ts`
- Test: `tests/components/parsed-food-list-ajiaco.test.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `displayVal`, `displayUnit`, `item.grams`, and `getPortionSizeOptions(item.grams)`.
- Produces: `food.portion_gram_equivalence` with `{amount}`, `{unit}`, and `{grams}` interpolation in every locale.

- [ ] **Step 1: Write the failing equivalence regression**

Add the English mock translation:

```ts
'food.portion_gram_equivalence': '{amount} {unit} ≈ {grams} g',
```

Render the 550 g Ajiaco estimate and assert literal, hand-derived values:

```tsx
expect(screen.getByText('1 bowl ≈ 550 g')).toBeInTheDocument();
expect(screen.getByText('0.7 bowls · 385 g')).toBeInTheDocument();
expect(screen.getByText('1 bowl · 550 g')).toBeInTheDocument();
expect(screen.getByText('1.4 bowls · 770 g')).toBeInTheDocument();
```

For a generic `serving` fixture, assert `1 serving ≈ 550 g` so the screenshot case is covered even when the parser does not identify `bowl`.

- [ ] **Step 2: Run the regression and verify RED**

Run:

```bash
npx vitest run tests/components/parsed-food-list-ajiaco.test.ts
```

Expected: FAIL because neither the anchor nor choice grams are currently rendered.

- [ ] **Step 3: Implement visible gram anchors**

Under the quantity row, render the localized equivalence for natural or volume units:

```tsx
<p className="portion-review-gram-equivalence">
  {t('food.portion_gram_equivalence', {
    amount: displayVal,
    unit: displayUnit,
    grams: Math.round(item.grams),
  })}
</p>
```

In each size choice, retain the localized human-unit amount and append `· {option.grams} g`. Add `.portion-review-gram-equivalence` in `app/globals.css` at 12 px, centered, using `var(--t3)` so the anchor remains compact and readable in both themes at 390 px.

- [ ] **Step 4: Add all locale strings**

Use equivalent copy in EN, ES, EL, FR, DE, IT, PT, and NL. Preserve the same interpolation fields in every translation.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
npx vitest run tests/components/parsed-food-list-ajiaco.test.ts tests/components/parsed-food-list-light-mode.test.ts tests/components/portion-controls.test.ts tests/i18n/natural-portion-units.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 6: Record the release change and commit**

```bash
git add CHANGELOG.md app/globals.css components/food/ParsedFoodList.tsx lib/i18n.tsx lib/locales/de.ts lib/locales/fr.ts lib/locales/it.ts lib/locales/nl.ts lib/locales/pt.ts tests/components/parsed-food-list-ajiaco.test.ts
git diff --cached --stat
git commit -m "fix(food): explain portion servings in grams"
```

### Task 3: Verification and release

**Files:**
- Verify only: all changed files

**Interfaces:**
- Consumes: the two green task commits.
- Produces: a reviewed PR, green CI, Ready Vercel production deployment, and a 390×844 canary.

- [ ] **Step 1: Run required local verification**

```bash
npm run typecheck
npm run lint -- --no-cache
npm test
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=build-placeholder npm run build
npm audit --omit=dev --audit-level=high
git diff --check origin/main...HEAD
```

- [ ] **Step 2: Verify the actual hierarchy at 390×844**

Use Playwright against the real meal-slot hierarchy. Confirm the save shell's parent is `document.body`, its bottom edge clears the bottom navigation, `Enter amount` and `Take photo` can scroll fully above it, and the serving anchor is visible.

- [ ] **Step 3: Review the diff**

Run the repository review workflow. Resolve every Critical or Important finding, then repeat focused tests and typecheck.

- [ ] **Step 4: Push and open a PR**

```bash
git push -u origin fix/iphone-portion-overlay
gh pr create --base main --head fix/iphone-portion-overlay
```

- [ ] **Step 5: Merge only after CI is green**

Wait for GitHub `verify` and Vercel Preview. Merge the clean PR to `main`; the user's `fix and deploy` request is the production authorization for this change.

- [ ] **Step 6: Wait for production and run canary**

Wait until the new production deployment is `Ready`, then verify `https://trophe.app/api/health` and load `https://trophe.app` at 390×844 with zero console errors or failed requests.
