# Ajiaco Soup Portions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ajiaco and other container-portioned foods editable in natural units while preserving grams as the internal nutrition basis.

**Architecture:** Add pure portion-presentation and contradiction-repair helpers beside the existing portion utilities, then consume them in `ParsedFoodList`. A recognized single-item portion question overrides a contradictory explicit flag; the rendered controls convert bowl quantities to grams before using the existing macro recalculation.

**Tech Stack:** TypeScript, React 19, Next.js 16, Vitest, Testing Library, next-intl-style project i18n.

## Global Constraints

- Do not add a database migration or runtime dependency.
- Keep all nutrition calculations gram-based and preserve the existing 1-to-15,000-gram clamp.
- Do not special-case the food name `ajiaco`; apply the rule by portion semantics.
- All new user-visible strings must use the existing translation system.
- Preserve mass-food and physical-volume behavior.

---

### Task 1: Natural Portion Domain

**Files:**
- Modify: `components/food/portion-controls.ts`
- Test: `tests/components/portion-controls.test.ts`

**Interfaces:**
- Consumes: existing `PortionSize`, `getPortionSizeOptions`, `getPortionDisplayAmount`, and `isPortionClarificationQuestion` utilities.
- Produces: `isNaturalPortionUnit(unit: string): boolean`, `shouldTreatPortionAsEstimated(input): boolean`, `getHumanPortionAmount(input): number`, and `getGramsForHumanPortion(input): number`.

- [ ] **Step 1: Write failing ajiaco tests**

Add assertions for a single `bowl` item with `portionExplicit: true` and the question `What portion size of ajiaco did you have (for example, a bowl or grams)?`. Expect it to be estimated, expect 550 grams to display as 1 bowl, and expect 1.25 bowls to resolve to 687.5 grams.

- [ ] **Step 2: Run the focused test and verify red**

Run: `npm test -- --run tests/components/portion-controls.test.ts`

Expected: FAIL because the four new helper exports do not exist.

- [ ] **Step 3: Implement the smallest semantic helpers**

Use a normalized set of natural container units. Require `itemCount === 1` and a recognized portion question before overriding an explicit flag. Convert with `grams * humanAmount / parsedQuantity`, and fall back safely when inputs are invalid.

- [ ] **Step 4: Run the focused test and verify green**

Run: `npm test -- --run tests/components/portion-controls.test.ts`

Expected: all portion-control tests pass.

- [ ] **Step 5: Commit the domain change**

```bash
git add components/food/portion-controls.ts tests/components/portion-controls.test.ts
git commit -m "fix(food): model natural container portions"
```

### Task 2: Ajiaco Review Interaction

**Files:**
- Modify: `components/food/ParsedFoodList.tsx`
- Modify: `lib/i18n.tsx` only if a new unit label is required
- Test: `tests/components/food-logging-nik-feedback.test.ts`

**Interfaces:**
- Consumes: the Task 1 helpers and existing `recalcMacros(nextGrams)` behavior.
- Produces: rendered size choices and amount editing in `item.unit` for natural containers, with the portion clarification removed after resolution.

- [ ] **Step 1: Write a failing integration contract**

Add an ajiaco fixture with `grams: 550`, `quantity: 1`, `unit: 'bowl'`, `portion_explicit: true`, and a portion clarification. Assert that the component source consumes `shouldTreatPortionAsEstimated`, renders the human-unit amount, and gates the clarification on unresolved portion state.

- [ ] **Step 2: Run the focused test and verify red**

Run: `npm test -- --run tests/components/food-logging-nik-feedback.test.ts`

Expected: FAIL because `ParsedFoodList` still gates choices only on `portion_explicit === false` and displays grams for bowls.

- [ ] **Step 3: Wire natural-unit presentation into the item editor**

Normalize the single-item contradiction when local state is initialized. For a natural unit, display `quantity`, use a `0.25` step, convert committed drafts back to grams, and label size choices with proportional container amounts. Keep volume and mass branches unchanged.

- [ ] **Step 4: Resolve the clarification after interaction**

Render a portion clarification only while the matching item remains estimated. Both a size click and a successful amount commit already mark the item explicit through `recalcMacros`; use that state as the single resolution signal.

- [ ] **Step 5: Run focused tests and verify green**

Run: `npm test -- --run tests/components/portion-controls.test.ts tests/components/food-logging-nik-feedback.test.ts`

Expected: all focused tests pass.

- [ ] **Step 6: Commit the UI change**

```bash
git add components/food/ParsedFoodList.tsx lib/i18n.tsx tests/components/food-logging-nik-feedback.test.ts
git commit -m "fix(food): show soup portions in bowls"
```

### Task 3: Full Verification and Release

**Files:**
- Modify only files required by concrete verification failures introduced by Tasks 1-2.

**Interfaces:**
- Consumes: completed natural-portion domain and review UI.
- Produces: a deployable branch with recorded automated and browser evidence.

- [ ] **Step 1: Run repository verification**

Run, in order:

```bash
npm run typecheck
npm run lint
npm test -- --run
npm run build
```

Expected: all commands exit 0. If an environment-only database suite cannot connect to its documented local service, record it separately and prove no feature dependency on that service.

- [ ] **Step 2: Review the final diff**

Run: `git diff origin/main...HEAD --check && git diff origin/main...HEAD --stat`

Expected: no whitespace errors and only scoped source, tests, and design documentation.

- [ ] **Step 3: Publish and run CI**

Push `fix/ajiaco-soup-portions`, open a pull request, wait for every required check, and merge only when green.

- [ ] **Step 4: Verify production on mobile**

At 390x844, log `ajiaco santafereño` and assert that the review offers Small/Medium/Large, uses `bowl` in the amount control, recalculates macros, resolves the clarification after a choice, and reports no new console or failed-network errors.

- [ ] **Step 5: Record release status**

Report the merged commit, deployment health, exact production behavior, and any environment-only verification caveat.
