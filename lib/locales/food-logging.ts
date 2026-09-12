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
  'food.add_more': { en: "Add more", es: "Añadir más", el: "Προσθήκη κι άλλων" },
  'food.add_note_placeholder': { en: "Add a note about this meal...", es: "Añade una nota sobre esta comida...", el: "Πρόσθεσε σημείωση για αυτό το γεύμα..." },
  'food.add_note_aria': { en: "Add a note", es: "Añadir una nota", el: "Προσθήκη σημείωσης" },
  'food.community_data': { en: "Community data", es: "Datos de la comunidad", el: "Δεδομένα κοινότητας" },
  'food.photo_pick_aria': { en: "Take or upload a food photo", es: "Haz o sube una foto de comida", el: "Τράβηξε ή ανέβασε φωτογραφία φαγητού" },
  'food.barcode_scan_aria': { en: "Scan a barcode", es: "Escanea un código de barras", el: "Σάρωσε ένα barcode" },
  'food.quick_add_fallback': { en: "Quick add — {kcal} kcal", es: "Añadido rápido — {kcal} kcal", el: "Γρήγορη προσθήκη — {kcal} kcal" },
  'food.edit.quantity_aria': { en: 'Quantity in {unit}', es: 'Cantidad en {unit}', el: 'Ποσότητα σε {unit}' },
};
