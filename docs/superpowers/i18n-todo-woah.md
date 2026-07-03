# i18n TODO — food-input "woah" layer (2026-07-03)

New client-facing strings hardcoded in English during the food-logging woah
pass (W1 parse narration, W5 stepper physics, W3 macro ribbons, W10 next-slot
invitation, batch undo, recipe entry point). lib/i18n.tsx is owned by a
follow-up pass — add these keys there and swap the hardcoded literals for
`t()` calls.

Format: `key | en | es | el` (es/el are draft translations — review before shipping).

## components/food/QuickFoodInput.tsx (W1 parse narration)

key | en | es | el
--- | --- | --- | ---
food.parse_stage_reading | reading your meal… | leyendo tu comida… | διαβάζουμε το γεύμα σου…
food.parse_stage_matching | matching 43,000 foods… | consultando 43.000 alimentos… | αντιστοίχιση 43.000 τροφίμων…
food.parse_stage_weighing | weighing portions… | pesando porciones… | ζυγίζουμε τις μερίδες…
food.parse_stage_still | still working — bigger meals take a few extra seconds… | seguimos trabajando — las comidas grandes tardan unos segundos más… | ακόμα δουλεύουμε — τα μεγάλα γεύματα θέλουν λίγα δευτερόλεπτα παραπάνω…

## components/food/ParsedFoodList.tsx (W5 stepper aria labels)

key | en | es | el
--- | --- | --- | ---
food.stepper_decrease | Decrease amount | Reducir cantidad | Μείωση ποσότητας
food.stepper_increase | Increase amount | Aumentar cantidad | Αύξηση ποσότητας

## components/meals/MealSlotCard.tsx + app/dashboard/log/page.tsx (W10 invitation)

key | en | es | el
--- | --- | --- | ---
food.next_slot_protein | {slot} — {n}g protein keeps you on pace | {slot} — {n}g de proteína te mantienen al ritmo | {slot} — {n}γρ πρωτεΐνη σε κρατούν σε ρυθμό
food.next_slot_kcal | {slot} — {n} kcal left today | {slot} — quedan {n} kcal hoy | {slot} — απομένουν {n} kcal σήμερα

## app/dashboard/log/page.tsx (batch undo + recipe entry)

key | en | es | el
--- | --- | --- | ---
log.batch_logged | Logged {n} items | {n} alimentos registrados | Καταγράφηκαν {n} τρόφιμα
log.batch_logged_one | Logged 1 item | 1 alimento registrado | Καταγράφηκε 1 τρόφιμο
log.batch_undo_aria | Undo logging {n} items | Deshacer registro de {n} alimentos | Αναίρεση καταγραφής {n} τροφίμων
food.analyze_recipe | Analyze recipe | Analizar receta | Ανάλυση συνταγής
food.analyze_recipe_aria | Analyze a recipe | Analizar una receta | Ανάλυση μιας συνταγής

Notes:
- The batch-undo button label reuses the existing `food.undo_delete` key ("Undo").
- The reduced-motion countdown fallback "(10s)" is numeric-only — no i18n needed.
- `food.parse_stage_still` replaces the previous hardcoded "Still working —
  bigger meals take a few extra seconds…" line (same copy, now stage 4 of the
  narration).
