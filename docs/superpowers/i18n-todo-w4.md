# i18n TODO — W4 "provenance passport" (2026-07-03)

New client-facing strings hardcoded in English during the W4 provenance pass in
`components/food/ParsedFoodList.tsx` + `components/food/ProvenanceRing.tsx`.
`lib/i18n.tsx` is owned by a follow-up pass — add these keys there and swap the
hardcoded literals for `t()` calls.

Format: `key | en | es | el` (es/el are draft translations — review before shipping).

## Tap-to-explain provenance captions (ParsedFoodList.tsx — TIER_CAPTION)

key | en | es | el
--- | --- | --- | ---
food.prov_caption_lab | Matched lab-verified data | Coincide con datos verificados en laboratorio | Ταιριάζει με εργαστηριακά επιβεβαιωμένα δεδομένα
food.prov_caption_label | Matched a nutrition label | Coincide con una etiqueta nutricional | Ταιριάζει με ετικέτα διατροφής
food.prov_caption_crowdsourced | Community-sourced — adjust if needed | De la comunidad — ajusta si es necesario | Από την κοινότητα — προσάρμοσε αν χρειάζεται
food.prov_caption_estimated | Estimated from your description — adjust if needed | Estimado a partir de tu descripción — ajusta si es necesario | Εκτίμηση από την περιγραφή σου — προσάρμοσε αν χρειάζεται

## data_quality micro-chip labels (ParsedFoodList.tsx — getQualityChip)

Mono uppercase tokens rendered next to the brand chip. Kept SHORT for the 10px
chip; translations should stay short too (they render uppercase, letter-spaced).

key | en | es | el
--- | --- | --- | ---
food.prov_chip_lab | LAB | LAB | ΕΡΓ
food.prov_chip_label | LABEL | ETIQUETA | ΕΤΙΚΕΤΑ
food.prov_chip_community | COMMUNITY | COMUNIDAD | ΚΟΙΝΟΤΗΤΑ
food.prov_chip_ai_estimate | AI ESTIMATE | ESTIMACIÓN IA | ΕΚΤΙΜΗΣΗ AI

## Provenance ring aria-label (ProvenanceRing via ParsedFoodList)

key | en | es | el
--- | --- | --- | ---
food.prov_ring_aria | Show where this data came from | Ver de dónde vienen estos datos | Δες από πού προέρχονται τα δεδομένα

Notes:
- The `≈{min}–{max} kcal` range text and the settled `≈{center} kcal` figure both
  reuse the existing `food.range_approx` key — no new key needed (the settle is a
  pure animation over the same numbers).
- The "community data" hint for OFF products is unchanged (prior wave); the W4
  COMMUNITY chip is intentionally suppressed for `db_source==='off'` to avoid
  double-labeling, so `food.prov_chip_community` only renders for non-OFF
  crowdsourced rows.
