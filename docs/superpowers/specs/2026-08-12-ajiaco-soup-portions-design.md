# Ajiaco Soup Portions Design

**Status:** Approved on 2026-08-12 through the user's "approved for all" instruction

## Outcome

Ajiaco and other foods measured in natural containers must be editable in terms a person can estimate. For a soup returned as `1 bowl / 550 g`, Trophy must show Small, Medium, and Large choices with bowl amounts, keep grams as the nutrition-calculation base, and resolve the portion clarification after a choice.

## Root Contract

The UI currently trusts `portion_explicit` even when the parser also returns a portion clarification question. Those fields contradict each other. For a single parsed item, a recognized portion question is authoritative: the item remains estimated until the user chooses a size or edits the amount.

This repair belongs in the shared portion-control domain rather than as an ajiaco name exception. It applies to any supported food with the same payload shape.

## Interaction Design

- Natural container units such as `bowl`, `cup`, `glass`, `plate`, `serving`, and their supported localized forms use the parsed quantity as the editable display amount.
- Ajiaco parsed as `550 g`, `quantity: 1`, `unit: bowl` displays `1 bowl`, not `550 g`, while macros remain proportional to the internal 550-gram value.
- Small, Medium, and Large preserve the existing `0.7x`, `1x`, and `1.4x` nutrition multipliers. Their secondary labels use the natural unit (`0.7 bowl`, `1 bowl`, `1.4 bowls`) instead of grams.
- The exact amount field accepts decimal natural portions and increments containers by `0.25`; typing or choosing a value recalculates grams and macros proportionally.
- A single-item portion clarification displays the choices even if the provider incorrectly marked the initial item explicit. After a valid choice or edit, the portion question disappears.
- Mass foods continue to display grams and physical volume units continue to use their existing conversion path.

## Architecture

`components/food/portion-controls.ts` owns pure classification and conversion functions:

- recognizing natural portion units;
- deciding when a single-item portion question overrides `portion_explicit`;
- converting internal grams to a user-facing amount and back;
- formatting localized singular/plural unit labels through caller-provided copy.

`components/food/ParsedFoodList.tsx` consumes those functions. It normalizes the initial contradiction, renders one source of portion choices, edits the human-facing amount, and removes the resolved clarification card.

No parser prompt, database row, migration, or dependency changes are required. The fix handles current and future parser providers at the review boundary.

## Error Handling

- Missing, zero, or invalid quantities fall back to gram display rather than producing an invalid conversion.
- Draft values may be empty while editing, but only finite positive values commit.
- The existing 1-to-15,000-gram safety clamp remains authoritative after conversion.
- Multi-item clarification questions do not silently mark every item estimated; only an already-implicit item receives controls unless the question identifies a single item.

## Verification

Test-first coverage must prove:

- the exact ajiaco payload (`550 g`, `1 bowl`, explicit flag plus portion question) is treated as estimated;
- option labels are expressed in bowls while option values remain 385, 550, and 770 grams;
- `1.25 bowl` converts to the proportional gram value and can be committed;
- ordinary gram and milliliter items retain their behavior;
- selecting a size resolves the warning in the rendered component contract;
- typecheck, lint, focused tests, full unit tests, production build, and mobile browser QA pass.
