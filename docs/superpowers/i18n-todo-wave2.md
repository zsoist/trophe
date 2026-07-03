# i18n TODO — woah wave 2 (2026-07-03)

New client-facing strings hardcoded in English during woah wave 2 (W6 narrative
day pill, W8 streak ember, W13 undo countdown, W12 barcode snap-lock).
lib/i18n.tsx is owned by a follow-up pass — add these keys there and swap the
hardcoded literals for `t()` calls.

Format: `key | en | es | el` (es/el are draft translations — review before shipping).

## app/dashboard/log/page.tsx (W6 narrative day pill)

key | en | es | el
--- | --- | --- | ---
food.pill_protein_to_go | {n}g to go | faltan {n}g | {n}g ακόμη
food.pill_delta_nice | +{n}g — nice | +{n}g — ¡bien! | +{n}g — ωραία
food.pill_protein_done | Protein ✓ | Proteína ✓ | Πρωτεΐνη ✓
food.pill_kcal_left | {n} kcal left | {n} kcal restantes | {n} kcal απομένουν
food.pill_kcal_over | {n} kcal over | {n} kcal excedidas | {n} kcal πάνω

Note: `food.pill_kcal_left` / `food.pill_kcal_over` replace the old F7 pill's
`food.remaining` / `food.over_budget` usage (same copy, all languages already
exist under those keys) — the number is now a separate `<AnimatedValue>` so the
swap needs a split-string or rich-interpolation approach, not plain `{n}`.

## app/dashboard/log/page.tsx (W8 streak ember)

key | en | es | el
--- | --- | --- | ---
log.streak_ember_aria | {n}-day streak | racha de {n} días | σερί {n} ημερών

## W13 / W12 — no new strings

W13 reuses `food.entry_deleted` / `food.undo_delete`; the reduced-motion "(5s)"
literal matches the batch toast's untranslated "(10s)" precedent. W12 adds no
copy (BarcodeLookupModal is already hardcoded English end-to-end — pre-existing,
tracked separately).
