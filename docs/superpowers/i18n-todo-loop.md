# i18n TODO — AI food-input loop fix (2026-07-03, mission/food-input-10)

New user-facing strings hardcoded in English during the food-input loop repair
(clarification loop, error taxonomy, safety-layer surfacing). lib/i18n.tsx is
owned by another lane — add these keys there and swap the literals for `t()`.

Format: `key | en | es | el` (es/el are draft translations — review before shipping).

## components/food/QuickFoodInput.tsx

key | en | es | el
--- | --- | --- | ---
food.err_ai_busy | The AI had trouble with that one — please try again in a moment. | La IA tuvo problemas con eso — inténtalo de nuevo en un momento. | Το AI δυσκολεύτηκε με αυτό — δοκίμασε ξανά σε λίγο.
food.err_try_rephrase | Could not read that as food — try rephrasing, e.g. "2 eggs and a slice of toast". | No se pudo interpretar como comida — reformúlalo, p. ej. "2 huevos y una tostada". | Δεν αναγνωρίστηκε ως φαγητό — δοκίμασε αλλιώς, π.χ. «2 αυγά και μια φέτα ψωμί».
food.err_too_long | That entry is too long — keep it under 500 characters, or log the meal in parts. | Esa entrada es muy larga — mantenla bajo 500 caracteres o registra la comida por partes. | Πολύ μεγάλη καταχώρηση — κράτησέ τη κάτω από 500 χαρακτήρες ή κατέγραψε το γεύμα τμηματικά.
food.err_rate_limited | Too many requests right now — give it a moment and try again. | Demasiadas solicitudes — espera un momento e inténtalo de nuevo. | Πάρα πολλά αιτήματα — περίμενε λίγο και δοκίμασε ξανά.
food.err_timeout | This took longer than expected — please try again. | Tardó más de lo esperado — inténtalo de nuevo. | Πήρε περισσότερο από το αναμενόμενο — δοκίμασε ξανά.
food.still_working | Still working — bigger meals take a few extra seconds… | Todavía trabajando — las comidas grandes tardan unos segundos más… | Ακόμα δουλεύει — τα μεγάλα γεύματα θέλουν λίγα δευτερόλεπτα παραπάνω…
food.retry_in | Retry ({n}s) | Reintentar ({n}s) | Επανάληψη ({n}s)
food.quick_question | Quick question | Pregunta rápida | Γρήγορη ερώτηση
food.answer_placeholder | Type your answer… | Escribe tu respuesta… | Γράψε την απάντησή σου…
food.photo_estimates_note | Photo portions are estimates. Review each amount before logging. | Las porciones de la foto son estimaciones. Revisa cada cantidad antes de registrar. | Οι μερίδες από φωτογραφία είναι εκτιμήσεις. Έλεγξε κάθε ποσότητα πριν την καταχώρηση. *(existing string, now load-bearing in the banner)*
food.voice_unsupported | Voice input not supported in this browser | El navegador no admite entrada por voz | Ο browser δεν υποστηρίζει φωνητική εισαγωγή *(existing string)*

## components/food/ParsedFoodList.tsx

key | en | es | el
--- | --- | --- | ---
food.answer_refine_placeholder | Answer to refine… | Responde para afinar… | Απάντησε για διευκρίνιση…
food.warn_low_protein | Low protein — consider adding eggs, chicken, or yogurt | Poca proteína — añade huevos, pollo o yogur | Λίγη πρωτεΐνη — πρόσθεσε αυγά, κοτόπουλο ή γιαούρτι *(existing string, now rendered in the save bar)*
food.warn_carb_heavy | Very carb-heavy — consider balancing with protein or fat | Muy alto en carbohidratos — equilibra con proteína o grasa | Πολλοί υδατάνθρακες — ισορρόπησε με πρωτεΐνη ή λίπος *(existing string, now rendered in the save bar)*
food.large_meal_detected | Large meal detected | Comida abundante detectada | Εντοπίστηκε μεγάλο γεύμα *(client-side rewrite of the kcal warning when showCalories=false)*
food.range_approx | ≈{min}–{max} kcal | ≈{min}–{max} kcal | ≈{min}–{max} kcal

## components/food/RecipeAnalyzerModal.tsx

key | en | es | el
--- | --- | --- | ---
food.recipe_timeout | Recipe analysis timed out — please try again | El análisis de la receta expiró — inténtalo de nuevo | Η ανάλυση συνταγής έληξε — δοκίμασε ξανά

## Server-side strings (not t()-able client-side — need localized generation)

- `app/api/food/parse/route.ts` error-taxonomy `message` strings are English
  only; the client maps `code` → local copy, so once the `food.err_*` keys land
  the server copy is a fallback.
- `agents/food-parse/index.v4.ts` `warnings[]` ("Portions estimated — confirm
  before saving", "Unusually large quantity (…)", "High-calorie meal detected
  (…)") are English-only and rendered verbatim in ParsedFoodList — needs a
  server-side language pass or code-based warnings later.
- Photo `accuracy_note` comes from the vision model in English.
