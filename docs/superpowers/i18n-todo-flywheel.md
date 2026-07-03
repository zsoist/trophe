# i18n TODO — Correction flywheel edit UIs (branch mission/food-input-10)

New English strings hardcoded during the correction-flywheel capture work
(MealSlotCard detail editor + MealPatternView coach editor). The orchestrator
integrates these into lib/i18n.tsx / lib/locales/* (files off-limits to the
build agent).

Format: `key | en | es | el`

## Entry detail editor (MealSlotCard + MealPatternView)

food.edit.details | Edit details | Editar detalles | Επεξεργασία λεπτομερειών
food.edit.name | Name | Nombre | Όνομα
food.edit.grams | Grams | Gramos | Γραμμάρια
food.edit.kcal | Kcal | Kcal | Kcal
food.edit.protein | Protein | Proteína | Πρωτεΐνη
food.edit.carbs | Carbs | Carbohidratos | Υδατάνθρακες
food.edit.fat | Fat | Grasa | Λίπος
food.edit.sugar | Sugar | Azúcar | Ζάχαρη
food.edit.save | Save | Guardar | Αποθήκευση
food.edit.saveQuantity | Save quantity | Guardar cantidad | Αποθήκευση ποσότητας
food.edit.decreaseGrams | Decrease grams | Reducir gramos | Μείωση γραμμαρίων
food.edit.increaseGrams | Increase grams | Aumentar gramos | Αύξηση γραμμαρίων

## Coach meal pattern view (AI chip + editor)

coach.mealPattern.aiLogged | AI-logged | Registrado por IA | Καταγραφή με AI
coach.mealPattern.aiLoggedTitle | Parsed by AI — edits train the parser | Analizado por IA — las ediciones entrenan el analizador | Αναλύθηκε από AI — οι διορθώσεις εκπαιδεύουν τον αναλυτή
coach.mealPattern.editEntry | Edit entry | Editar entrada | Επεξεργασία καταχώρισης
coach.mealPattern.cancel | Cancel | Cancelar | Άκυρο
