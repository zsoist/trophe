# Nik English Nutrition Feedback Design

**Status:** Approved on 2026-08-20

## Outcome

Nik's client experience must feel like one coherent English product, record the food name he actually expects to see, make photo logging useful for Colombian mixed dishes, and give him an honest daily nutrition readout. The release is complete only after local zero-paid verification, authenticated browser QA, review, CI, production deployment, and a production canary.

## First-page experience

- Render one plain greeting line such as `Good afternoon, Nik,` using the normal product typeface. Remove the decorative duplicate gold name treatment.
- Keep the avatar, English date, streak, and dual-role `Coach view` action.
- Remove the dashboard's duplicate theme control because `AppHeader` already owns the global theme toggle.
- Preserve 44px controls, focus-visible treatment, light/dark contrast, reduced motion, and the existing mobile bottom-nav reserve.

## English beta language contract

- The authenticated product runs in English-only beta mode for this release. `I18nProvider` must ignore and replace stale `trophe_lang` values such as `el` or `es`, set `<html lang="en">`, and expose English as the only selectable runtime language.
- The profile language UI explains that additional languages are temporarily unavailable while English is stabilized. Translation dictionaries stay in the repository for later reactivation.
- User-entered cultural dish names are valid input. Generated UI copy, parsed review names, saved log names, navigation, and dashboard labels are English.
- Coach-authored meal-plan text is data rather than interface copy. Nik's active Greek rows require a separate, reversible, exact-row production repair after the code is verified.

## Canonical food display names

- Add one pure display-name boundary. In English beta it chooses a trimmed canonical English `food_name`, falling back to raw input and only then a localized name.
- `QuickFoodInput` must use that boundary both in review-visible behavior and at the `food_log.food_name` persistence boundary. Input such as `custom beans` must not save as `frijoles` merely because `name_localized` contains Spanish.
- Preserve `raw_text`, `food_id`, parse source, and correction telemetry so accuracy learning is not lost.
- Branded food fidelity remains unchanged: a canonical English brand/product name is preserved, not replaced with a generic invention.

## Photo analysis and Bandeja Paisa

- Keep exactly one paid vision request. The model identifies the dish and visible components, provides editable gram estimates, uncertainty, fiber, and sugar, but the response never implies scale-level precision.
- Version the photo prompt as `agents/prompts/photo-analyze.v1.md`; route code must not retain an unversioned inline rule block.
- Normalize every returned component independently. Reject implausible macro mass, clamp unanchored confidence to 0.75, and preserve valid siblings when one component is bad.
- Apply a deterministic known-dish component check after provider output. For Bandeja Paisa, compare visible results with rice, beans, beef, chicharrón/pork belly, egg, plantain, arepa, and avocado. Beans must remain a first-class editable component when identified, and an omitted high-confidence beans component may be added as `needs_confirmation` using the conservative benchmark portion. Components not visibly supported must never be marked certain.
- Convert fiber and sugar from the normalized response instead of hardcoding them to zero.
- All route tests use injected or mocked provider/grounding boundaries. No paid transport is allowed during implementation or CI.

## Sugar and daily nutrition note

- The dashboard labels the metric `Total sugar`, not `S`, and never compares total sugar to the WHO free-sugar guideline.
- A pure aggregation boundary returns total sugar plus completeness: `complete`, `partial`, or `unknown`. Any logged row with `sugar_g === null` makes the day partial; zero is valid only when every logged row has a known zero.
- The dashboard shows `Not available` for unknown and an `Incomplete` qualifier for partial data. It must not silently convert missing nutrients to zero.
- An always-visible `Today's note` card sits immediately below the nutrition hero. It is deterministic and costs $0. It produces one concise observation based on data completeness, protein progress, fiber, hydration, meal variety, or overall progress.
- The note may state total sugar or its completeness but must not diagnose excessive sugar because the schema stores total sugar, not added/free sugar.

## Existing Nik data repair

- Use a checked-in, dry-run-first operations script. Identify the exact Nik account by an operator-supplied user ID or unique email, never fuzzy name alone.
- Before mutation, export the exact profile language and active `meal_plan_entries` rows to a timestamped local JSON backup outside Git.
- Update only the selected profile language and explicitly mapped meal-plan row IDs. Verify returned row IDs and values; abort if counts differ.
- Do not use an AI translation. English meal-plan text is reviewed, explicit data supplied to the script.
- No schema migration is required.

## Verification and release

- Every production behavior begins with an assertion-level failing test and ends with focused green tests.
- Run Node 24 typecheck, scoped lint, full Vitest, zero-paid provider contracts, theme guard, and a production build.
- Run authenticated Chromium at 390x844 and desktop in light/dark. Prove the clean greeting, single theme toggle, English navigation/plan, canonical beans name, explicit Total sugar state, Today's note, and editable photo-component review with mocked transport.
- Inspect screenshots for loading, clipping, mixed language, low contrast, and wrong-route states.
- Open a PR, wait for required CI, merge, wait for the Vercel production deployment, and run a read-only production canary. Deployment is not complete until the live health and user-visible English/dashboard checks pass.

## Global constraints

- Node.js 24 is authoritative for local verification.
- No new dependency and no database migration.
- No paid AI calls during implementation, automated tests, build, CI, or canary.
- Exactly one provider call remains in the photo flow when it is used by a real user.
- Preserve existing authentication, RLS, role switching, privacy, food-correction telemetry, and calorie-visibility preferences.
- Do not delete translation dictionaries or historical prompt versions.
