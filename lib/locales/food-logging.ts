import type { CoreLanguage } from '../types';

/** Food-only copy stays with the food UI, outside unrelated route bundles. */
export const foodLoggingTranslations: Record<string, Record<CoreLanguage, string>> = {
  'food.manual_name_placeholder': { en: "Food name (optional)", es: "Nombre del alimento (opcional)", el: "Όνομα τροφίμου (προαιρετικό)" },
  'food.manual_kcal_label': { en: "kcal *", es: "kcal *", el: "kcal *" },
  'food.parse_failed_connection': { en: "Failed to parse food — check your connection", es: "No se pudo analizar el alimento — revisa tu conexión", el: "Δεν ήταν δυνατή η ανάλυση — έλεγξε τη σύνδεσή σου" },
  'food.photo_timeout': { en: "Photo analysis timed out — try again", es: "El análisis de la foto tardó demasiado — inténtalo de nuevo", el: "Το χρονικό όριο της ανάλυσης φωτογραφίας έληξε — δοκίμασε ξανά" },
  'food.photo_failed_connection': { en: "Failed to analyze photo — check your connection", es: "No se pudo analizar la foto — revisa tu conexión", el: "Δεν ήταν δυνατή η ανάλυση της φωτογραφίας — έλεγξε τη σύνδεσή σου" },
  'food.photo_invalid_type': { en: "Please choose an image file.", es: "Elige un archivo de imagen.", el: "Διάλεξε αρχείο εικόνας." },
  'food.answer_aria': { en: "Answer the clarification question", es: "Responde la pregunta de aclaración", el: "Απάντησε στην ερώτηση διευκρίνισης" },
  'food.answer_submit_aria': { en: "Submit answer and re-analyze", es: "Enviar respuesta y volver a analizar", el: "Υποβολή απάντησης και νέα ανάλυση" },
  'food.quick_submit_aria': { en: "Analyze meal", es: "Analizar comida", el: "Ανάλυση γεύματος" },
  'food.add_more': { en: "Add more", es: "Añadir más", el: "Προσθήκη κι άλλων" },
  'food.add_note_placeholder': { en: "Add a note about this meal...", es: "Añade una nota sobre esta comida...", el: "Πρόσθεσε σημείωση για αυτό το γεύμα..." },
  'food.add_note_aria': { en: "Add a note", es: "Añadir una nota", el: "Προσθήκη σημείωσης" },
  'food.community_data': { en: "Community data", es: "Datos de la comunidad", el: "Δεδομένα κοινότητας" },
  'food.photo_pick_aria': { en: "Take or upload a food photo", es: "Haz o sube una foto de comida", el: "Τράβηξε ή ανέβασε φωτογραφία φαγητού" },
  'food.barcode_scan_aria': { en: "Scan a barcode", es: "Escanea un código de barras", el: "Σάρωσε ένα barcode" },
  'food.quick_add_fallback': { en: "Quick add — {kcal} kcal", es: "Añadido rápido — {kcal} kcal", el: "Γρήγορη προσθήκη — {kcal} kcal" },
  'food.edit.quantity_aria': { en: 'Quantity in {unit}', es: 'Cantidad en {unit}', el: 'Ποσότητα σε {unit}' },
  // Close button of the barcode sheet. Was referenced as `barcode.close` but defined
  // nowhere, so the aria-label rendered the raw key in every locale.
  'barcode.close': { en: "Close", es: "Cerrar", el: "Κλείσιμο" },
  // Visible action-row labels in QuickFoodInput (previously hard-coded English).
  'food.action_photo': { en: "Photo", es: "Foto", el: "Φωτογραφία" },
  'food.action_barcode': { en: "Barcode", es: "Código", el: "Barcode" },
  // ParsedFoodList empty-state back button (shown after removing every reviewed item).
  'food.back': { en: "Back", es: "Atrás", el: "Πίσω" },
  // Recipe analyzer modal — shipped as hard-coded English; the analyzer also
  // ignored the UI language (posted language:'en'), so both are fixed here.
  'food.recipe_paste_label': { en: "Paste recipe", es: "Pega la receta", el: "Επικόλληση συνταγής" },
  'food.recipe_servings_yielded': { en: "Servings yielded", es: "Porciones obtenidas", el: "Μερίδες που προκύπτουν" },
  'food.recipe_analyzing': { en: "Analyzing…", es: "Analizando…", el: "Ανάλυση…" },
  'food.recipe_analyze_action': { en: "Analyze recipe", es: "Analizar receta", el: "Ανάλυση συνταγής" },
  'food.recipe_close_aria': { en: "Close recipe analyzer", es: "Cerrar el analizador de recetas", el: "Κλείσιμο ανάλυσης συνταγής" },
  'food.recipe_heading': { en: "Recipe", es: "Receta", el: "Συνταγή" },
  'food.recipe_meta': { en: "{servings} serving(s) · {ingredients} ingredient(s)", es: "{servings} porción(es) · {ingredients} ingrediente(s)", el: "{servings} μερίδα(-ες) · {ingredients} συστατικό(-ά)" },
  'food.recipe_total': { en: "Total ({n} servings)", es: "Total ({n} porciones)", el: "Σύνολο ({n} μερίδες)" },
  'food.recipe_show_breakdown': { en: "Show ingredient breakdown", es: "Ver desglose de ingredientes", el: "Εμφάνιση ανάλυσης συστατικών" },
  'food.recipe_hide_breakdown': { en: "Hide ingredient breakdown", es: "Ocultar desglose de ingredientes", el: "Απόκρυψη ανάλυσης συστατικών" },
  'food.recipe_servings_question': { en: "How many servings did you eat?", es: "¿Cuántas porciones comiste?", el: "Πόσες μερίδες έφαγες;" },
  'food.recipe_meal_label': { en: "Meal", es: "Comida", el: "Γεύμα" },
  'food.recipe_edit': { en: "Edit recipe", es: "Editar receta", el: "Επεξεργασία συνταγής" },
  'food.recipe_log': { en: "Log", es: "Registrar", el: "Καταγραφή" },
  // Manual-entry + review validation copy (was hard-coded English in QuickFoodInput).
  'food.err_manual_calories_range': { en: "Enter calories between 1 and 10,000.", es: "Ingresa calorías entre 1 y 10.000.", el: "Εισάγετε θερμίδες μεταξύ 1 και 10.000." },
  'food.err_manual_macro_range': { en: "Protein, carbs, and fat must each be between 0 and 1,000 g.", es: "Proteína, carbohidratos y grasa deben estar entre 0 y 1.000 g.", el: "Πρωτεΐνη, υδατάνθρακες και λίπος πρέπει να είναι μεταξύ 0 και 1.000 g." },
  'food.err_manual_name_long': { en: "Keep the food name under 200 characters.", es: "Mantén el nombre del alimento por debajo de 200 caracteres.", el: "Κράτησε το όνομα τροφίμου κάτω από 200 χαρακτήρες." },
  'food.err_item_amount': { en: "One or more items has an invalid amount. Adjust the portion and try again.", es: "Uno o más alimentos tienen una cantidad no válida. Ajusta la porción e inténtalo de nuevo.", el: "Ένα ή περισσότερα τρόφιμα έχουν μη έγκυρη ποσότητα. Προσάρμοσε τη μερίδα και δοκίμασε ξανά." },
};
