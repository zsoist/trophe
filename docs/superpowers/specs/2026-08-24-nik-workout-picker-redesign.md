# Nik workout exercise picker redesign

**Date:** 2026-08-24  
**Surface:** `components/workout/ExercisePicker.tsx`  
**Mode:** Operate  
**Status:** Approved for implementation and production deployment

## Problem

The existing picker put the complete exercise catalogue on the first screen. Nik described the resulting long, dense list as “not user friendly at all” and asked to choose a target muscle group first, then see relevant exercise options.

The primary user job is singular: add the exercise they intend to perform with as little scanning as possible.

## Research inputs

- [Hevy exercise library](https://help.hevyapp.com/hc/en-us/articles/35688251991575-Hevy-Exercise-Library-400-Exercises-and-Custom-Exercises): search, target-muscle/equipment filters, recents, and custom exercises.
- [JEFIT exercise database](https://cdn.jefit.com/exercises): muscle-first discovery before exposing the full exercise database.
- [Fitbod app features](https://help.fitbod.me/hc/en-us/sections/360012732693-App-Features): workout context organized around muscle groups and available equipment.
- [Strong & Fit exercise selection](https://strongandfit.app/help/workouts/exercises/): body-area grouping, search aliases, equipment context, and clear exercise metadata.

The sources converge on progressive disclosure: establish training intent first, then expose the relevant subset. Trophē adopts that interaction pattern without copying another product’s visual identity.

## Approved flow

### Entry state

- Keep global exercise search visible as an expert shortcut.
- Present eight body areas: Chest, Back, Shoulders, Arms, Legs, Core, Full body, and Cardio.
- Aggregate Biceps/Triceps/Forearms under Arms and Quads/Hamstrings/Glutes/Calves under Legs.
- Do not render the complete exercise catalogue or its intimidating total count on this screen.
- Keep up to six recent exercises as quiet quick-add controls below the body-area decision.
- When a workout split supplies preset muscles, move its relevant body areas first without hiding any alternative.

### Exercise state

- Show only exercises belonging to the selected body area.
- Reveal specific muscle chips only for aggregated areas.
- Reveal equipment filtering only after intent is established and only when multiple equipment types exist.
- Sort recents first, then compound movements, then alphabetically.
- Use one visible, named Add action per row; keep Info separate.
- Preserve custom-exercise creation as a secondary footer action.

### Search state

- Search the full catalogue across the displayed name, English/Spanish/Greek names, and equipment.
- Rank prefix matches first, then apply the same recent/compound ordering.
- Clearing search returns to the previous simple entry state.

## Visual and accessibility contract

- Preserve Trophē’s semantic token system and restrained gold accent in both light and dark themes.
- Mobile-first at 390×844; four-column body-area layout and two-column result list at larger widths.
- Minimum 44px interactive targets and 16px mobile inputs.
- Dialog semantics, body scroll lock, focus trap, Escape close, focus restoration, and reduced-motion support remain intact.
- Programmatic focus starts on the first body area rather than forcing the search field.
- All user-visible copy is routed through `useI18n()`; English remains the current product language.

## Non-goals

- No AI exercise recommendation, paid model call, schema migration, or API change.
- No change to set logging, workout persistence, exercise information, or custom-exercise storage.
- No broad visual rebrand outside the exercise picker.

## Verification

- Rendered interaction tests cover entry, body-area selection, aggregate filters, search, equipment, recent ordering, preset prioritization, Add/Info separation, navigation, Escape, and focus restoration.
- Copy contract prevents untranslated key leakage.
- Required repository gates: typecheck, lint, Vitest, and production build.
- Final Impeccable detector and bounded mobile/desktop theme inspection before deployment.
