// ═══════════════════════════════════════════════
// τροφή (Trophē) — Trilingual i18n System (EN/ES/EL)
// ═══════════════════════════════════════════════

'use client';

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { Language, CoreLanguage } from './types';

// Overlay locales: flat key→string maps with EN fallback for missing keys.
// Core languages (EN/ES/EL) stay inline below so the compiler enforces full coverage.
//
// PERF: overlays are LAZY-LOADED via dynamic import — statically importing all five
// (~197KB raw) put them in the shared client chunk of every route, including the
// landing page, for users who will never leave en/es/el. Each locale becomes its
// own async chunk fetched only when that language is actually selected.
const OVERLAYS: Partial<Record<Language, Record<string, string>>> = {};

type OverlayLang = 'fr' | 'de' | 'it' | 'pt' | 'nl';
const OVERLAY_LOADERS: Record<OverlayLang, () => Promise<Record<string, string>>> = {
  fr: () => import('./locales/fr').then((m) => m.fr),
  de: () => import('./locales/de').then((m) => m.de),
  it: () => import('./locales/it').then((m) => m.it),
  pt: () => import('./locales/pt').then((m) => m.pt),
  nl: () => import('./locales/nl').then((m) => m.nl),
};

function isOverlayLang(lang: Language): lang is OverlayLang {
  return lang in OVERLAY_LOADERS;
}

// ─── Translation Dictionary ───
const translations: Record<string, Record<CoreLanguage, string>> = {
  // ── App ──
  'app.name': { en: 'Trophē', es: 'Trophē', el: 'τροφή' },
  'app.tagline': { en: 'One habit. Two weeks. Transform.', es: 'Un hábito. Dos semanas. Transforma.', el: 'Μία συνήθεια. Δύο εβδομάδες. Μεταμόρφωση.' },
  'app.subtitle': { en: 'Precision Nutrition Coaching', es: 'Coaching de Nutrición de Precisión', el: 'Coaching Διατροφής Ακριβείας' },

  // ── Auth ──
  'auth.login': { en: 'Log in', es: 'Iniciar sesión', el: 'Σύνδεση' },
  'auth.signup': { en: 'Sign up', es: 'Registrarse', el: 'Εγγραφή' },
  'auth.email': { en: 'Email', es: 'Correo electrónico', el: 'Email' },
  'auth.password': { en: 'Password', es: 'Contraseña', el: 'Κωδικός' },
  'auth.magic_link': { en: 'Send magic link', es: 'Enviar enlace mágico', el: 'Αποστολή magic link' },
  'auth.or': { en: 'or', es: 'o', el: 'ή' },
  'auth.logout': { en: 'Log out', es: 'Cerrar sesión', el: 'Αποσύνδεση' },
  'auth.role_select': { en: 'I am a...', es: 'Soy un...', el: 'Είμαι...' },
  'auth.role_client': { en: 'Client', es: 'Cliente', el: 'Πελάτης' },
  'auth.role_coach': { en: 'Coach', es: 'Coach', el: 'Coach' },

  // ── Onboarding ──
  'onboard.welcome': { en: 'Welcome to Trophē', es: 'Bienvenido a Trophē', el: 'Καλώς ήρθατε στο τροφή' },
  'onboard.lets_start': { en: "Let's build your profile", es: 'Vamos a crear tu perfil', el: 'Ας φτιάξουμε το προφίλ σου' },
  'onboard.body_stats': { en: 'Body Stats', es: 'Datos Corporales', el: 'Σωματικά Στοιχεία' },
  'onboard.your_goal': { en: 'Your Goal', es: 'Tu Objetivo', el: 'Ο Στόχος σου' },
  'onboard.activity': { en: 'Activity Level', es: 'Nivel de Actividad', el: 'Επίπεδο Δραστηριότητας' },
  'onboard.your_plan': { en: 'Your Plan', es: 'Tu Plan', el: 'Το Πλάνο σου' },
  'onboard.age': { en: 'Age', es: 'Edad', el: 'Ηλικία' },
  'onboard.sex': { en: 'Sex', es: 'Sexo', el: 'Φύλο' },
  'onboard.male': { en: 'Male', es: 'Masculino', el: 'Άνδρας' },
  'onboard.female': { en: 'Female', es: 'Femenino', el: 'Γυναίκα' },
  'onboard.height': { en: 'Height (cm)', es: 'Altura (cm)', el: 'Ύψος (cm)' },
  'onboard.weight': { en: 'Weight (kg)', es: 'Peso (kg)', el: 'Βάρος (kg)' },
  'onboard.next': { en: 'Next', es: 'Siguiente', el: 'Επόμενο' },
  'onboard.back': { en: 'Back', es: 'Atrás', el: 'Πίσω' },
  'onboard.finish': { en: 'Start my journey', es: 'Comenzar mi viaje', el: 'Ξεκινώ το ταξίδι μου' },
  'onboard.daily_target': { en: 'Your daily target', es: 'Tu objetivo diario', el: 'Ημερήσιος στόχος' },
  'onboard.coach_assign': { en: 'Your coach will assign your first habit', es: 'Tu coach te asignará tu primer hábito', el: 'Ο coach σου θα ορίσει την πρώτη συνήθεια' },

  // ── Navigation ──
  'nav.home': { en: 'Home', es: 'Inicio', el: 'Αρχική' },
  'nav.log': { en: 'Log', es: 'Registro', el: 'Καταγραφή' },
  'nav.track': { en: 'Track', es: 'Registro', el: 'Καταγραφή' },
  'nav.supplements': { en: 'Supps', es: 'Supps', el: 'Συμπλ.' },
  'nav.progress': { en: 'Progress', es: 'Progreso', el: 'Πρόοδος' },
  'nav.profile': { en: 'Profile', es: 'Perfil', el: 'Προφίλ' },
  'nav.me': { en: 'Me', es: 'Yo', el: 'Εγώ' },
  'nav.clients': { en: 'Clients', es: 'Clientes', el: 'Πελάτες' },
  'nav.habits': { en: 'Habits', es: 'Hábitos', el: 'Συνήθειες' },
  'nav.protocols': { en: 'Protocols', es: 'Protocolos', el: 'Πρωτόκολλα' },
  'nav.foods': { en: 'Foods', es: 'Alimentos', el: 'Τροφές' },

  // ── Dashboard ──
  'dash.good_morning': { en: 'Good morning', es: 'Buenos días', el: 'Καλημέρα' },
  'dash.good_afternoon': { en: 'Good afternoon', es: 'Buenas tardes', el: 'Καλό απόγευμα' },
  'dash.good_evening': { en: 'Good evening', es: 'Buenas noches', el: 'Καλό βράδυ' },
  'dash.good_night': { en: 'Good night', es: 'Buenas noches', el: 'Καληνύχτα' },
  'dash.quick_actions': { en: 'Quick Actions', es: 'Acciones rápidas', el: 'Γρήγορες ενέργειες' },
  'dash.log_food': { en: 'Log Food', es: 'Registrar', el: 'Καταγραφή' },
  'dash.workout': { en: 'Workout', es: 'Entreno', el: 'Άσκηση' },
  'dash.check_in': { en: 'Check-in', es: 'Check-in', el: 'Check-in' },
  'dash.supplements_short': { en: 'Supps', es: 'Suplementos', el: 'Συμπλ.' },
  'dash.today': { en: 'Today', es: 'Hoy', el: 'Σήμερα' },
  'dash.current_habit': { en: 'Current Habit', es: 'Hábito Actual', el: 'Τρέχουσα Συνήθεια' },
  'dash.no_habit': { en: 'No active habit — ask your coach!', es: 'Sin hábito activo — ¡pregunta a tu coach!', el: 'Χωρίς ενεργή συνήθεια — ρώτα τον coach!' },
  'dash.day_of': { en: 'Day {n} of {total}', es: 'Día {n} de {total}', el: 'Ημέρα {n} από {total}' },
  'dash.done_today': { en: 'Done today', es: 'Hecho hoy', el: 'Έγινε σήμερα' },
  'dash.mark_done': { en: 'Mark as done', es: 'Marcar como hecho', el: 'Ολοκληρώθηκε' },
  'dash.not_today': { en: 'Not today', es: 'Hoy no', el: 'Όχι σήμερα' },
  'dash.add_note': { en: 'Add note', es: 'Agregar nota', el: 'Προσθήκη σημείωσης' },
  'dash.best_streak': { en: 'Best streak', es: 'Mejor racha', el: 'Καλύτερο σερί' },
  'dash.habit_number': { en: 'Habit #{n} of your plan', es: 'Hábito #{n} de tu plan', el: 'Συνήθεια #{n} του πλάνου' },
  'dash.water': { en: 'Water', es: 'Agua', el: 'Νερό' },
  'dash.calories': { en: 'Calories', es: 'Calorías', el: 'Θερμίδες' },
  'dash.protein': { en: 'Protein', es: 'Proteína', el: 'Πρωτεΐνη' },
  'dash.carbs': { en: 'Carbs', es: 'Carbohidratos', el: 'Υδατάνθρακες' },
  'dash.fat': { en: 'Fat', es: 'Grasa', el: 'Λίπος' },
  'dash.fiber': { en: 'Fiber', es: 'Fibra', el: 'Φυτικές ίνες' },
  'dash.kcal': { en: 'kcal', es: 'kcal', el: 'kcal' },
  'dash.grams': { en: 'g', es: 'g', el: 'g' },
  'dash.ml': { en: 'ml', es: 'ml', el: 'ml' },
  'dash.liters': { en: 'L', es: 'L', el: 'L' },

  // ── Mood ──
  'mood.great': { en: 'Great', es: 'Genial', el: 'Τέλεια' },
  'mood.good': { en: 'Good', es: 'Bien', el: 'Καλά' },
  'mood.okay': { en: 'Okay', es: 'Regular', el: 'Μέτρια' },
  'mood.tough': { en: 'Tough', es: 'Difícil', el: 'Δύσκολα' },
  'mood.struggled': { en: 'Struggled', es: 'Costó mucho', el: 'Δυσκολεύτηκα' },

  // ── Food Logging ──
  'food.search': { en: 'Search foods...', es: 'Buscar alimentos...', el: 'Αναζήτηση τροφίμων...' },
  'food.log_meal': { en: 'Log meal', es: 'Registrar comida', el: 'Καταγραφή γεύματος' },
  'food.breakfast': { en: 'Breakfast', es: 'Desayuno', el: 'Πρωινό' },
  'food.lunch': { en: 'Lunch', es: 'Almuerzo', el: 'Μεσημεριανό' },
  'food.dinner': { en: 'Dinner', es: 'Cena', el: 'Βραδινό' },
  'food.snack': { en: 'Snack', es: 'Snack', el: 'Σνακ' },
  'food.pre_workout': { en: 'Pre-workout', es: 'Pre-entreno', el: 'Πριν την άσκηση' },
  'food.post_workout': { en: 'Post-workout', es: 'Post-entreno', el: 'Μετά την άσκηση' },
  'food.quantity': { en: 'Quantity', es: 'Cantidad', el: 'Ποσότητα' },
  'food.add': { en: 'Add', es: 'Agregar', el: 'Προσθήκη' },
  'food.per_serving': { en: 'per serving', es: 'por porción', el: 'ανά μερίδα' },
  'food.recent': { en: 'Recent', es: 'Recientes', el: 'Πρόσφατα' },
  'food.ai_suggest': { en: 'What should I eat?', es: '¿Qué debería comer?', el: 'Τι να φάω;' },
  'food.photo_scan': { en: 'Scan food photo', es: 'Escanear foto de comida', el: 'Σκανάρισμα φωτογραφίας' },
  'food.quick_placeholder': { en: 'What did you eat? e.g. 3 eggs, toast, coffee...', es: '¿Qué comiste? ej. 3 huevos, tostada, café...', el: 'Τι έφαγες; π.χ. 3 αυγά, τοστ, καφέ...' },
  'food.parsing': { en: 'Analyzing your meal...', es: 'Analizando tu comida...', el: 'Ανάλυση γεύματος...' },
  'food.confirm_all': { en: 'Log All', es: 'Registrar todo', el: 'Καταγραφή όλων' },
  'food.photo_take': { en: 'Take photo', es: 'Tomar foto', el: 'Βγάλε φωτογραφία' },
  'food.photo_analyzing': { en: 'Analyzing photo...', es: 'Analizando foto...', el: 'Ανάλυση φωτογραφίας...' },
  'food.items_found': { en: '{n} item(s) found', es: '{n} alimento(s)', el: '{n} τρόφιμα' },
  'food.search_db': { en: 'Search database', es: 'Buscar en base de datos', el: 'Αναζήτηση βάσης' },
  'food.remove_item': { en: 'Remove', es: 'Eliminar', el: 'Αφαίρεση' },
  'food.no_items': { en: 'No food items detected', es: 'No se detectaron alimentos', el: 'Δεν εντοπίστηκαν τρόφιμα' },
  'food.logged_success': { en: 'Logged {n} items!', es: '¡{n} alimentos registrados!', el: '{n} τρόφιμα καταγράφηκαν!' },
  'food.meals_progress': { en: '{done} of {total} meals logged', es: '{done} de {total} comidas registradas', el: '{done} από {total} γεύματα καταγράφηκαν' },
  'food.tap_to_log': { en: 'Tap to log this meal', es: 'Toca para registrar', el: 'Πάτα για καταγραφή' },
  'food.skip_meal': { en: 'Skip', es: 'Omitir', el: 'Παράλειψη' },
  'food.skipped': { en: 'Skipped', es: 'Omitida', el: 'Παραλείφθηκε' },
  'food.meal_reminder': { en: "Don't forget your {meal}!", es: '¡No olvides tu {meal}!', el: 'Μην ξεχάσεις το {meal}!' },
  'food.undo_skip': { en: 'Undo skip', es: 'Deshacer', el: 'Αναίρεση' },
  'food.snack_am': { en: 'Morning Snack', es: 'Snack AM', el: 'Σνακ Πρωινό' },
  'food.snack_pm': { en: 'Afternoon Snack', es: 'Snack PM', el: 'Σνακ Απογευματινό' },
  'food.lock_all': { en: 'Lock All', es: 'Bloquear todo', el: 'Κλείδωμα όλων' },
  'food.locked': { en: 'Locked ✓', es: 'Bloqueado ✓', el: 'Κλειδωμένο ✓' },
  'food.unlock': { en: 'Unlock', es: 'Desbloquear', el: 'Ξεκλείδωμα' },
  'food.lock_meal': { en: 'Lock', es: 'Bloquear', el: 'Κλείδωμα' },
  'food.day_locked': { en: 'All meals locked for today', es: 'Todas las comidas bloqueadas', el: 'Όλα τα γεύματα κλειδωμένα' },
  'food.logged_toast': { en: 'Logged {n} items!', es: '{n} alimentos registrados!', el: '{n} τρόφιμα καταγράφηκαν!' },
  'food.undo_delete': { en: 'Undo', es: 'Deshacer', el: 'Αναίρεση' },
  'food.entry_deleted': { en: 'Entry deleted', es: 'Entrada eliminada', el: 'Η καταχώρηση διαγράφηκε' },
  'food.retry': { en: 'Retry', es: 'Reintentar', el: 'Επανάληψη' },
  'food.log_load_failed': { en: 'Your food log could not be loaded — try again', es: 'No se pudo cargar tu registro de comida — inténtalo de nuevo', el: 'Δεν ήταν δυνατή η φόρτωση του ημερολογίου φαγητού — δοκίμασε ξανά' },
  'food.delete_failed': { en: 'Food could not be removed — your log was refreshed', es: 'No se pudo eliminar la comida — tu registro se actualizó', el: 'Δεν ήταν δυνατή η αφαίρεση του φαγητού — το ημερολόγιό σου ανανεώθηκε' },
  'food.save_failed': { en: 'Your meal was not saved — review it and try again', es: 'Tu comida no se guardó — revísala e inténtalo de nuevo', el: 'Το γεύμα σου δεν αποθηκεύτηκε — έλεγξέ το και δοκίμασε ξανά' },
  'food.session_expired': { en: 'Your session expired — refresh and sign in again', es: 'Tu sesión caducó — actualiza e inicia sesión de nuevo', el: 'Η συνεδρία σου έληξε — ανανέωσε και συνδέσου ξανά' },
  'food.invalid_entry': { en: 'This meal has an invalid value — review it and try again', es: 'Esta comida tiene un valor no válido — revísala e inténtalo de nuevo', el: 'Αυτό το γεύμα έχει μη έγκυρη τιμή — έλεγξέ το και δοκίμασε ξανά' },
  'food.manual_entry': { en: 'Enter manually', es: 'Ingresar manualmente', el: 'Χειροκίνητη εισαγωγή' },
  'food.quick_add': { en: 'Quick add', es: 'Agregar rápido', el: 'Γρήγορη προσθήκη' },
  'food.remaining': { en: '{n} kcal left', es: '{n} kcal restantes', el: '{n} kcal απομένουν' },
  'food.over_budget': { en: '{n} kcal over', es: '{n} kcal excedidas', el: '{n} kcal πάνω' },
  'food.streak': { en: '{n} day streak', es: 'Racha de {n} días', el: 'Σερί {n} ημερών' },
  'food.favorite_added': { en: 'Added to favorites', es: 'Añadido a favoritos', el: 'Προστέθηκε στα αγαπημένα' },
  'food.favorites': { en: 'Favorites', es: 'Favoritos', el: 'Αγαπημένα' },
  'food.listening': { en: 'Listening...', es: 'Escuchando...', el: 'Ακούω...' },
  'food.speak_meal': { en: 'Say what you ate', es: 'Di lo que comiste', el: 'Πες τι έφαγες' },
  'food.target_remaining': { en: 'Remaining', es: 'Restante', el: 'Υπόλοιπο' },

  // ── Supplements ──
  'supps.my_protocol': { en: 'My Protocol', es: 'Mi Protocolo', el: 'Το Πρωτόκολλό μου' },
  'supps.take': { en: 'Take', es: 'Tomar', el: 'Λήψη' },
  'supps.taken': { en: 'Taken ✓', es: 'Tomado ✓', el: 'Ελήφθη ✓' },
  'supps.timing': { en: 'Timing', es: 'Momento', el: 'Χρονισμός' },
  'supps.dose': { en: 'Dose', es: 'Dosis', el: 'Δόση' },
  'supps.evidence': { en: 'Evidence', es: 'Evidencia', el: 'Τεκμηρίωση' },

  // ── Coach Dashboard ──
  'coach.clients': { en: 'My Clients', es: 'Mis Clientes', el: 'Οι Πελάτες μου' },
  'coach.overview': { en: 'Overview', es: 'Vista general', el: 'Επισκόπηση' },
  'coach.on_track': { en: 'On track', es: 'En camino', el: 'Σε καλό δρόμο' },
  'coach.at_risk': { en: 'At risk', es: 'En riesgo', el: 'Σε κίνδυνο' },
  'coach.inactive': { en: 'Inactive', es: 'Inactivo', el: 'Ανενεργός' },
  'coach.assign_habit': { en: 'Assign habit', es: 'Asignar hábito', el: 'Ανάθεση συνήθειας' },
  'coach.progress_habit': { en: 'Progress to next', es: 'Avanzar al siguiente', el: 'Επόμενη συνήθεια' },
  'coach.add_note': { en: 'Add note', es: 'Agregar nota', el: 'Προσθήκη σημείωσης' },
  'coach.view_client': { en: 'View details', es: 'Ver detalles', el: 'Προβολή λεπτομερειών' },
  'coach.ready_progress': { en: 'Ready for progression', es: 'Listo para avanzar', el: 'Έτοιμος για πρόοδο' },
  'coach.last_checkin': { en: 'Last check-in', es: 'Último check-in', el: 'Τελευταίο check-in' },
  'coach.days_ago': { en: '{n} days ago', es: 'hace {n} días', el: 'πριν {n} ημέρες' },

  // ── Progress ──
  'progress.title': { en: 'Progress', es: 'Progreso', el: 'Πρόοδος' },
  'progress.weight_trend': { en: 'Weight Trend', es: 'Tendencia de Peso', el: 'Τάση Βάρους' },
  'progress.habit_history': { en: 'Habit History', es: 'Historial de Hábitos', el: 'Ιστορικό Συνηθειών' },
  'progress.completed': { en: 'Completed', es: 'Completados', el: 'Ολοκληρωμένα' },
  'progress.add_weight': { en: 'Log weight', es: 'Registrar peso', el: 'Καταγραφή βάρους' },

  // ── Workout ──
  'nav.workout': { en: 'Workout', es: 'Entreno', el: 'Άσκηση' },
  'workout.title': { en: 'Workout', es: 'Entreno', el: 'Άσκηση' },
  'workout.start': { en: 'Start Workout', es: 'Iniciar Entreno', el: 'Έναρξη Άσκησης' },
  'workout.finish': { en: 'Finish Workout', es: 'Finalizar Entreno', el: 'Τέλος Άσκησης' },
  'workout.add_exercise': { en: 'Add Exercise', es: 'Agregar Ejercicio', el: 'Προσθήκη Άσκησης' },
  'workout.search_exercises': { en: 'Search exercises...', es: 'Buscar ejercicios...', el: 'Αναζήτηση ασκήσεων...' },
  'workout.set': { en: 'Set', es: 'Serie', el: 'Σετ' },
  'workout.weight': { en: 'Weight', es: 'Peso', el: 'Βάρος' },
  'workout.reps': { en: 'Reps', es: 'Reps', el: 'Επαν.' },
  'workout.rpe': { en: 'RPE', es: 'RPE', el: 'RPE' },
  'workout.warmup': { en: 'Warmup', es: 'Calentamiento', el: 'Ζέσταμα' },
  'workout.add_set': { en: '+ Set', es: '+ Serie', el: '+ Σετ' },
  'workout.pain_flag': { en: 'Pain Flag', es: 'Dolor', el: 'Πόνος' },
  'workout.body_part': { en: 'Body part', es: 'Parte del cuerpo', el: 'Μέρος σώματος' },
  'workout.severity': { en: 'Severity', es: 'Severidad', el: 'Σοβαρότητα' },
  'workout.history': { en: 'History', es: 'Historial', el: 'Ιστορικό' },
  'workout.volume': { en: 'Volume', es: 'Volumen', el: 'Όγκος' },
  'workout.duration': { en: 'Duration', es: 'Duración', el: 'Διάρκεια' },
  'workout.exercises': { en: 'exercises', es: 'ejercicios', el: 'ασκήσεις' },
  'workout.repeat': { en: 'Repeat', es: 'Repetir', el: 'Επανάληψη' },
  'workout.no_sessions': { en: 'No workouts yet. Start your first one!', es: 'Sin entrenos aún. ¡Empieza el primero!', el: 'Κανένα workout ακόμα. Ξεκίνα το πρώτο!' },
  'workout.pr': { en: 'PR!', es: '¡RP!', el: 'PR!' },
  'workout.kg': { en: 'kg', es: 'kg', el: 'kg' },
  'workout.min': { en: 'min', es: 'min', el: 'λεπ' },
  'workout.all': { en: 'All', es: 'Todos', el: 'Όλα' },
  'workout.session_name': { en: 'Session name', es: 'Nombre de sesión', el: 'Όνομα συνεδρίας' },
  'workout.elapsed': { en: 'Elapsed', es: 'Transcurrido', el: 'Χρόνος' },

  // ── General ──
  'general.save': { en: 'Save', es: 'Guardar', el: 'Αποθήκευση' },
  'general.cancel': { en: 'Cancel', es: 'Cancelar', el: 'Ακύρωση' },
  'general.delete': { en: 'Delete', es: 'Eliminar', el: 'Διαγραφή' },
  'general.edit': { en: 'Edit', es: 'Editar', el: 'Επεξεργασία' },
  'general.loading': { en: 'Loading...', es: 'Cargando...', el: 'Φόρτωση...' },
  'general.error': { en: 'Something went wrong', es: 'Algo salió mal', el: 'Κάτι πήγε στραβά' },
  'general.days': { en: 'days', es: 'días', el: 'ημέρες' },
  'general.today': { en: 'Today', es: 'Hoy', el: 'Σήμερα' },
  'general.yesterday': { en: 'Yesterday', es: 'Ayer', el: 'Χθες' },
  'general.language': { en: 'Language', es: 'Idioma', el: 'Γλώσσα' },
  'general.week': { en: 'Week', es: 'Semana', el: 'Εβδομάδα' },
  'general.month': { en: 'Month', es: 'Mes', el: 'Μήνας' },
  'general.custom': { en: 'Custom', es: 'Personalizado', el: 'Προσαρμογή' },
  'general.all_time': { en: 'All time', es: 'Todo el tiempo', el: 'Όλος ο χρόνος' },
  'general.calories': { en: 'Calories', es: 'Calorías', el: 'Θερμίδες' },
  'general.protein': { en: 'Protein', es: 'Proteína', el: 'Πρωτεΐνη' },
  'general.carbs': { en: 'Carbs', es: 'Carbohidratos', el: 'Υδατάνθρακες' },
  'general.fat': { en: 'Fat', es: 'Grasa', el: 'Λίπος' },
  'general.fiber': { en: 'Fiber', es: 'Fibra', el: 'Φυτικές ίνες' },
  'general.sugar': { en: 'Sugar', es: 'Azúcar', el: 'Ζάχαρη' },
  'general.water': { en: 'Water', es: 'Agua', el: 'Νερό' },
  'general.kcal': { en: 'kcal', es: 'kcal', el: 'kcal' },

  // ── Profile ──
  'profile.body_stats': { en: 'Body Stats', es: 'Datos Corporales', el: 'Σωματικά Στοιχεία' },
  'profile.calc_targets': { en: 'Calculated Targets', es: 'Objetivos Calculados', el: 'Υπολογισμένοι Στόχοι' },
  'profile.target': { en: 'Target', es: 'Objetivo', el: 'Στόχος' },
  'profile.appearance': { en: 'Appearance', es: 'Apariencia', el: 'Εμφάνιση' },
  'profile.dark_mode': { en: 'Dark Mode', es: 'Modo Oscuro', el: 'Σκούρα Λειτουργία' },
  'profile.light_mode': { en: 'Light Mode', es: 'Modo Claro', el: 'Φωτεινή Λειτουργία' },
  'profile.save_profile': { en: 'Save Profile', es: 'Guardar Perfil', el: 'Αποθήκευση Προφίλ' },
  'profile.saving': { en: 'Saving...', es: 'Guardando...', el: 'Αποθήκευση...' },
  'profile.saved': { en: 'Saved', es: 'Guardado', el: 'Αποθηκεύτηκε' },
  'profile.save_failed': { en: 'Profile was not saved — try again', es: 'El perfil no se guardó — inténtalo de nuevo', el: 'Το προφίλ δεν αποθηκεύτηκε — δοκίμασε ξανά' },
  'profile.language_save_failed': { en: 'Nutrition saved, but language was not saved — try again', es: 'La nutrición se guardó, pero el idioma no — inténtalo de nuevo', el: 'Η διατροφή αποθηκεύτηκε, αλλά η γλώσσα όχι — δοκίμασε ξανά' },
  'profile.invalid_body': { en: 'Check age, height, and weight before saving', es: 'Revisa la edad, la altura y el peso antes de guardar', el: 'Έλεγξε την ηλικία, το ύψος και το βάρος πριν την αποθήκευση' },
  'profile.macros_adjusted': { en: 'Protein and fat were adjusted to fit the calorie target. Your coach can review these starting targets.', es: 'La proteína y la grasa se ajustaron al objetivo calórico. Tu coach puede revisar estos valores iniciales.', el: 'Η πρωτεΐνη και το λίπος προσαρμόστηκαν στον στόχο θερμίδων. Ο coach σου μπορεί να ελέγξει αυτές τις αρχικές τιμές.' },
  'profile.load_failed': { en: 'Your profile could not be loaded — try again', es: 'No se pudo cargar tu perfil — inténtalo de nuevo', el: 'Δεν ήταν δυνατή η φόρτωση του προφίλ σου — δοκίμασε ξανά' },
  'profile.log_out': { en: 'Log Out', es: 'Cerrar Sesión', el: 'Αποσύνδεση' },

  // ── Goal labels ──
  'goal.fat_loss': { en: 'Fat Loss', es: 'Pérdida de grasa', el: 'Απώλεια λίπους' },
  'goal.muscle_gain': { en: 'Muscle Gain', es: 'Ganar músculo', el: 'Αύξηση μυών' },
  'goal.maintenance': { en: 'Maintenance', es: 'Mantenimiento', el: 'Διατήρηση' },
  'goal.recomp': { en: 'Recomp', es: 'Recomposición', el: 'Επαναδιαμόρφωση' },
  'goal.endurance': { en: 'Endurance', es: 'Resistencia', el: 'Αντοχή' },
  'goal.health': { en: 'Health', es: 'Salud', el: 'Υγεία' },

  // ── Activity level labels ──
  'activity.sedentary': { en: 'Sedentary', es: 'Sedentario', el: 'Καθιστική ζωή' },
  'activity.light': { en: 'Light', es: 'Ligero', el: 'Ελαφρύ' },
  'activity.moderate': { en: 'Moderate', es: 'Moderado', el: 'Μέτριο' },
  'activity.active': { en: 'Active', es: 'Activo', el: 'Ενεργητικό' },
  'activity.very_active': { en: 'Very Active', es: 'Muy Activo', el: 'Πολύ Ενεργητικό' },

  // ── Analytics section headers ──
  'analytics.title':             { en: 'Analytics',           es: 'Análisis',                el: 'Αναλύσεις' },
  'analytics.this_week':         { en: 'This Week',           es: 'Esta Semana',              el: 'Αυτή η Εβδομάδα' },
  'analytics.nutrition_per_meal':{ en: 'Nutrition per Meal',  es: 'Nutrición por Comida',     el: 'Διατροφή ανά Γεύμα' },
  'analytics.nutrient_density':  { en: 'Nutrient Density',    es: 'Densidad Nutricional',     el: 'Πυκνότητα Θρεπτικών' },
  'analytics.trends':            { en: 'Trends',              es: 'Tendencias',               el: 'Τάσεις' },
  'analytics.logging_activity':  { en: 'Logging Activity',    es: 'Actividad de Registro',    el: 'Δραστηριότητα Καταγραφής' },
  'analytics.top_foods':         { en: 'Top Foods',           es: 'Alimentos Principales',    el: 'Κορυφαίες Τροφές' },
  'analytics.day_patterns':      { en: 'Day Patterns',        es: 'Patrones del Día',         el: 'Μοτίβα Ημέρας' },
  'analytics.weekly_adherence':  { en: 'Weekly Adherence',    es: 'Adherencia Semanal',       el: 'Εβδομαδιαία Συμμόρφωση' },
  'analytics.report':            { en: 'Report',              es: 'Informe',                  el: 'Έκθεση' },
  'analytics.day':               { en: '7d',                  es: '7d',                       el: '7η' },
  'analytics.30d':               { en: '30d',                 es: '30d',                      el: '30η' },
  'analytics.90d':               { en: '90d',                 es: '90d',                      el: '90η' },
  'analytics.period_7d':         { en: 'Last 7 days',         es: 'Últimos 7 días',           el: 'Τελευταίες 7 ημέρες' },
  'analytics.period_30d':        { en: 'Last 30 days',        es: 'Últimos 30 días',          el: 'Τελευταίες 30 ημέρες' },
  'analytics.period_custom':     { en: 'Custom',              es: 'Personalizado',            el: 'Προσαρμοσμένο' },
  'analytics.avg':               { en: 'avg',                 es: 'prom',                     el: 'μέσος' },
  'analytics.days_logged':       { en: 'days logged',         es: 'días registrados',         el: 'ημέρες καταγραφής' },
  'analytics.no_data':           { en: 'No data yet',         es: 'Sin datos aún',            el: 'Δεν υπάρχουν δεδομένα' },
  'analytics.loading':           { en: 'Loading...',          es: 'Cargando...',              el: 'Φόρτωση...' },
  'analytics.calories':          { en: 'Calories',            es: 'Calorías',                 el: 'Θερμίδες' },
  'analytics.protein':           { en: 'Protein',             es: 'Proteína',                 el: 'Πρωτεΐνη' },
  'analytics.carbs':             { en: 'Carbs',               es: 'Carbohidratos',            el: 'Υδατάνθρακες' },
  'analytics.fat':               { en: 'Fat',                 es: 'Grasa',                    el: 'Λίπος' },
  'analytics.fiber':             { en: 'Fiber',               es: 'Fibra',                    el: 'Φυτικές ίνες' },
  'analytics.weekday':           { en: 'Weekday avg',         es: 'Prom. entre semana',       el: 'Μέσος εργάσιμων' },
  'analytics.weekend':           { en: 'Weekend avg',         es: 'Prom. fin de semana',      el: 'Μέσος Σαββ/κου' },
  'analytics.target':            { en: 'Target',              es: 'Objetivo',                 el: 'Στόχος' },
  'analytics.see_all':           { en: 'See all',             es: 'Ver todo',                 el: 'Όλα' },
  'analytics.times':             { en: 'times',               es: 'veces',                    el: 'φορές' },
  'analytics.score':             { en: 'score',               es: 'puntuación',               el: 'βαθμός' },

  // ── Health tips (log page rotating tips) ──
  'tip.start_day':      { en: 'Start your day right — a protein-rich breakfast reduces cravings by up to 60%', es: 'Empieza bien el día — un desayuno proteico reduce el hambre hasta un 60%', el: 'Ξεκίνα σωστά — ένα πρωινό με πρωτεΐνη μειώνει την πείνα κατά 60%' },
  'tip.no_meals_yet':   { en: 'No meals logged yet — even a quick entry helps build the habit', es: 'Aún sin comidas registradas — incluso una entrada rápida ayuda a crear el hábito', el: 'Δεν έχεις καταγράψει γεύματα ακόμα — ακόμα και μία γρήγορη εγγραφή βοηθά' },
  'tip.protein_to_go':  { en: '{n}g protein to go — options: chicken (31g/150g), eggs (6g each), Greek yogurt (15g)', es: 'Faltan {n}g de proteína — opciones: pollo (31g/150g), huevos (6g c/u), yogur griego (15g)', el: 'Λείπουν {n}g πρωτεΐνης — επιλογές: κοτόπουλο (31g/150g), αυγά (6g), γιαούρτι (15g)' },
  'tip.over_calories':  { en: 'Over your calorie target — focus on protein and fiber for the rest of the day', es: 'Superaste el objetivo calórico — enfócate en proteína y fibra el resto del día', el: 'Ξεπέρασες τον στόχο θερμίδων — εστίασε σε πρωτεΐνη και φυτικές ίνες' },
  'tip.time_for_meal':  { en: 'Time for {meal}! Log it to keep your streak going', es: '¡Hora del {meal}! Regístralo para mantener tu racha', el: 'Ώρα για {meal}! Καταγράψε το για να κρατήσεις το σερί σου' },
  'tip.almost_done':    { en: 'Almost done! Lock your meals when finished — consistency is the #1 predictor of success', es: '¡Casi listo! Bloquea tus comidas — la constancia es el predictor #1 del éxito', el: 'Σχεδόν έτοιμο! Κλείδωσε τα γεύματά σου — η συνέπεια είναι το #1 για επιτυχία' },
  'tip.protein_1':      { en: 'Aim for 20-40g protein per meal — maximizes muscle protein synthesis (ISSN)', es: 'Busca 20-40g proteína por comida — maximiza la síntesis muscular (ISSN)', el: 'Στόχευσε σε 20-40g πρωτεΐνης ανά γεύμα — μεγιστοποιεί τη σύνθεση μυϊκής πρωτεΐνης' },
  'tip.protein_2':      { en: 'Spreading protein across 4+ meals improves absorption vs loading it all at dinner', es: 'Distribuir proteína en 4+ comidas mejora la absorción vs. concentrarla en la cena', el: 'Κατανομή πρωτεΐνης σε 4+ γεύματα βελτιώνει την απορρόφηση' },
  'tip.protein_3':      { en: 'Leucine-rich proteins (eggs, dairy, chicken) trigger the strongest anabolic response', es: 'Proteínas ricas en leucina (huevos, lácteos, pollo) generan la respuesta anabólica más fuerte', el: 'Τρόφιμα πλούσια σε λευκίνη (αυγά, γαλακτοκομικά, κοτόπουλο) δίνουν τη δυνατότερη αναβολική απόκριση' },
  'tip.protein_4':      { en: 'Your body can use ~0.4g/kg protein per meal — more is useful, just less efficient', es: 'Tu cuerpo puede usar ~0.4g/kg proteína por comida — más es útil, solo menos eficiente', el: 'Ο οργανισμός χρησιμοποιεί ~0.4g/kg πρωτεΐνης ανά γεύμα' },
  'tip.protein_5':      { en: 'Greek yogurt has 2× the protein of regular yogurt — an easy upgrade for any snack', es: 'El yogur griego tiene 2× más proteína que el normal — una mejora fácil para cualquier snack', el: 'Το ελληνικό γιαούρτι έχει 2× πρωτεΐνη από το κανονικό' },
  'tip.timing_1':       { en: 'Eating within 2 hours of waking jumpstarts your metabolism for the day', es: 'Comer dentro de 2 horas de despertar activa tu metabolismo', el: 'Φαγητό εντός 2 ωρών από την αφύπνιση ενεργοποιεί τον μεταβολισμό' },
  'tip.timing_2':       { en: 'Late-night eating isn\'t inherently bad — total daily calories matter more than timing', es: 'Comer tarde no es malo per se — las calorías diarias totales importan más que el horario', el: 'Το φαγητό αργά το βράδυ δεν είναι κακό αυτό καθεαυτό — οι συνολικές θερμίδες έχουν σημασία' },
  'tip.timing_3':       { en: 'A protein-rich breakfast reduces ghrelin (hunger hormone) for up to 4 hours', es: 'Un desayuno rico en proteínas reduce la grelina (hormona del hambre) hasta 4 horas', el: 'Ένα πρωινό πλούσιο σε πρωτεΐνη μειώνει τη γκρελίνη (ορμόνη πείνας) για 4 ώρες' },
  'tip.timing_4':       { en: 'Post-workout protein within 2h optimizes recovery — the "anabolic window" is wider than you think', es: 'Proteína post-entreno en 2h optimiza recuperación — la "ventana anabólica" es más amplia de lo que crees', el: 'Πρωτεΐνη εντός 2 ωρών από άσκηση βελτιστοποιεί την αποκατάσταση' },
  'tip.fiber_1':        { en: 'Only 5% of adults hit the fiber target. Vegetables, beans, and whole grains are your best sources', es: 'Solo el 5% de adultos alcanza el objetivo de fibra. Verduras, legumbres y granos enteros son tus mejores fuentes', el: 'Μόνο το 5% των ενηλίκων φτάνει τον στόχο φυτικών ινών. Λαχανικά και όσπρια είναι οι καλύτερες πηγές' },
  'tip.fiber_2':        { en: 'Beans and lentils are the only food that\'s both high-protein AND high-fiber', es: 'Los frijoles y lentejas son el único alimento alto en proteína Y fibra a la vez', el: 'Τα φασόλια και οι φακές είναι η μόνη τροφή που είναι ταυτόχρονα πλούσια σε πρωτεΐνη ΚΑΙ φυτικές ίνες' },
  'tip.fiber_3':        { en: 'Eating vegetables BEFORE carbs reduces blood sugar spikes by up to 35%', es: 'Comer verduras ANTES de los carbohidratos reduce picos de azúcar hasta un 35%', el: 'Τρώγοντας λαχανικά ΠΡΙΝ τους υδατάνθρακες μειώνει τις αιχμές σακχάρου κατά 35%' },
  'tip.fiber_4':        { en: 'An apple has 4.5g fiber — that\'s 15% of your daily target in one snack', es: 'Una manzana tiene 4.5g fibra — 15% de tu objetivo diario en un snack', el: 'Ένα μήλο έχει 4.5g φυτικές ίνες — 15% του ημερήσιου στόχου σε ένα σνακ' },
  'tip.hydration_1':    { en: 'Even 2% dehydration reduces cognitive performance. Drink before you feel thirsty', es: 'Incluso 2% de deshidratación reduce el rendimiento cognitivo. Bebe antes de sentir sed', el: 'Ακόμα και 2% αφυδάτωση μειώνει τη γνωστική απόδοση. Πίνε πριν διψάσεις' },
  'tip.hydration_2':    { en: 'Water with meals aids digestion — the "don\'t drink during meals" advice is a myth', es: 'Agua con las comidas ayuda a la digestión — el consejo de "no beber en las comidas" es un mito', el: 'Νερό με τα γεύματα βοηθά στην πέψη — η συμβουλή "μην πίνεις κατά τη διάρκεια" είναι μύθος' },
  'tip.fat_1':          { en: 'Healthy fats (avocado, olive oil, nuts) improve vitamin absorption from vegetables', es: 'Grasas saludables (aguacate, aceite de oliva, nueces) mejoran absorción de vitaminas de verduras', el: 'Υγιεινά λιπαρά (αβοκάντο, ελαιόλαδο, ξηροί καρποί) βελτιώνουν απορρόφηση βιταμινών' },
  'tip.fat_2':          { en: 'Omega-3 fatty acids reduce inflammation — aim for fatty fish 2× per week', es: 'Los ácidos grasos omega-3 reducen inflamación — busca pescado graso 2× por semana', el: 'Τα ωμέγα-3 λιπαρά οξέα μειώνουν τη φλεγμονή — στόχευσε σε λιπαρά ψάρια 2× εβδομαδιαίως' },
  'tip.general_1':      { en: 'People who track food consistently lose 2× more weight (NIH study)', es: 'Las personas que registran su alimentación consistentemente pierden 2× más peso (estudio NIH)', el: 'Άνθρωποι που καταγράφουν τρόφιμα συστηματικά χάνουν 2× περισσότερο βάρος (μελέτη NIH)' },
  'tip.general_2':      { en: 'Hitting 80% of your targets consistently beats hitting 100% occasionally', es: 'Alcanzar el 80% de tus objetivos consistentemente supera alcanzar el 100% ocasionalmente', el: 'Το 80% των στόχων συστηματικά νικά το 100% περιστασιακά' },
  'tip.general_3':      { en: 'Your BMR accounts for 60-75% of daily calories — most energy goes to just existing', es: 'Tu TMB representa el 60-75% de tus calorías diarias — la mayoría de energía se usa simplemente para existir', el: 'Ο BMR αντιπροσωπεύει 60-75% των ημερήσιων θερμίδων — η περισσότερη ενέργεια πηγαίνει απλά στο να υπάρχεις' },
  'tip.general_4':      { en: 'The gut-brain axis means what you eat directly affects mood and focus within hours', es: 'El eje intestino-cerebro significa que lo que comes afecta directamente tu estado de ánimo y concentración', el: 'Ο άξονας εντέρου-εγκεφάλου σημαίνει ότι τι τρως επηρεάζει άμεσα τη διάθεση και εστίαση' },

  // ── Home quick actions (extended) ──
  'home.water_short':  { en: 'Water',     es: 'Agua',        el: 'Νερό' },
  'home.entries_n':    { en: 'entries today', es: 'entradas hoy', el: 'εγγραφές σήμερα' },

  // ── Smart insight strip ──
  'insight.log_first':    { en: 'Log your first meal to start tracking today', es: 'Registra tu primera comida del día', el: 'Καταγράψε το πρώτο γεύμα σήμερα' },
  'insight.sugar_high':   { en: 'Sugar at {n}g — WHO limit is 25g', es: 'Azúcar en {n}g — límite OMS es 25g', el: 'Ζάχαρη στα {n}g — όριο ΠΟΥ είναι 25g' },
  'insight.protein_low':  { en: '{n}g protein left — add a lean source', es: 'Faltan {n}g de proteína — añade una fuente magra', el: 'Λείπουν {n}g πρωτεΐνης — πρόσθεσε πηγή' },
  'insight.hydration_low':{ en: 'Hydration low — drink a glass of water now', es: 'Hidratación baja — bebe un vaso de agua ahora', el: 'Λίγο υγρά — πιες ένα ποτήρι νερό' },
  'insight.goal_reached': { en: 'Daily calorie goal reached', es: 'Objetivo calórico diario alcanzado', el: 'Ημερήσιος στόχος θερμίδων επιτεύχθηκε' },
  'insight.almost_there': { en: '{n} kcal remaining — almost there', es: 'Quedan {n} kcal — casi lo logras', el: '{n} kcal υπολείπονται — σχεδόν τελείωσες' },
  'insight.pct_logged':   { en: '{n}% of daily calories logged', es: '{n}% de calorías diarias registradas', el: '{n}% θερμίδων ημέρας καταγράφηκαν' },

  // ── Coach message box (extended) ──
  'coach_msg.your_coach':    { en: 'Your Coach',           es: 'Tu Coach',             el: 'Ο Coach σου' },
  'coach_msg.coach_prefix':  { en: 'Coach',                es: 'Coach',                el: 'Coach' },
  'coach_msg.sent_confirm':  { en: 'Message sent to coach',es: 'Mensaje enviado al coach', el: 'Το μήνυμα στάλθηκε' },
  'coach_msg.send_failed': { en: 'Could not send — try again', es: 'No se pudo enviar — inténtalo de nuevo', el: 'Αποτυχία αποστολής — δοκίμασε ξανά' },
  'book.cancel_failed': { en: 'Could not cancel — please try again', es: 'No se pudo cancelar — inténtalo de nuevo', el: 'Αποτυχία ακύρωσης — δοκίμασε ξανά' },
  // ── Weekly check-in (de-emoji + i18n) ──
  'checkin.title': { en: 'Weekly Check-in', es: 'Registro Semanal', el: 'Εβδομαδιαίος Έλεγχος' },
  'checkin.instructions': { en: 'Rate each area from 1 to 5 to help your coach track your progress.', es: 'Califica cada área del 1 al 5 para que tu coach siga tu progreso.', el: 'Βαθμολόγησε κάθε τομέα από 1 έως 5 για να παρακολουθεί ο coach την πρόοδό σου.' },
  'checkin.scale_hint': { en: 'low → high', es: 'bajo → alto', el: 'χαμηλό → υψηλό' },
  'checkin.q_energy': { en: 'Energy level this week', es: 'Nivel de energía esta semana', el: 'Επίπεδο ενέργειας αυτή την εβδομάδα' },
  'checkin.q_sleep': { en: 'Sleep quality', es: 'Calidad del sueño', el: 'Ποιότητα ύπνου' },
  'checkin.q_satiety': { en: 'Hunger / satiety management', es: 'Manejo del hambre y la saciedad', el: 'Διαχείριση πείνας / κορεσμού' },
  'checkin.q_stress': { en: 'Stress level', es: 'Nivel de estrés', el: 'Επίπεδο άγχους' },
  'checkin.q_adherence': { en: 'Overall adherence confidence', es: 'Confianza general en la adherencia', el: 'Συνολική εμπιστοσύνη στην τήρηση' },
  'checkin.submitted': { en: 'Check-in submitted', es: 'Registro enviado', el: 'Ο έλεγχος υποβλήθηκε' },
  'checkin.coach_review': { en: 'Your coach will review this', es: 'Tu coach lo revisará', el: 'Ο coach σου θα το εξετάσει' },
  'checkin.submitting': { en: 'Submitting…', es: 'Enviando…', el: 'Υποβολή…' },
  'checkin.submit': { en: 'Submit Check-in', es: 'Enviar Registro', el: 'Υποβολή Ελέγχου' },

  // ── Water card (extended) ──
  'water.log':             { en: 'Log',   es: 'Registrar', el: 'Καταγραφή' },

  // ── Food ideas (extended) ──
  'ideas.to_go':           { en: 'to go',      es: 'restantes',    el: 'υπόλοιπο' },

  // ── Nutrient density (extended) ──
  'density.score_desc':    { en: 'Score measures nutrients (protein + fiber) per calorie. Higher = meals working harder for you.', es: 'Mide nutrientes (proteína + fibra) por caloría. Mayor = comidas más eficientes.', el: 'Μετρά θρεπτικά (πρωτεΐνη + φυτικές ίνες) ανά θερμίδα. Υψηλότερο = καλύτερα γεύματα.' },
  'density.scale_label':   { en: 'Score scale', es: 'Escala',       el: 'Κλίμακα' },

  // ── Achievement badges (extended) ──
  'badge.triple_log':      { en: 'Triple Log',    es: 'Triple Registro',  el: 'Τριπλή Καταγραφή' },
  'badge.century':         { en: 'Century',       es: 'Centenario',       el: 'Εκατοντάδα' },
  'badge.done':            { en: 'Done',          es: 'Hecho',            el: 'Έγινε' },
  'badge.not_yet':         { en: 'Not yet',       es: 'Aún no',           el: 'Όχι ακόμα' },
  'badge.total_xp':        { en: 'Total XP earned', es: 'XP total ganado', el: 'Σύνολο XP' },
  'badge.desc_triple_log': { en: 'Log 3 meals in one day', es: 'Registra 3 comidas en un día', el: 'Καταγράψε 3 γεύματα σε μία ημέρα' },
  'badge.desc_century':    { en: '100 consecutive days logged', es: '100 días consecutivos', el: '100 συνεχόμενες ημέρες' },

  // ── Nutrient density grades ──
  'density.excellent': { en: 'Excellent', es: 'Excelente', el: 'Άριστη' },
  'density.good':      { en: 'Good',      es: 'Buena',     el: 'Καλή' },
  'density.fair':      { en: 'Fair',      es: 'Regular',   el: 'Μέτρια' },
  'density.low':       { en: 'Low',       es: 'Baja',      el: 'Χαμηλή' },
  'density.tip_high':  { en: 'Great nutrient density — your meals are working hard for you', es: 'Gran densidad nutricional — tus comidas trabajan duro', el: 'Εξαιρετική πυκνότητα — τα γεύματά σου αποδίδουν' },
  'density.tip_med':   { en: 'Add more vegetables, legumes or eggs to boost density', es: 'Agrega más verduras, legumbres o huevos', el: 'Πρόσθεσε λαχανικά ή όσπρια για καλύτερη πυκνότητα' },
  'density.tip_low':   { en: 'Focus on protein + fiber rich foods to improve your score', es: 'Enfócate en proteína y fibra para mejorar', el: 'Εστίασε σε τροφές με πρωτεΐνη και φυτικές ίνες' },

  // ── Achievement badges ──
  'badge.achievements':      { en: 'Achievements',       es: 'Logros',                    el: 'Επιτεύγματα' },
  'badge.first_meal':        { en: 'First Meal',         es: 'Primera Comida',            el: 'Πρώτο Γεύμα' },
  'badge.photo_logger':      { en: 'Photo Logger',       es: 'Registro Foto',             el: 'Φωτογράφος' },
  'badge.streak_7':          { en: '7-Day Streak',       es: 'Racha de 7 días',           el: 'Σερί 7 ημερών' },
  'badge.protein_champion':  { en: 'Protein Champion',   es: 'Campeón Proteínas',         el: 'Πρωτεϊνάς' },
  'badge.full_day':          { en: 'Full Day',           es: 'Día Completo',              el: 'Πλήρης Ημέρα' },
  'badge.streak_30':         { en: '30-Day Legend',      es: 'Leyenda 30 días',           el: 'Θρύλος 30 ημερών' },
  'badge.desc_first_meal':   { en: 'Log your first meal', es: 'Registra tu primera comida', el: 'Καταγράψτε το πρώτο γεύμα' },
  'badge.desc_photo':        { en: 'Log a meal via photo', es: 'Registra con foto',        el: 'Καταγράψτε γεύμα με φωτό' },
  'badge.desc_streak_7':     { en: 'Log meals 7 days in a row', es: '7 días seguidos',     el: '7 ημέρες σερί' },
  'badge.desc_protein':      { en: 'Hit your protein target', es: 'Alcanza tu objetivo de proteína', el: 'Πέτυχε τον στόχο πρωτεΐνης' },
  'badge.desc_full_day':     { en: 'Log all 5 meals in one day', es: 'Registra 5 comidas en un día', el: '5 γεύματα σε μία ημέρα' },
  'badge.desc_streak_30':    { en: '30 consecutive days', es: '30 días consecutivos',      el: '30 συνεχόμενες ημέρες' },

  // ── Food ideas / suggestions ──
  'ideas.protein':     { en: 'Protein',             es: 'Proteína',               el: 'Πρωτεΐνη' },
  'ideas.carbs':       { en: 'Carbs',               es: 'Carbohidratos',          el: 'Υδατάνθρακες' },
  'ideas.fat':         { en: 'Healthy Fats',        es: 'Grasas Saludables',      el: 'Υγιεινά Λιπαρά' },
  'ideas.fiber':       { en: 'Fiber',               es: 'Fibra',                  el: 'Φυτικές ίνες' },
  'ideas.title':       { en: 'Food Ideas',          es: 'Ideas de Alimentos',     el: 'Ιδέες για Τροφές' },
  'ideas.remaining':   { en: '{n}{unit} remaining', es: '{n}{unit} restantes',    el: '{n}{unit} υπόλοιπα' },
  'ideas.on_track':    { en: 'On track',            es: 'En camino',              el: 'Στο στόχο' },
  'ideas.nutrition':   { en: 'Nutrition per serving', es: 'Nutrición por porción', el: 'Θρεπτικά ανά μερίδα' },
  'ideas.fun_fact':    { en: 'Fun Fact',            es: 'Dato Curioso',           el: 'Γνωρίζατε ότι' },
  'ideas.quick_recipe':{ en: 'Quick Recipe',        es: 'Receta Rápida',          el: 'Γρήγορη Συνταγή' },
  'ideas.prep_time':   { en: 'Prep time',           es: 'Tiempo de preparación',  el: 'Χρόνος προετοιμασίας' },

  // ── Water card ──
  'water.glasses':     { en: '{n}/{total} glasses', es: '{n}/{total} vasos',      el: '{n}/{total} ποτήρια' },
  'water.add_ml':      { en: '+{n} ml',             es: '+{n} ml',               el: '+{n} ml' },
  'water.title':       { en: 'Water',               es: 'Agua',                   el: 'Νερό' },
  'water.size_label':  { en: 'Glass size',          es: 'Tamaño del vaso',        el: 'Μέγεθος ποτηριού' },

  // ── Log page ──
  'log.today':         { en: 'Today',               es: 'Hoy',                    el: 'Σήμερα' },
  'log.meals_count':   { en: 'Meals · {done} of {total}', es: 'Comidas · {done} de {total}', el: 'Γεύματα · {done} από {total}' },
  'log.analytics':     { en: 'Analytics',           es: 'Análisis',               el: 'Αναλύσεις' },
  'log.lock_all':      { en: 'Lock All',            es: 'Bloquear todo',          el: 'Κλείδωμα' },
  'log.day_locked':    { en: 'Day locked — great work!', es: '¡Día bloqueado!',   el: 'Ημέρα κλειδωμένη!' },

  // ── Home quick actions ──
  'home.food':         { en: 'Food',                es: 'Comida',                 el: 'Τροφή' },
  'home.workout':      { en: 'Workout',             es: 'Entreno',                el: 'Άσκηση' },
  'home.progress':     { en: 'Progress',            es: 'Progreso',               el: 'Πρόοδος' },
  'home.check_in':     { en: 'Check-in',            es: 'Check-in',               el: 'Check-in' },
  'home.supps':        { en: 'Supps',               es: 'Suplementos',            el: 'Συμπλ.' },
  'home.entries_today':{ en: '{n} entr{s} today',   es: '{n} entrada{s} hoy',     el: '{n} εγγραφ{s} σήμερα' },
  'home.log_a_meal':   { en: 'Log a meal',          es: 'Registra una comida',    el: 'Καταγράψτε γεύμα' },
  'home.log_session':  { en: 'Log session',         es: 'Registra sesión',        el: 'Καταγράψτε σεσιόν' },
  'home.remaining':    { en: '{n} remaining',       es: '{n} restantes',          el: '{n} υπόλοιπο' },
  'home.goal_reached': { en: 'Goal reached',        es: 'Objetivo alcanzado',     el: 'Στόχος επιτεύχθηκε' },

  // ── Coach message ──
  'coach_msg.title':   { en: 'Message Coach',       es: 'Mensaje al Coach',       el: 'Μήνυμα στον Coach' },
  'coach_msg.placeholder': { en: 'Ask a question or share how you feel...', es: 'Haz una pregunta o comparte cómo te sientes...', el: 'Κάνε ερώτηση ή μοιράσου πώς νιώθεις...' },
  'coach_msg.send':    { en: 'Send',                es: 'Enviar',                 el: 'Αποστολή' },
  'coach_msg.sent':    { en: 'Sent!',               es: '¡Enviado!',              el: 'Εστάλη!' },
  'coach_msg.no_coach':{ en: 'No coach assigned yet', es: 'Sin coach asignado',   el: 'Δεν έχει οριστεί coach' },

  // ── Log page section headers ──
  'log.section_insights':        { en: 'Insights',           es: 'Perspectivas',          el: 'Συμπεράσματα' },
  'log.section_nutrition_intel': { en: 'Nutrition Intel',    es: 'Intel Nutricional',     el: 'Διατροφικές Πληροφορίες' },

  // ── Calorie heatmap ──
  'heatmap.days_logged':    { en: 'Days logged',    es: 'Días registrados',     el: 'Ημέρες καταγραφής' },
  'heatmap.avg_calories':   { en: 'Avg calories',   es: 'Prom. calorías',       el: 'Μέσες θερμίδες' },
  'heatmap.on_logged_days': { en: 'on logged days', es: 'en días registrados',  el: 'σε ημέρες καταγραφής' },
  'heatmap.current_streak': { en: 'Current streak', es: 'Racha actual',         el: 'Τρέχον σερί' },
  'heatmap.keep_going':     { en: 'keep going!',    es: '¡sigue así!',          el: 'συνέχισε!' },
  'heatmap.start_today':    { en: 'start today',    es: 'empieza hoy',          el: 'ξεκίνα σήμερα' },
  'heatmap.cell_desc':      { en: 'Each cell = one day. Darker gold = more calories logged.', es: 'Cada celda = un día. Oro más oscuro = más calorías.', el: 'Κάθε κελί = μία ημέρα. Πιο σκούρο χρυσό = περισσότερες θερμίδες.' },
  'heatmap.best_day':       { en: 'Best day: {n} kcal.', es: 'Mejor día: {n} kcal.', el: 'Καλύτερη ημέρα: {n} kcal.' },
  'heatmap.legend_min':     { en: '0 kcal',         es: '0 kcal',               el: '0 kcal' },
  'heatmap.legend_max':     { en: '2000+ kcal',     es: '2000+ kcal',           el: '2000+ kcal' },

  // ── Coach food recommendations ──
  'recs.coach_pick':       { en: '⭐ Coach Pick',      es: '⭐ Pick del Coach',              el: '⭐ Επιλογή Coach' },
  'recs.coach_food_picks': { en: 'Coach Food Picks',  es: 'Alimentos del Coach',            el: 'Τρόφιμα Coach' },
  'recs.recommended_foods':{ en: 'Recommended Foods', es: 'Alimentos Recomendados',         el: 'Προτεινόμενα Τρόφιμα' },
  'recs.foods_count':      { en: '{n} foods',         es: '{n} alimentos',                  el: '{n} τρόφιμα' },
  'recs.logged':           { en: 'Logged!',           es: '¡Registrado!',                   el: 'Καταγράφηκε!' },
  'recs.coach_footer':     { en: 'Your coach added these recommendations for your goals', es: 'Tu coach añadió estas recomendaciones para tus objetivos', el: 'Ο coach σου πρόσθεσε αυτές τις συστάσεις για τους στόχους σου' },
  'recs.curated_footer':   { en: 'Evidence-based picks · Tap any food for full macro info + quick-log', es: 'Selecciones basadas en evidencia · Toca para macros completos + registro rápido', el: 'Επιλογές βασισμένες σε αποδείξεις · Πάτα για μακροθρεπτικά + καταγραφή' },
  'recs.log_to_meal':      { en: 'Log to meal',       es: 'Registrar en comida',            el: 'Καταγραφή σε γεύμα' },
  'recs.lunch_dinner':     { en: 'Lunch/Dinner',      es: 'Almuerzo/Cena',                  el: 'Μεσ./Βραδινό' },

  // ── Additional analytics i18n ──

  // ── DailyInsights ──
  'insights.title':                { en: 'Daily Insights',   es: 'Perspectivas del Día',         el: 'Ημερήσιες Παρατηρήσεις' },
  'insights.protein_concentrated': { en: 'Your protein is concentrated at {meal} ({n}g). Spreading it across meals improves muscle protein synthesis.', es: 'Tu proteína está concentrada en {meal} ({n}g). Distribuirla en todas las comidas mejora la síntesis muscular.', el: 'Η πρωτεΐνη σου είναι συγκεντρωμένη στο {meal} ({n}g). Κατανομή σε γεύματα βελτιώνει τη σύνθεση μυϊκής πρωτεΐνης.' },
  'insights.fiber_low':            { en: 'Fiber is only {n}g so far. Adding vegetables, fruits, or whole grains helps with satiety and digestion.', es: 'La fibra es solo {n}g hasta ahora. Añadir verduras, frutas o cereales integrales ayuda con la saciedad y digestión.', el: 'Φυτικές ίνες μόνο {n}g μέχρι τώρα. Λαχανικά, φρούτα ή δημητριακά βοηθούν στον κορεσμό.' },
  'insights.calorie_ahead':        { en: "You're ahead of your calorie pace. Consider lighter meals for the rest of the day.", es: 'Estás adelantado en calorías. Considera comidas más livianas por el resto del día.', el: 'Είσαι μπροστά στον ρυθμό θερμίδων. Σκέψου πιο ελαφριά γεύματα.' },
  'insights.calorie_behind':       { en: "You're behind on calories for this time. Make sure to eat enough for energy and recovery.", es: 'Estás atrasado en calorías para esta hora. Asegúrate de comer suficiente para energía y recuperación.', el: 'Είσαι πίσω στις θερμίδες για αυτή την ώρα. Φρόντισε να τρως αρκετά.' },
  'insights.protein_remaining':    { en: '{n}g protein remaining. Options: Greek yogurt (15g), chicken breast (31g/150g), eggs (6g each).', es: 'Faltan {n}g de proteína. Opciones: yogur griego (15g), pechuga de pollo (31g/150g), huevos (6g c/u).', el: 'Λείπουν {n}g πρωτεΐνης. Επιλογές: γιαούρτι (15g), στήθος κοτ. (31g/150g), αυγά (6g).' },
  'insights.variety':              { en: 'Great food variety! {n} different foods logged. Diverse diets provide broader micronutrient coverage.', es: '¡Gran variedad de alimentos! {n} tipos registrados. La diversidad dietética aporta más micronutrientes.', el: 'Εξαιρετική ποικιλία! {n} διαφορετικά τρόφιμα. Ποικίλη διατροφή δίνει περισσότερα μικροθρεπτικά.' },

  // ── Day names ──
  'day.sunday':    { en: 'Sunday',    es: 'Domingo',    el: 'Κυριακή' },
  'day.monday':    { en: 'Monday',    es: 'Lunes',      el: 'Δευτέρα' },
  'day.tuesday':   { en: 'Tuesday',   es: 'Martes',     el: 'Τρίτη' },
  'day.wednesday': { en: 'Wednesday', es: 'Miércoles',  el: 'Τετάρτη' },
  'day.thursday':  { en: 'Thursday',  es: 'Jueves',     el: 'Πέμπτη' },
  'day.friday':    { en: 'Friday',    es: 'Viernes',    el: 'Παρασκευή' },
  'day.saturday':  { en: 'Saturday',  es: 'Sábado',     el: 'Σάββατο' },
  'day.sun_short': { en: 'Sun', es: 'Dom', el: 'Κυρ' },
  'day.mon_short': { en: 'Mon', es: 'Lun', el: 'Δευ' },
  'day.tue_short': { en: 'Tue', es: 'Mar', el: 'Τρι' },
  'day.wed_short': { en: 'Wed', es: 'Mié', el: 'Τετ' },
  'day.thu_short': { en: 'Thu', es: 'Jue', el: 'Πεμ' },
  'day.fri_short': { en: 'Fri', es: 'Vie', el: 'Παρ' },
  'day.sat_short': { en: 'Sat', es: 'Sáb', el: 'Σαβ' },

  // ── DayPatterns ──
  'patterns.weekday_avg':          { en: 'Weekday avg',    es: 'Prom. semana',         el: 'Μέσος εβδομάδας' },
  'patterns.weekend_avg':          { en: 'Weekend avg',    es: 'Prom. fin de semana',  el: 'Μέσος Σαββ/κου' },
  'patterns.peak':                 { en: 'Peak',           es: 'Máx.',                 el: 'Μέγιστο' },
  'patterns.low':                  { en: 'Low',            es: 'Mín.',                 el: 'Ελάχιστο' },
  'patterns.insight_day_more':     { en: '{day}s you eat {n}% more {macro} than average', es: 'Los {day}s comes {n}% más {macro} que el promedio', el: 'Τις {day} τρώτε {n}% περισσότερο {macro} από τον μέσο όρο' },
  'patterns.insight_weekend_more': { en: 'Weekends you consume {n}% more {macro} than weekdays', es: 'Los fines de semana consumes {n}% más {macro} que entre semana', el: 'Τα Σαββατοκύριακα καταναλώνεις {n}% περισσότερο {macro} από τις εργάσιμες' },
  'patterns.insight_weekday_more': { en: 'Weekdays you consume {n}% more {macro} than weekends', es: 'Entre semana consumes {n}% más {macro} que los fines de semana', el: 'Τις εργάσιμες καταναλώνεις {n}% περισσότερο {macro} από τα Σαββατοκύριακα' },
  'patterns.no_data':              { en: 'Not enough data yet', es: 'Datos insuficientes aún', el: 'Ανεπαρκή δεδομένα ακόμα' },
  'patterns.log_more':             { en: 'Log meals for 7+ days to see your patterns', es: 'Registra comidas por 7+ días para ver tus patrones', el: 'Καταγράψε γεύματα για 7+ ημέρες για να δεις τα μοτίβα σου' },
  'patterns.7days':                { en: '7 days',         es: '7 días',               el: '7 ημέρες' },
  'patterns.30days':               { en: '30 days',        es: '30 días',              el: '30 ημέρες' },
  'patterns.custom':               { en: 'Custom',         es: 'Personalizado',        el: 'Προσαρμοσμένο' },

  // ── General date form labels ──
  'general.from':  { en: 'From', es: 'Desde', el: 'Από' },
  'general.to':    { en: 'To',   es: 'Hasta', el: 'Έως' },

  // ── MacroAdherence ──
  'adherence.subtitle':    { en: 'How close you get to your daily targets. 90–110% of target = on track.', es: 'Qué tan cerca estás de tus objetivos diarios. 90–110% del objetivo = en camino.', el: 'Πόσο κοντά στους στόχους σου. 90–110% = σε πορεία.' },
  'adherence.excellent':   { en: 'Excellent consistency!', es: '¡Consistencia excelente!', el: 'Εξαιρετική συνέπεια!' },
  'adherence.good':        { en: 'Good — keep pushing',    es: 'Bien — ¡sigue adelante!', el: 'Καλά — συνέχισε!' },
  'adherence.improve':     { en: 'Room to improve',        es: 'Margen de mejora',        el: 'Χώρος για βελτίωση' },
  'adherence.days_logged': { en: '{n} of {total} days logged this week', es: '{n} de {total} días registrados esta semana', el: '{n} από {total} ημέρες καταγράφηκαν αυτή την εβδομάδα' },
  'adherence.on_target':   { en: '{n}/{total}d on target',  es: '{n}/{total}d en objetivo', el: '{n}/{total}η στον στόχο' },
  'adherence.avg_target':  { en: 'avg {avg}{unit} · target {target}{unit}', es: 'prom {avg}{unit} · objetivo {target}{unit}', el: 'μέσος {avg}{unit} · στόχος {target}{unit}' },
  'adherence.no_data':     { en: 'No data logged this week yet',      es: 'Sin datos registrados esta semana',       el: 'Χωρίς δεδομένα αυτή την εβδομάδα' },
  'adherence.log_meals':   { en: 'Log meals to see your adherence score', es: 'Registra comidas para ver tu puntuación', el: 'Καταγράψε γεύματα για να δεις το σκορ σου' },
  'adherence.target_val':  { en: 'Target: {n}{unit}',      es: 'Objetivo: {n}{unit}',      el: 'Στόχος: {n}{unit}' },
  'adherence.target_label': { en: 'Target',                es: 'Objetivo',                  el: 'Στόχος' },

  // ── MonthlyReport ──
  'report.period_week':     { en: '7 days',     es: '7 días',      el: '7 ημέρες' },
  'report.period_month':    { en: 'Month',      es: 'Mes',         el: 'Μήνας' },
  'report.period_custom':   { en: 'Custom',     es: 'Personalizado', el: 'Προσαρμοσμένο' },
  'report.no_data':         { en: 'No data logged in this period',    es: 'Sin datos en este período',              el: 'Χωρίς δεδομένα σε αυτή την περίοδο' },
  'report.consistency_pct': { en: '{n}% consistency', es: '{n}% consistencia', el: '{n}% συνέπεια' },
  'report.grade_start':     { en: 'Start logging to see your grade here.', es: 'Empieza a registrar para ver tu nota aquí.', el: 'Ξεκίνα να καταγράφεις για να δεις τον βαθμό σου.' },
  'report.grade_A':         { en: 'Outstanding consistency — you hit protein on {n}% of days. Keep it up!', es: 'Consistencia excepcional — proteína el {n}% de los días. ¡Sigue así!', el: 'Εξαιρετική συνέπεια — πρωτεΐνη το {n}% των ημερών. Συνέχισε!' },
  'report.grade_B':         { en: 'Solid work. {n}% logging rate — push protein to 90%+ on logged days.', es: 'Buen trabajo. {n}% de registro — lleva proteína al 90%+ en días registrados.', el: 'Καλή δουλειά. {n}% καταγραφές — στόχευσε σε 90%+ πρωτεΐνης.' },
  'report.grade_C':         { en: 'Room to grow. {n}% protein days logged. Focus on consistency first.', es: 'Margen de mejora. {n}% días con proteína. Enfócate en la consistencia primero.', el: 'Χώρος βελτίωσης. {n}% ημέρες με πρωτεΐνη. Εστίασε στη συνέπεια πρώτα.' },
  'report.grade_D':         { en: 'Tracking gaps are hurting your grade. Even partial logs count — start there.', es: 'Las brechas de registro afectan tu nota. Incluso registros parciales cuentan.', el: 'Κενά καταγραφής επηρεάζουν τον βαθμό σου. Ακόμα και μερικές καταγραφές μετράνε.' },
  'report.grade_F':         { en: 'Every streak starts somewhere. Log tomorrow and build from there.', es: 'Toda racha empieza en algún lugar. Registra mañana y construye desde ahí.', el: 'Κάθε σερί ξεκινά κάπου. Καταγράψε αύριο και χτίσε από εκεί.' },
  'report.logged_days':     { en: 'Logged days',    es: 'Días registrados', el: 'Ημέρες καταγραφής' },
  'report.protein_days':    { en: 'Protein days',   es: 'Días proteína',    el: 'Ημέρες πρωτεΐνης' },
  'report.calorie_target':  { en: 'Calorie target', es: 'Objetivo calórico', el: 'Στόχος θερμίδων' },
  'report.avg_calories':    { en: 'Avg Calories',   es: 'Prom. Calorías',   el: 'Μέσες Θερμίδες' },
  'report.avg_protein':     { en: 'Avg Protein',    es: 'Prom. Proteína',   el: 'Μέση Πρωτεΐνη' },
  'report.avg_carbs':       { en: 'Avg Carbs',      es: 'Prom. Carbos',     el: 'Μέσοι Υδατάνθρακες' },
  'report.avg_fat':         { en: 'Avg Fat',        es: 'Prom. Grasa',      el: 'Μέσο Λίπος' },
  'report.best_day':        { en: 'Best day',       es: 'Mejor día',        el: 'Καλύτερη ημέρα' },
  'report.worst_day':       { en: 'Worst day',      es: 'Peor día',         el: 'Χειρότερη ημέρα' },
  'report.closest_targets': { en: 'Closest to all targets',   es: 'Más cercano a todos los objetivos', el: 'Πιο κοντά σε όλους τους στόχους' },
  'report.furthest_targets':{ en: 'Furthest from targets',    es: 'Más alejado de los objetivos',     el: 'Πιο μακριά από τους στόχους' },
  'report.vs_period':       { en: 'vs. previous period',      es: 'vs. período anterior',             el: 'σε σχέση με προηγ. περίοδο' },
  'report.consistency':     { en: 'Consistency',   es: 'Consistencia',     el: 'Συνέπεια' },
  'report.kcal_day':        { en: 'kcal/day',      es: 'kcal/día',         el: 'kcal/ημέρα' },
  'report.per_day':         { en: 'per day',       es: 'por día',          el: 'ανά ημέρα' },
  'report.pct_target':      { en: '{n}% of target', es: '{n}% del objetivo', el: '{n}% του στόχου' },
  'report.days_format':     { en: '{n} / {total} days',       es: '{n} / {total} días',          el: '{n} / {total} ημέρες' },
  'report.days_pct_format': { en: '{n} / {total} days ≥90%',  es: '{n} / {total} días ≥90%',     el: '{n} / {total} ημέρες ≥90%' },
  'report.days_on_target':  { en: '{n} / {total} days on-target', es: '{n} / {total} días en objetivo', el: '{n} / {total} ημέρες στον στόχο' },
  'report.target_kcal':     { en: 'Target: {n} kcal', es: 'Objetivo: {n} kcal', el: 'Στόχος: {n} kcal' },
  'report.target_g':        { en: 'Target: {n}g',     es: 'Objetivo: {n}g',     el: 'Στόχος: {n}g' },

  // ── Guided workout — client rebuild (overhaul/workout-branded-premium) ──
  'workout.program_today':    { en: '{program} · Today', es: '{program} · Hoy', el: '{program} · Σήμερα' },
  'workout.start_workout':    { en: 'Start workout', es: 'Iniciar entreno', el: 'Έναρξη προπόνησης' },
  'workout.loading':          { en: 'Loading…', es: 'Cargando…', el: 'Φόρτωση…' },
  'workout.also_today':       { en: 'Also today', es: 'También hoy', el: 'Επίσης σήμερα' },
  'workout.exercise_count':   { en: '{n} exercises', es: '{n} ejercicios', el: '{n} ασκήσεις' },
  'workout.est_sets':         { en: '~{n} sets', es: '~{n} series', el: '~{n} σετ' },
  'workout.difficulty_beginner':     { en: 'Beginner', es: 'Principiante', el: 'Αρχάριος' },
  'workout.difficulty_intermediate': { en: 'Intermediate', es: 'Intermedio', el: 'Μεσαίος' },
  'workout.difficulty_advanced':     { en: 'Advanced', es: 'Avanzado', el: 'Προχωρημένος' },
  'workout.rest_day':         { en: 'Rest day', es: 'Día de descanso', el: 'Ημέρα ξεκούρασης' },
  'workout.rest_nothing_today': { en: 'Nothing scheduled today', es: 'Nada programado hoy', el: 'Τίποτα προγραμματισμένο σήμερα' },
  'workout.next_session':     { en: 'Next session:', es: 'Próxima sesión:', el: 'Επόμενη συνεδρία:' },
  'workout.tomorrow':         { en: 'tomorrow', es: 'mañana', el: 'αύριο' },
  'workout.train_anyway':     { en: 'Train anyway', es: 'Entrenar igual', el: 'Προπόνηση ούτως ή άλλως' },
  'workout.rest_tip_1':       { en: 'Recovery is where the adaptation happens — aim for 7-9h of sleep tonight.', es: 'La recuperación es donde ocurre la adaptación — apunta a 7-9h de sueño esta noche.', el: 'Η αποκατάσταση είναι εκεί όπου γίνεται η προσαρμογή — στόχευσε σε 7-9 ώρες ύπνου απόψε.' },
  'workout.rest_tip_2':       { en: 'Light movement helps: a 20-30 min walk speeds up recovery without adding fatigue.', es: 'El movimiento ligero ayuda: una caminata de 20-30 min acelera la recuperación sin añadir fatiga.', el: 'Η ελαφριά κίνηση βοηθά: 20-30 λεπτά περπάτημα επιταχύνουν την αποκατάσταση χωρίς επιπλέον κόπωση.' },
  'workout.rest_tip_3':       { en: 'Hit your protein target today — muscle repair does not take rest days.', es: 'Cumple tu objetivo de proteína hoy — la reparación muscular no descansa.', el: 'Πέτυχε τον στόχο πρωτεΐνης σήμερα — η μυϊκή αποκατάσταση δεν κάνει ρεπό.' },
  'workout.rest_tip_4':       { en: 'Hydrate and stretch the muscle groups you trained this week.', es: 'Hidrátate y estira los grupos musculares que entrenaste esta semana.', el: 'Ενυδατώσου και κάνε διατάσεις στις μυϊκές ομάδες που γύμνασες αυτή την εβδομάδα.' },
  'workout.rest_tip_5':       { en: 'A rest day is part of the program, not a break from it.', es: 'Un día de descanso es parte del programa, no una pausa.', el: 'Η ημέρα ξεκούρασης είναι μέρος του προγράμματος, όχι διάλειμμα από αυτό.' },
  'workout.resting':          { en: 'Resting', es: 'Descansando', el: 'Ξεκούραση' },
  'workout.rested_go':        { en: 'Rested — go', es: 'Descansado — dale', el: 'Ξεκουράστηκες — πάμε' },
  'workout.rest_dismiss_hint': { en: 'Rest since last set — tap to dismiss', es: 'Descanso desde la última serie — toca para cerrar', el: 'Ξεκούραση από το τελευταίο σετ — πάτησε για κλείσιμο' },
  'workout.exit':             { en: 'Exit workout', es: 'Salir del entreno', el: 'Έξοδος από την προπόνηση' },
  'workout.sets_progress':    { en: '{done}/{total} sets', es: '{done}/{total} series', el: '{done}/{total} σετ' },
  'workout.up_next':          { en: 'Up next', es: 'Sigue', el: 'Ακολουθεί' },
  'workout.add_extra_set':    { en: 'Add extra set', es: 'Añadir serie extra', el: 'Πρόσθεσε έξτρα σετ' },
  'workout.skip':             { en: 'Skip', es: 'Saltar', el: 'Παράλειψη' },
  'workout.exercise_skipped': { en: 'Exercise skipped', es: 'Ejercicio saltado', el: 'Η άσκηση παραλείφθηκε' },
  'workout.undo_skip':        { en: 'Undo skip', es: 'Deshacer salto', el: 'Αναίρεση παράλειψης' },
  'workout.next_exercise':    { en: 'Next exercise', es: 'Siguiente ejercicio', el: 'Επόμενη άσκηση' },
  'workout.end_early':        { en: 'End', es: 'Terminar', el: 'Τέλος' },
  'workout.saving':           { en: 'Saving…', es: 'Guardando…', el: 'Αποθήκευση…' },
  'workout.template_done':    { en: '{name} done', es: '{name} completado', el: '{name} ολοκληρώθηκε' },
  'workout.sets_label':       { en: 'Sets', es: 'Series', el: 'Σετ' },
  'workout.pr_count':         { en: '{n} personal record(s)', es: '{n} récord(s) personal(es)', el: '{n} προσωπικό(ά) ρεκόρ' },
  'workout.pain_shared':      { en: '{n} pain flag(s) shared with your coach', es: '{n} señal(es) de dolor compartida(s) con tu coach', el: '{n} ένδειξη(-εις) πόνου κοινοποιήθηκαν στον προπονητή σου' },
  'workout.done':             { en: 'Done', es: 'Listo', el: 'Έγινε' },
  'workout.warmup_hint':      { en: 'Tap to mark as warmup', es: 'Toca para marcar como calentamiento', el: 'Πάτησε για σήμανση ως ζέσταμα' },
  'workout.complete_set':     { en: 'Complete set', es: 'Completar serie', el: 'Ολοκλήρωση σετ' },
  'workout.undo_set':         { en: 'Undo set', es: 'Deshacer serie', el: 'Αναίρεση σετ' },
  'workout.report_pain':      { en: 'Report pain', es: 'Reportar dolor', el: 'Αναφορά πόνου' },
  'workout.freestyle':        { en: 'Freestyle', es: 'Libre', el: 'Ελεύθερο' },
  'workout.cardio':           { en: 'Cardio', es: 'Cardio', el: 'Cardio' },
  'workout.log_cardio':       { en: 'Log cardio', es: 'Registrar cardio', el: 'Καταγραφή cardio' },
  'workout.no_program_hint':  { en: 'No training program yet — ask your coach for one', es: 'Aún sin programa de entrenamiento — pídeselo a tu coach', el: 'Δεν υπάρχει πρόγραμμα προπόνησης ακόμα — ζήτησέ το από τον προπονητή σου' },
  'workout.stats':            { en: 'Stats', es: 'Estadísticas', el: 'Στατιστικά' },
  'workout.form_check':       { en: 'Form Check', es: 'Chequeo de técnica', el: 'Έλεγχος τεχνικής' },
  'workout.view_full_history': { en: 'View full history →', es: 'Ver historial completo →', el: 'Δες το πλήρες ιστορικό →' },
  'workout.no_sets_cardio':   { en: 'No sets recorded (cardio / quick log)', es: 'Sin series registradas (cardio / registro rápido)', el: 'Χωρίς καταγεγραμμένα σετ (cardio / γρήγορη καταγραφή)' },
  'workout.start_today_hint': { en: 'Start today’s session above to begin tracking PRs', es: 'Inicia la sesión de hoy arriba para empezar a registrar RPs', el: 'Ξεκίνα τη σημερινή συνεδρία για να καταγράφεις PR' },
  'workout.back_to_workout':  { en: 'Back to Workout', es: 'Volver a Entreno', el: 'Πίσω στην Προπόνηση' },
  // ── Workout ↔ dashboard integration (home card + finish celebration) ──
  'workout.strength': { en: 'Strength', es: 'Fuerza', el: 'Δύναμη' },
  'workout.home_title': { en: "Today's Training", es: 'Entreno de Hoy', el: 'Σημερινή Προπόνηση' },
  'workout.home_done': { en: 'Session complete', es: 'Sesión completada', el: 'Η προπόνηση ολοκληρώθηκε' },
  'workout.home_volume': { en: 'Volume', es: 'Volumen', el: 'Όγκος' },
  'workout.home_sets': { en: 'Sets', es: 'Series', el: 'Σετ' },
  'workout.home_prs': { en: 'PRs', es: 'RPs', el: 'PR' },
  'workout.home_rest': { en: 'Rest day — recovery is training too', es: 'Día de descanso — recuperarse también es entrenar', el: 'Μέρα ξεκούρασης — η αποκατάσταση είναι κι αυτή προπόνηση' },
  'workout.home_week_sessions': { en: 'sessions this week', es: 'sesiones esta semana', el: 'προπονήσεις αυτή την εβδομάδα' },
  'workout.home_quickstart_hint': { en: 'No session yet this week', es: 'Aún sin sesión esta semana', el: 'Καμία προπόνηση ακόμη αυτή την εβδομάδα' },
  'workout.home_train': { en: 'Train', es: 'Entrenar', el: 'Προπόνηση' },
  'workout.day_0': { en: 'Sunday', es: 'domingo', el: 'Κυριακή' },
  'workout.day_1': { en: 'Monday', es: 'lunes', el: 'Δευτέρα' },
  'workout.day_2': { en: 'Tuesday', es: 'martes', el: 'Τρίτη' },
  'workout.day_3': { en: 'Wednesday', es: 'miércoles', el: 'Τετάρτη' },
  'workout.day_4': { en: 'Thursday', es: 'jueves', el: 'Πέμπτη' },
  'workout.day_5': { en: 'Friday', es: 'viernes', el: 'Παρασκευή' },
  'workout.day_6': { en: 'Saturday', es: 'sábado', el: 'Σάββατο' },
  'workout.summary_title': { en: 'Session Complete', es: 'Sesión Completada', el: 'Προπόνηση Ολοκληρώθηκε' },
  'workout.summary_volume': { en: 'total volume', es: 'volumen total', el: 'συνολικός όγκος' },
  'workout.summary_sets': { en: 'Sets', es: 'Series', el: 'Σετ' },
  'workout.summary_prs': { en: 'PRs', es: 'RPs', el: 'PR' },
  'workout.summary_minutes': { en: 'Min', es: 'Min', el: 'Λεπτά' },
  'workout.summary_pr_line': { en: 'New personal record — strongest yet.', es: 'Nuevo récord personal — tu mejor marca.', el: 'Νέο προσωπικό ρεκόρ — η καλύτερή σου επίδοση.' },
  'workout.summary_done': { en: 'Done', es: 'Listo', el: 'Τέλος' },
  // ── Workout premium overhaul (picker, timer, cardio, landing) ──
  'workout.ready': { en: 'Ready', es: 'Listo', el: 'Έτοιμο' },
  'workout.timer_hint': { en: 'Timer starts on your first set', es: 'El cronómetro inicia con tu primera serie', el: 'Το χρονόμετρο ξεκινά με το πρώτο σου σετ' },
  'workout.strength_sub': { en: 'Weights · sets · PRs', es: 'Pesos · series · RPs', el: 'Βάρη · σετ · PR' },
  'workout.cardio_sub': { en: 'Run · cycle · HIIT', es: 'Correr · bici · HIIT', el: 'Τρέξιμο · ποδήλατο · HIIT' },
  'workout.recent': { en: 'Recent', es: 'Reciente', el: 'Πρόσφατα' },
  'workout.see_all': { en: 'See all', es: 'Ver todo', el: 'Όλα' },
  'workout.no_workouts': { en: 'No workouts yet', es: 'Aún no hay entrenos', el: 'Καμία προπόνηση ακόμη' },
  'workout.no_workouts_sub': { en: 'Log your first session to start tracking progress', es: 'Registra tu primera sesión para empezar a ver tu progreso', el: 'Κατέγραψε την πρώτη σου προπόνηση για να παρακολουθείς την πρόοδο' },
  'workout.quick_actions': { en: 'Quick actions', es: 'Acciones rápidas', el: 'Γρήγορες ενέργειες' },
  // Exercise picker
  'workout.picker_title': { en: 'Add exercise', es: 'Agregar ejercicio', el: 'Προσθήκη άσκησης' },
  'workout.picker_recent': { en: 'Recent', es: 'Recientes', el: 'Πρόσφατα' },
  'workout.picker_count': { en: 'exercises', es: 'ejercicios', el: 'ασκήσεις' },
  'workout.picker_none': { en: 'No exercises match', es: 'Ningún ejercicio coincide', el: 'Καμία άσκηση δεν ταιριάζει' },
  'workout.picker_custom': { en: 'Create custom exercise', es: 'Crear ejercicio propio', el: 'Δημιουργία δικής σου άσκησης' },
  'workout.compound': { en: 'Compound', es: 'Compuesto', el: 'Σύνθετη' },
  // Custom exercise modal
  'workout.custom_title': { en: 'Custom exercise', es: 'Ejercicio propio', el: 'Δική σου άσκηση' },
  'workout.custom_name': { en: 'Exercise name', es: 'Nombre del ejercicio', el: 'Όνομα άσκησης' },
  'workout.custom_muscle': { en: 'Muscle group', es: 'Grupo muscular', el: 'Μυϊκή ομάδα' },
  'workout.custom_equipment': { en: 'Equipment', es: 'Equipamiento', el: 'Εξοπλισμός' },
  'workout.custom_compound': { en: 'Compound movement', es: 'Movimiento compuesto', el: 'Σύνθετη κίνηση' },
  'workout.custom_cancel': { en: 'Cancel', es: 'Cancelar', el: 'Άκυρο' },
  'workout.custom_create': { en: 'Create', es: 'Crear', el: 'Δημιουργία' },
  'workout.custom_saving': { en: 'Saving…', es: 'Guardando…', el: 'Αποθήκευση…' },
  // Cardio quick-log
  'workout.cardio_type': { en: 'Activity type', es: 'Tipo de actividad', el: 'Τύπος δραστηριότητας' },
  'workout.cardio_duration': { en: 'Duration', es: 'Duración', el: 'Διάρκεια' },
  'workout.cardio_distance': { en: 'Distance (optional)', es: 'Distancia (opcional)', el: 'Απόσταση (προαιρετικό)' },
  'workout.cardio_log': { en: 'Log session', es: 'Registrar sesión', el: 'Καταγραφή προπόνησης' },
  'workout.cardio_run': { en: 'Run', es: 'Correr', el: 'Τρέξιμο' },
  'workout.cardio_cycle': { en: 'Cycle', es: 'Bici', el: 'Ποδήλατο' },
  'workout.cardio_swim': { en: 'Swim', es: 'Nadar', el: 'Κολύμπι' },
  'workout.cardio_row': { en: 'Row', es: 'Remo', el: 'Κωπηλασία' },
  'workout.cardio_hiit': { en: 'HIIT', es: 'HIIT', el: 'HIIT' },
  'workout.cardio_walk': { en: 'Walk', es: 'Caminar', el: 'Περπάτημα' },
  'workout.cardio_other': { en: 'Other', es: 'Otro', el: 'Άλλο' },
  // Pain flag recap
  'workout.pain_recorded': { en: 'pain flags recorded', es: 'alertas de dolor registradas', el: 'σημάνσεις πόνου' },
  'workout.pain_severity': { en: 'severity', es: 'severidad', el: 'σοβαρότητα' },
  // Muscle groups
  'workout.muscle_chest': { en: 'Chest', es: 'Pecho', el: 'Στήθος' },
  'workout.muscle_back': { en: 'Back', es: 'Espalda', el: 'Πλάτη' },
  'workout.muscle_shoulders': { en: 'Shoulders', es: 'Hombros', el: 'Ώμοι' },
  'workout.muscle_biceps': { en: 'Biceps', es: 'Bíceps', el: 'Δικέφαλα' },
  'workout.muscle_triceps': { en: 'Triceps', es: 'Tríceps', el: 'Τρικέφαλα' },
  'workout.muscle_forearms': { en: 'Forearms', es: 'Antebrazos', el: 'Πήχεις' },
  'workout.muscle_quads': { en: 'Quads', es: 'Cuádriceps', el: 'Τετρακέφαλα' },
  'workout.muscle_hamstrings': { en: 'Hamstrings', es: 'Isquios', el: 'Οπίσθιοι μηριαίοι' },
  'workout.muscle_glutes': { en: 'Glutes', es: 'Glúteos', el: 'Γλουτοί' },
  'workout.muscle_calves': { en: 'Calves', es: 'Gemelos', el: 'Γάμπες' },
  'workout.muscle_core': { en: 'Core', es: 'Core', el: 'Κορμός' },
  'workout.muscle_full_body': { en: 'Full body', es: 'Cuerpo completo', el: 'Όλο το σώμα' },
  'workout.muscle_cardio': { en: 'Cardio', es: 'Cardio', el: 'Cardio' },
  // ── Chat attachments overhaul (photos + voice notes) ──
  'chat.today': { en: 'Today', es: 'Hoy', el: 'Σήμερα' },
  'chat.yesterday': { en: 'Yesterday', es: 'Ayer', el: 'Χθες' },
  'chat.loading': { en: 'Loading…', es: 'Cargando…', el: 'Φόρτωση…' },
  'chat.empty': { en: 'No messages yet — say hi', es: 'Aún no hay mensajes — saluda', el: 'Κανένα μήνυμα ακόμη — πες ένα γεια' },
  'chat.placeholder': { en: 'Message…', es: 'Mensaje…', el: 'Μήνυμα…' },
  'chat.send': { en: 'Send message', es: 'Enviar mensaje', el: 'Αποστολή μηνύματος' },
  'chat.attach_photo': { en: 'Attach photo', es: 'Adjuntar foto', el: 'Επισύναψη φωτογραφίας' },
  'chat.record_voice': { en: 'Record voice note', es: 'Grabar nota de voz', el: 'Ηχογράφηση φωνητικού' },
  'chat.recording': { en: 'Recording', es: 'Grabando', el: 'Ηχογράφηση' },
  'chat.stop_recording': { en: 'Stop and attach', es: 'Detener y adjuntar', el: 'Διακοπή και επισύναψη' },
  'chat.photo_ready': { en: 'Photo ready to send', es: 'Foto lista para enviar', el: 'Η φωτογραφία είναι έτοιμη' },
  'chat.voice_ready': { en: 'Voice note ready to send', es: 'Nota de voz lista para enviar', el: 'Το φωνητικό είναι έτοιμο' },
  'chat.remove_attachment': { en: 'Remove attachment', es: 'Quitar adjunto', el: 'Αφαίρεση συνημμένου' },
  'chat.attach_failed': { en: 'Could not attach — try again', es: 'No se pudo adjuntar — inténtalo de nuevo', el: 'Αποτυχία επισύναψης — δοκίμασε ξανά' },
  'chat.send_failed': { en: 'Message not sent — try again', es: 'No se envió el mensaje — inténtalo de nuevo', el: 'Το μήνυμα δεν στάλθηκε — δοκίμασε ξανά' },
  'chat.mic_denied': { en: 'Microphone unavailable — check permissions', es: 'Micrófono no disponible — revisa los permisos', el: 'Το μικρόφωνο δεν είναι διαθέσιμο — έλεγξε τις άδειες' },
  'chat.preview_photo': { en: 'Photo', es: 'Foto', el: 'Φωτογραφία' },
  'chat.preview_voice': { en: 'Voice note', es: 'Nota de voz', el: 'Φωνητικό μήνυμα' },

  // ── Workout 10/10 wave (info sheet, plate calc, supersets, units, rest) ──
  'workout.info_title': { en: 'Exercise info', es: 'Info del ejercicio', el: 'Πληροφορίες άσκησης' },
  'workout.info_cue': { en: 'Form cue', es: 'Técnica', el: 'Τεχνική' },
  'workout.info_pr': { en: 'Personal record', es: 'Récord personal', el: 'Προσωπικό ρεκόρ' },
  'workout.info_last': { en: 'Recent sessions', es: 'Sesiones recientes', el: 'Πρόσφατες προπονήσεις' },
  'workout.info_no_history': { en: 'No history yet — log a set to start tracking', es: 'Sin historial aún — registra una serie para empezar', el: 'Χωρίς ιστορικό ακόμη — κατέγραψε ένα σετ για να ξεκινήσεις' },
  'workout.plate_title': { en: 'Plate calculator', es: 'Calculadora de discos', el: 'Υπολογιστής δίσκων' },
  'workout.plate_per_side': { en: 'Plates per side', es: 'Discos por lado', el: 'Δίσκοι ανά πλευρά' },
  'workout.plate_bar': { en: 'Bar', es: 'Barra', el: 'Μπάρα' },
  'workout.plate_below_bar': { en: 'Target is below the bar weight', es: 'El objetivo es menor que el peso de la barra', el: 'Ο στόχος είναι κάτω από το βάρος της μπάρας' },
  'workout.plate_bar_only': { en: 'Empty bar — no plates needed', es: 'Barra sola — sin discos', el: 'Σκέτη μπάρα — χωρίς δίσκους' },
  'workout.warmup_title': { en: 'Warm-up ramp', es: 'Series de calentamiento', el: 'Σετ προθέρμανσης' },
  'workout.superset': { en: 'Superset', es: 'Superserie', el: 'Superset' },
  'workout.superset_link': { en: 'Link with next exercise', es: 'Enlazar con el siguiente', el: 'Σύνδεση με την επόμενη' },
  'workout.superset_unlink': { en: 'Unlink superset', es: 'Desenlazar superserie', el: 'Αποσύνδεση superset' },
  'workout.rest_target': { en: 'Rest target', es: 'Descanso objetivo', el: 'Στόχος ξεκούρασης' },

  // ── Weekday names (program cards) ──
  'general.weekday_sunday':    { en: 'Sunday', es: 'domingo', el: 'Κυριακή' },
  'general.weekday_monday':    { en: 'Monday', es: 'lunes', el: 'Δευτέρα' },
  'general.weekday_tuesday':   { en: 'Tuesday', es: 'martes', el: 'Τρίτη' },
  'general.weekday_wednesday': { en: 'Wednesday', es: 'miércoles', el: 'Τετάρτη' },
  'general.weekday_thursday':  { en: 'Thursday', es: 'jueves', el: 'Πέμπτη' },
  'general.weekday_friday':    { en: 'Friday', es: 'viernes', el: 'Παρασκευή' },
  'general.weekday_saturday':  { en: 'Saturday', es: 'sábado', el: 'Σάββατο' },

  // ── Smart-insight protein-first fallbacks + pacing ──
  'insight.protein_hit':      { en: 'Protein target hit for today', es: 'Objetivo de proteína cumplido hoy', el: 'Ο στόχος πρωτεΐνης επιτεύχθηκε σήμερα' },
  'insight.protein_progress': { en: 'Protein: {n} of {target}g today', es: 'Proteína: {n} de {target}g hoy', el: 'Πρωτεΐνη: {n} από {target}g σήμερα' },
  'insight.keep_logging':     { en: 'Nice logging — keep it up', es: 'Buen registro — sigue así', el: 'Καλή καταγραφή — συνέχισε έτσι' },
  'insights.protein_ahead':   { en: 'Strong protein pace — ahead of schedule for today.', es: 'Buen ritmo de proteína — vas adelantado hoy.', el: 'Δυνατός ρυθμός πρωτεΐνης — μπροστά από το πρόγραμμα σήμερα.' },
  'insights.protein_behind':  { en: 'Protein is lagging today — build your next meal around it.', es: 'La proteína va atrasada hoy — céntrala en tu próxima comida.', el: 'Η πρωτεΐνη υστερεί σήμερα — βάσισε το επόμενο γεύμα σου σε αυτήν.' },

  // ── Empty-state CTAs (premium polish pass) ──
  'dash.message_coach_cta':   { en: 'Message your coach', es: 'Escribe a tu coach', el: 'Στείλε μήνυμα στον coach σου' },
  'progress.log_weight_cta':  { en: 'Log a weight now', es: 'Registra un peso ahora', el: 'Κατέγραψε βάρος τώρα' },
  'progress.need_two_weights': { en: 'Log at least 2 weights to see a trend', es: 'Registra al menos 2 pesos para ver la tendencia', el: 'Κατάγραψε τουλάχιστον 2 μετρήσεις βάρους για να δεις την τάση' },
  // ── Progress mega overhaul (registry panels + journey + customize) ──
  'progress.subtitle': { en: 'Track your body & habits', es: 'Sigue tu cuerpo y tus hábitos', el: 'Παρακολούθησε σώμα και συνήθειες' },
  'progress.entries': { en: 'entries', es: 'registros', el: 'καταχωρήσεις' },
  'progress.panel_journey': { en: 'Your Journey', es: 'Tu Camino', el: 'Η Διαδρομή σου' },
  'progress.panel_weight': { en: 'Weight Trend', es: 'Tendencia de Peso', el: 'Τάση Βάρους' },
  'progress.panel_goal': { en: 'Goal Projection', es: 'Proyección de Meta', el: 'Πρόβλεψη Στόχου' },
  'progress.panel_bodycomp': { en: 'Body Composition', es: 'Composición Corporal', el: 'Σύσταση Σώματος' },
  'progress.panel_macros': { en: 'Weekly Macros', es: 'Macros Semanales', el: 'Εβδομαδιαία Μακροθρεπτικά' },
  'progress.panel_stats': { en: 'Current Stats', es: 'Datos Actuales', el: 'Τρέχοντα Στοιχεία' },
  'progress.panel_radar': { en: 'Habit Balance', es: 'Balance de Hábitos', el: 'Ισορροπία Συνηθειών' },
  'progress.panel_habits': { en: 'Completed Habits', es: 'Hábitos Completados', el: 'Ολοκληρωμένες Συνήθειες' },
  'progress.panel_photos': { en: 'Progress Photos', es: 'Fotos de Progreso', el: 'Φωτογραφίες Προόδου' },
  'progress.journey_current': { en: 'Current', es: 'Actual', el: 'Τρέχον' },
  'progress.journey_change': { en: 'Total change', es: 'Cambio total', el: 'Συνολική μεταβολή' },
  'progress.journey_streak': { en: 'Habit streak', es: 'Racha de hábito', el: 'Σερί συνήθειας' },
  'progress.journey_days': { en: 'd', es: 'd', el: 'μ' },
  'progress.period_30d': { en: '30d', es: '30d', el: '30μ' },
  'progress.period_90d': { en: '90d', es: '90d', el: '90μ' },
  'progress.period_all': { en: 'All', es: 'Todo', el: 'Όλα' },
  'progress.log_measurement': { en: 'Log measurement', es: 'Registrar medición', el: 'Καταγραφή μέτρησης' },
  'progress.form_weight': { en: 'Weight (kg)*', es: 'Peso (kg)*', el: 'Βάρος (kg)*' },
  'progress.form_bf': { en: 'Body Fat %', es: '% Grasa Corporal', el: '% Σωματικού Λίπους' },
  'progress.form_waist': { en: 'Waist (cm)', es: 'Cintura (cm)', el: 'Μέση (cm)' },
  'progress.need_three_weights': { en: 'Log at least 3 weights to see projections', es: 'Registra al menos 3 pesos para ver proyecciones', el: 'Κατάγραψε τουλάχιστον 3 μετρήσεις για προβλέψεις' },
  'progress.weekly_trend': { en: 'Weekly trend', es: 'Tendencia semanal', el: 'Εβδομαδιαία τάση' },
  'progress.projection_prefix': { en: 'At this rate, you will reach', es: 'A este ritmo, alcanzarás', el: 'Με αυτόν τον ρυθμό θα φτάσεις' },
  'progress.projection_in': { en: 'in', es: 'en', el: 'σε' },
  'progress.projection_weeks': { en: 'weeks', es: 'semanas', el: 'εβδομάδες' },
  'progress.wrong_way_loss': { en: 'Trend moving away from your fat loss goal', es: 'La tendencia se aleja de tu meta de pérdida de grasa', el: 'Η τάση απομακρύνεται από τον στόχο απώλειας λίπους' },
  'progress.wrong_way_gain': { en: 'Trend moving away from your muscle gain goal', es: 'La tendencia se aleja de tu meta de ganancia muscular', el: 'Η τάση απομακρύνεται από τον στόχο μυϊκής μάζας' },
  'progress.no_completed_habits': { en: 'No completed habits yet. Keep going!', es: 'Aún no hay hábitos completados. ¡Sigue así!', el: 'Καμία ολοκληρωμένη συνήθεια ακόμη. Συνέχισε!' },
  'progress.habit_fallback': { en: 'Habit', es: 'Hábito', el: 'Συνήθεια' },
  'progress.best_streak': { en: 'Best streak', es: 'Mejor racha', el: 'Καλύτερο σερί' },
  'progress.checkins': { en: 'check-ins', es: 'registros', el: 'check-ins' },
  'progress.stat_target': { en: 'Target', es: 'Objetivo', el: 'Στόχος' },
  'progress.customize_title': { en: 'Customize Progress', es: 'Personalizar Progreso', el: 'Προσαρμογή Προόδου' },
  'progress.customize_sub': { en: 'Choose what you see and in what order', es: 'Elige qué ves y en qué orden', el: 'Διάλεξε τι βλέπεις και με ποια σειρά' },
  'progress.customize_reset': { en: 'Reset', es: 'Restablecer', el: 'Επαναφορά' },
  'progress.customize_move_up': { en: 'Move up', es: 'Subir', el: 'Μετακίνηση πάνω' },
  'progress.customize_move_down': { en: 'Move down', es: 'Bajar', el: 'Μετακίνηση κάτω' },
  'progress.customize_coach_locked': { en: 'Set by your coach', es: 'Definido por tu coach', el: 'Ορίζεται από τον coach' },
  // ── Appearance (accent / palette / density / panel manager) ──
  'appearance.accent_title': { en: 'Accent color', es: 'Color de acento', el: 'Χρώμα έμφασης' },
  'appearance.accent_hint': { en: 'Applies across charts, buttons and highlights', es: 'Se aplica a gráficos, botones y destacados', el: 'Εφαρμόζεται σε γραφήματα, κουμπιά και επισημάνσεις' },
  'appearance.accent_gold': { en: 'Gold', es: 'Dorado', el: 'Χρυσό' },
  'appearance.accent_ember': { en: 'Ember', es: 'Brasa', el: 'Κεχριμπάρι' },
  'appearance.accent_jade': { en: 'Jade', es: 'Jade', el: 'Νεφρίτης' },
  'appearance.accent_sky': { en: 'Sky', es: 'Cielo', el: 'Ουρανός' },
  'appearance.accent_plum': { en: 'Plum', es: 'Ciruela', el: 'Δαμάσκηνο' },
  'appearance.accent_rose': { en: 'Rose', es: 'Rosa', el: 'Ροζ' },
  'appearance.palette_title': { en: 'Chart palette', es: 'Paleta de gráficos', el: 'Παλέτα γραφημάτων' },
  'appearance.palette_classic': { en: 'Classic', es: 'Clásica', el: 'Κλασική' },
  'appearance.palette_vivid': { en: 'Vivid', es: 'Vívida', el: 'Ζωηρή' },
  'appearance.palette_dusk': { en: 'Dusk', es: 'Crepúsculo', el: 'Δειλινό' },
  'appearance.palette_mono': { en: 'Mono', es: 'Mono', el: 'Μονόχρωμη' },
  'appearance.density_title': { en: 'Density', es: 'Densidad', el: 'Πυκνότητα' },
  'appearance.density_comfortable': { en: 'Comfortable', es: 'Cómoda', el: 'Άνετη' },
  'appearance.density_compact': { en: 'Compact', es: 'Compacta', el: 'Συμπαγής' },
  'appearance.manage_panels': { en: 'Progress page panels', es: 'Paneles de la página de progreso', el: 'Πάνελ σελίδας προόδου' },
  'appearance.manage_panels_hint': { en: 'Show, hide & reorder', es: 'Mostrar, ocultar y ordenar', el: 'Εμφάνιση, απόκρυψη, σειρά' },
  // ── Settings navigation ──
  'settings.nav_account': { en: 'Account', es: 'Cuenta', el: 'Λογαριασμός' },
  'settings.nav_body': { en: 'Body & Goals', es: 'Cuerpo y Metas', el: 'Σώμα & Στόχοι' },
  'settings.nav_appearance': { en: 'Appearance', es: 'Apariencia', el: 'Εμφάνιση' },
  'settings.nav_language': { en: 'Language', es: 'Idioma', el: 'Γλώσσα' },
  'settings.nav_privacy': { en: 'Privacy & Data', es: 'Privacidad y Datos', el: 'Απόρρητο & Δεδομένα' },
  'settings.export_data': { en: 'Download my data', es: 'Descargar mis datos', el: 'Λήψη των δεδομένων μου' },

  // ── W4 provenance passport (parse-review data-quality) ──
  'food.prov_caption_lab':         { en: 'Matched lab-verified data', es: 'Coincide con datos verificados en laboratorio', el: 'Ταιριάζει με εργαστηριακά επιβεβαιωμένα δεδομένα' },
  'food.prov_caption_label':       { en: 'Matched a nutrition label', es: 'Coincide con una etiqueta nutricional', el: 'Ταιριάζει με ετικέτα διατροφής' },
  'food.prov_caption_crowdsourced':{ en: 'Community-sourced — adjust if needed', es: 'De la comunidad — ajusta si es necesario', el: 'Από την κοινότητα — προσάρμοσε αν χρειάζεται' },
  'food.prov_caption_estimated':   { en: 'Estimated from your description — adjust if needed', es: 'Estimado a partir de tu descripción — ajusta si es necesario', el: 'Εκτίμηση από την περιγραφή σου — προσάρμοσε αν χρειάζεται' },
  'food.prov_chip_lab':            { en: 'LAB', es: 'LAB', el: 'ΕΡΓ' },
  'food.prov_chip_label':          { en: 'LABEL', es: 'ETIQUETA', el: 'ΕΤΙΚΕΤΑ' },
  'food.prov_chip_community':      { en: 'COMMUNITY', es: 'COMUNIDAD', el: 'ΚΟΙΝΟΤΗΤΑ' },
  'food.prov_chip_ai_estimate':    { en: 'AI ESTIMATE', es: 'ESTIMACIÓN IA', el: 'ΕΚΤΙΜΗΣΗ AI' },
  'food.prov_ring_aria':           { en: 'Show where this data came from', es: 'Ver de dónde vienen estos datos', el: 'Δες από πού προέρχονται τα δεδομένα' },

  // ── ConfirmSheet (shared confirmation bottom sheet) ──
  'confirm.confirm': { en: 'Confirm', es: 'Confirmar', el: 'Επιβεβαίωση' },
  'confirm.cancel':  { en: 'Cancel', es: 'Cancelar', el: 'Άκυρο' },
  'confirm.delete':  { en: 'Delete', es: 'Eliminar', el: 'Διαγραφή' },
  'confirm.delete_habit_title': { en: 'Delete this custom habit?', es: '¿Eliminar este hábito personalizado?', el: 'Διαγραφή αυτής της προσαρμοσμένης συνήθειας;' },
  'confirm.delete_habit_msg':   { en: 'Clients currently assigned to it keep their history, but the habit disappears from your library.', es: 'Los clientes asignados conservan su historial, pero el hábito desaparece de tu biblioteca.', el: 'Οι πελάτες που την έχουν κρατούν το ιστορικό τους, αλλά η συνήθεια αφαιρείται από τη βιβλιοθήκη σου.' },
  'confirm.delete_food_title':  { en: 'Delete this custom food?', es: '¿Eliminar este alimento personalizado?', el: 'Διαγραφή αυτού του προσαρμοσμένου τροφίμου;' },
  'confirm.delete_food_msg':    { en: 'It will no longer appear in searches or quick-log lists.', es: 'Ya no aparecerá en búsquedas ni listas rápidas.', el: 'Δεν θα εμφανίζεται πλέον σε αναζητήσεις ή γρήγορες λίστες.' },
  'confirm.delete_protocol_title': { en: 'Delete this protocol?', es: '¿Eliminar este protocolo?', el: 'Διαγραφή αυτού του πρωτοκόλλου;' },
  'confirm.delete_protocol_msg':   { en: 'Clients already assigned keep their current plan; the template is removed from your library.', es: 'Los clientes asignados conservan su plan; la plantilla se elimina de tu biblioteca.', el: 'Οι πελάτες που το έχουν κρατούν το πλάνο τους· το πρότυπο αφαιρείται από τη βιβλιοθήκη σου.' },
  'confirm.delete_template_title': { en: 'Delete this template?', es: '¿Eliminar esta plantilla?', el: 'Διαγραφή αυτού του προτύπου;' },
  'confirm.delete_template_msg':   { en: 'Programs already assigned from it are unaffected.', es: 'Los programas ya asignados no se ven afectados.', el: 'Τα προγράμματα που έχουν ήδη ανατεθεί δεν επηρεάζονται.' },
  'confirm.late_cancel_title': { en: 'Cancel this session?', es: '¿Cancelar esta sesión?', el: 'Ακύρωση αυτής της συνεδρίας;' },
  'confirm.late_cancel_msg':   { en: 'Less than 24h notice — your coach may apply a late-cancellation charge.', es: 'Menos de 24h de aviso — tu coach puede aplicar un cargo por cancelación tardía.', el: 'Λιγότερο από 24 ώρες πριν — ο coach σου μπορεί να χρεώσει για καθυστερημένη ακύρωση.' },
  'confirm.cancel_anyway':     { en: 'Cancel anyway', es: 'Cancelar igualmente', el: 'Ακύρωση ούτως ή άλλως' },
  'confirm.keep_booking':      { en: 'Keep booking', es: 'Mantener la reserva', el: 'Διατήρηση κράτησης' },
  'habits.emoji_placeholder':  { en: 'Optional', es: 'Opcional', el: 'Προαιρετικό' },

  // ── Coach customize mode (PanelGate + CustomizePanelsBar) ──
  'coach.customize.button': { en: 'Customize', es: 'Personalizar', el: 'Προσαρμογή' },
  'coach.customize.done':   { en: 'Done', es: 'Listo', el: 'Έτοιμο' },
  'coach.customize.reset':  { en: 'Reset to essentials', es: 'Restablecer a lo esencial', el: 'Επαναφορά στα βασικά' },
  'coach.customize.shown':  { en: 'Shown', es: 'Visible', el: 'Εμφανές' },
  'coach.customize.hidden': { en: 'Hidden', es: 'Oculto', el: 'Κρυφό' },
  'coach.customize.shownTapToHide': { en: 'Shown — tap to hide', es: 'Visible — toca para ocultar', el: 'Εμφανές — πάτησε για απόκρυψη' },
  'coach.customize.hiddenTapToShow': { en: 'Hidden — tap to show', es: 'Oculto — toca para mostrar', el: 'Κρυφό — πάτησε για εμφάνιση' },
  'coach.customize.title':  { en: 'Customize panels', es: 'Personalizar paneles', el: 'Προσαρμογή πάνελ' },

  // ── Coach panel titles (edit-mode chips) ──
  'coach.panel.pulseCards':       { en: 'Weekly Pulse Cards', es: 'Tarjetas de pulso semanal', el: 'Κάρτες εβδομαδιαίου παλμού' },
  'coach.panel.coachStreak':      { en: 'Coaching Streak', es: 'Racha de coaching', el: 'Προπονητικό σερί' },
  'coach.panel.business':         { en: 'Business numbers', es: 'Números del negocio', el: 'Αριθμοί επιχείρησης' },
  'coach.panel.weeklySummary':    { en: 'Weekly Summary', es: 'Resumen semanal', el: 'Εβδομαδιαία σύνοψη' },
  'coach.panel.summaryBar':       { en: 'Summary Bar', es: 'Barra de resumen', el: 'Μπάρα σύνοψης' },
  'coach.panel.riskHeatmap':      { en: 'Risk Heatmap', es: 'Mapa de riesgo', el: 'Χάρτης κινδύνου' },
  'coach.panel.insightChips':     { en: 'Insight Chips', es: 'Chips de insights', el: 'Ψηφίδες ευρημάτων' },
  'coach.panel.compareClients':   { en: 'Compare Clients', es: 'Comparar clientes', el: 'Σύγκριση πελατών' },
  'coach.panel.activityChart':    { en: 'Activity This Week', es: 'Actividad de la semana', el: 'Δραστηριότητα εβδομάδας' },
  'coach.panel.pendingOnboarding': { en: 'Pending Onboarding', es: 'Onboarding pendiente', el: 'Εκκρεμής ένταξη' },
  'coach.panel.achievements':     { en: 'Coach Achievements', es: 'Logros del coach', el: 'Επιτεύγματα προπονητή' },
  'coach.panel.monthlyReport':    { en: 'Monthly Report', es: 'Informe mensual', el: 'Μηνιαία αναφορά' },
  'coach.panel.assessment':       { en: 'Assessment', es: 'Evaluación', el: 'Αξιολόγηση' },
  'coach.panel.intake':           { en: 'Intake Interview', es: 'Entrevista inicial', el: 'Αρχική συνέντευξη' },
  'coach.panel.habitCard':        { en: 'Active Habit', es: 'Hábito activo', el: 'Ενεργή συνήθεια' },
  'coach.panel.supplementCompliance': { en: 'Supplement Compliance', es: 'Cumplimiento de suplementos', el: 'Συμμόρφωση συμπληρωμάτων' },
  'coach.panel.moodTrend':        { en: 'Mood & Signals', es: 'Ánimo y señales', el: 'Διάθεση & σήματα' },
  'coach.panel.roadmap':          { en: 'Coaching Roadmap', es: 'Hoja de ruta', el: 'Οδικός χάρτης' },
  'coach.panel.recentFood':       { en: 'Recent Food Log', es: 'Registro de comidas reciente', el: 'Πρόσφατο ημερολόγιο φαγητού' },
  'coach.panel.mealQuality':      { en: 'Meal Quality', es: 'Calidad de comidas', el: 'Ποιότητα γευμάτων' },
  'coach.panel.proteinDistribution': { en: 'Protein Distribution', es: 'Distribución de proteína', el: 'Κατανομή πρωτεΐνης' },
  'coach.panel.foodHeatmap':      { en: 'Food Logging Heatmap', es: 'Mapa de registro de comidas', el: 'Χάρτης καταγραφής φαγητού' },
  'coach.panel.weekendAnalysis':  { en: 'Weekday vs Weekend', es: 'Entre semana vs fin de semana', el: 'Καθημερινές vs Σαββατοκύριακο' },
  'coach.panel.twoWeekComparison': { en: '2-Week Comparison', es: 'Comparación de 2 semanas', el: 'Σύγκριση 2 εβδομάδων' },
  'coach.panel.healthScore':      { en: 'Health Score', es: 'Puntuación de salud', el: 'Δείκτης υγείας' },
  'coach.panel.consistencyScore': { en: 'Consistency Score', es: 'Puntuación de constancia', el: 'Δείκτης συνέπειας' },
  'coach.panel.aiInsight':        { en: 'AI Insight', es: 'Insight de IA', el: 'Εύρημα AI' },
  'coach.panel.activityTimeline': { en: 'Activity Timeline', es: 'Línea de tiempo', el: 'Χρονολόγιο δραστηριότητας' },
  'coach.panel.smartTools':       { en: 'Smart Tools', es: 'Herramientas inteligentes', el: 'Έξυπνα εργαλεία' },
  'coach.panel.habitHistory':     { en: 'Habit History', es: 'Historial de hábitos', el: 'Ιστορικό συνηθειών' },
  'coach.panel.weightChart':      { en: 'Weight & Measurements', es: 'Peso y medidas', el: 'Βάρος & μετρήσεις' },
  'coach.panel.workouts':         { en: 'Workouts', es: 'Entrenamientos', el: 'Προπονήσεις' },

  // ── Coach dashboard relabels + compare modal ──
  'coach.pulse.checkins':        { en: 'Check-ins', es: 'Check-ins', el: 'Check-ins' },
  'coach.pulse.checkinsExplain': { en: 'Total habit check-ins from all your clients this week.', es: 'Total de check-ins de hábitos de todos tus clientes esta semana.', el: 'Σύνολο check-ins συνηθειών από όλους τους πελάτες σου αυτή την εβδομάδα.' },
  'coach.monthlyReport.checkins': { en: 'Check-ins', es: 'Check-ins', el: 'Check-ins' },
  'coach.compare.clientA':  { en: 'Client A', es: 'Cliente A', el: 'Πελάτης Α' },
  'coach.compare.clientB':  { en: 'Client B', es: 'Cliente B', el: 'Πελάτης Β' },
  'coach.compare.loading':  { en: 'Loading 7-day intake…', es: 'Cargando ingesta de 7 días…', el: 'Φόρτωση πρόσληψης 7 ημερών…' },
  'coach.compare.title':    { en: '7-Day Intake vs Targets', es: 'Ingesta de 7 días vs objetivos', el: 'Πρόσληψη 7 ημερών vs στόχοι' },
  'coach.compare.footnote': { en: "Average intake over the last 7 logged days vs each client's targets (dashed ring = 100% of target).", es: 'Ingesta media de los últimos 7 días registrados vs los objetivos de cada cliente (anillo discontinuo = 100% del objetivo).', el: 'Μέση πρόσληψη τις τελευταίες 7 καταγεγραμμένες ημέρες vs στόχοι κάθε πελάτη (διακεκομμένος δακτύλιος = 100% του στόχου).' },
  'coach.compare.noTargets': { en: 'No macro targets set for either client — the chart needs targets to compare against.', es: 'Ningún cliente tiene objetivos de macros — el gráfico necesita objetivos para comparar.', el: 'Κανένας πελάτης δεν έχει στόχους μακροθρεπτικών — το γράφημα χρειάζεται στόχους για σύγκριση.' },
  'coach.nav.calendar': { en: 'Calendar', es: 'Calendario', el: 'Ημερολόγιο' },
  'coach.nav.workouts': { en: 'Workouts', es: 'Entrenamientos', el: 'Προπονήσεις' },

  // ── Coach client detail ──
  'coach.detail.noTargetsAdherence': { en: "No macro targets set yet — adherence can't be measured.", es: 'Aún no hay objetivos de macros — no se puede medir la adherencia.', el: 'Δεν έχουν οριστεί στόχοι μακροθρεπτικών — η συμμόρφωση δεν μπορεί να μετρηθεί.' },
  'coach.detail.setTargets':      { en: 'Set targets', es: 'Definir objetivos', el: 'Ορισμός στόχων' },
  'coach.detail.consistency28d':  { en: 'Consistency (28d)', es: 'Constancia (28d)', el: 'Συνέπεια (28ημ)' },
  'coach.detail.foodHeatmap28d':  { en: 'Food Logging Heatmap (28d)', es: 'Mapa de registro de comidas (28d)', el: 'Χάρτης καταγραφής φαγητού (28ημ)' },
  'coach.detail.smartSuggestions': { en: 'Smart Suggestions', es: 'Sugerencias inteligentes', el: 'Έξυπνες προτάσεις' },
  'coach.detail.setTargetsOptimizer': { en: 'Set macro targets to enable the optimizer', es: 'Define objetivos de macros para activar el optimizador', el: 'Όρισε στόχους μακροθρεπτικών για να ενεργοποιηθεί ο βελτιστοποιητής' },

  // ── Client view settings (What this client sees) ──
  'coach.clientView.title':     { en: 'What this client sees', es: 'Lo que ve este cliente', el: 'Τι βλέπει αυτός ο πελάτης' },
  'coach.clientView.appliesTo': { en: 'applies to their app', es: 'se aplica a su app', el: 'ισχύει για την εφαρμογή του' },
  'coach.clientView.saving':    { en: 'saving…', es: 'guardando…', el: 'αποθήκευση…' },
  'coach.clientView.saved':     { en: 'saved', es: 'guardado', el: 'αποθηκεύτηκε' },
  'coach.clientView.saveFailed': { en: 'save failed', es: 'error al guardar', el: 'αποτυχία αποθήκευσης' },
  'coach.clientView.showCalories':     { en: 'Calorie numbers', es: 'Números de calorías', el: 'Αριθμοί θερμίδων' },
  'coach.clientView.showCaloriesHint': { en: 'kcal values across the client app', es: 'valores de kcal en toda la app del cliente', el: 'τιμές kcal σε όλη την εφαρμογή του πελάτη' },
  'coach.clientView.showFoodIdeas':     { en: 'Food ideas', es: 'Ideas de comidas', el: 'Ιδέες φαγητού' },
  'coach.clientView.showFoodIdeasHint': { en: 'Generic meal suggestions', es: 'Sugerencias genéricas de comidas', el: 'Γενικές προτάσεις γευμάτων' },
  'coach.clientView.logAnalytics':     { en: 'Log analytics', es: 'Analíticas del registro', el: 'Αναλύσεις καταγραφής' },
  'coach.clientView.logAnalyticsHint': { en: 'Macro trends, food frequency, day patterns', es: 'Tendencias de macros, frecuencia de alimentos, patrones diarios', el: 'Τάσεις μακροθρεπτικών, συχνότητα τροφών, ημερήσια μοτίβα' },
  'coach.clientView.nutritionIntel':     { en: 'Nutrition intel', es: 'Inteligencia nutricional', el: 'Διατροφική ευφυΐα' },
  'coach.clientView.nutritionIntelHint': { en: 'Fasting timer, nutrient density, photos', es: 'Temporizador de ayuno, densidad de nutrientes, fotos', el: 'Χρονόμετρο νηστείας, πυκνότητα θρεπτικών, φωτογραφίες' },
  'coach.clientView.smartInsight':     { en: 'Smart insight', es: 'Insight inteligente', el: 'Έξυπνο εύρημα' },
  'coach.clientView.smartInsightHint': { en: 'One-line AI insight on home', es: 'Insight de IA de una línea en inicio', el: 'Εύρημα AI μίας γραμμής στην αρχική' },
  'coach.clientView.weeklyCheckin':     { en: 'Weekly check-in', es: 'Check-in semanal', el: 'Εβδομαδιαίο check-in' },
  'coach.clientView.weeklyCheckinHint': { en: 'Weekly reflection prompt', es: 'Reflexión semanal', el: 'Εβδομαδιαία ερώτηση αναστοχασμού' },

  // ── Coach workouts panel (client detail) ──
  'coach.workouts.title':      { en: 'Workouts', es: 'Entrenamientos', el: 'Προπονήσεις' },
  'coach.workouts.assignEdit': { en: 'Assign / Edit program', es: 'Asignar / Editar programa', el: 'Ανάθεση / Επεξεργασία προγράμματος' },
  'coach.workouts.assign':     { en: 'Assign program', es: 'Asignar programa', el: 'Ανάθεση προγράμματος' },
  'coach.workouts.assigned':   { en: 'Assigned', es: 'Asignado', el: 'Ανατέθηκε' },
  'coach.workouts.noProgram':  { en: 'No workout program assigned yet', es: 'Aún no hay programa de entrenamiento asignado', el: 'Δεν έχει ανατεθεί πρόγραμμα προπόνησης ακόμα' },
  'coach.workouts.recentSessions': { en: 'Recent sessions', es: 'Sesiones recientes', el: 'Πρόσφατες συνεδρίες' },
  'coach.workouts.noSessions': { en: 'No sessions logged yet', es: 'Aún no hay sesiones registradas', el: 'Δεν έχουν καταγραφεί συνεδρίες ακόμα' },
  'coach.workouts.workout':    { en: 'Workout', es: 'Entrenamiento', el: 'Προπόνηση' },
  'coach.workouts.sets':       { en: 'sets', es: 'series', el: 'σετ' },
  'coach.workouts.set':        { en: 'set', es: 'serie', el: 'σετ' },
  'coach.workouts.prs':        { en: 'PRs', es: 'RPs', el: 'PR' },
  'coach.workouts.pr':         { en: 'PR', es: 'RP', el: 'PR' },
  'coach.workouts.personalRecords': { en: 'personal records', es: 'récords personales', el: 'ατομικά ρεκόρ' },
  'coach.workouts.painFlags':  { en: 'Pain flags', es: 'Señales de dolor', el: 'Ενδείξεις πόνου' },
  'coach.workouts.restDay':    { en: 'Rest day', es: 'Día de descanso', el: 'Ημέρα ξεκούρασης' },
  'coach.workouts.loadError':  { en: 'Could not load workout data — try refreshing.', es: 'No se pudieron cargar los datos de entrenamiento — intenta recargar.', el: 'Δεν ήταν δυνατή η φόρτωση των δεδομένων προπόνησης — δοκίμασε ανανέωση.' },
  'coach.workouts.min':        { en: 'min', es: 'min', el: 'λεπ' },

  // ── Program Builder ──
  'coach.builder.title':        { en: 'Program Builder', es: 'Constructor de programas', el: 'Δημιουργός προγραμμάτων' },
  'coach.builder.editingActive': { en: 'editing active program', es: 'editando programa activo', el: 'επεξεργασία ενεργού προγράμματος' },
  'coach.builder.client':       { en: 'Client', es: 'Cliente', el: 'Πελάτης' },
  'coach.builder.selectClient': { en: 'Select a client…', es: 'Selecciona un cliente…', el: 'Επίλεξε πελάτη…' },
  'coach.builder.programName':  { en: 'Program name', es: 'Nombre del programa', el: 'Όνομα προγράμματος' },
  'coach.builder.programNamePlaceholder': { en: 'e.g. Push/Pull/Legs — Block 1', es: 'ej. Empuje/Tirón/Piernas — Bloque 1', el: 'π.χ. Push/Pull/Legs — Μπλοκ 1' },
  'coach.builder.defaultProgramName': { en: 'Training program', es: 'Programa de entrenamiento', el: 'Πρόγραμμα προπόνησης' },
  'coach.builder.possessiveProgram': { en: "{name}'s program", es: 'Programa de {name}', el: 'Πρόγραμμα του/της {name}' },
  'coach.builder.assigning':    { en: 'Assigning…', es: 'Asignando…', el: 'Ανάθεση…' },
  'coach.builder.saveReplace':  { en: 'Save & replace active program', es: 'Guardar y reemplazar programa activo', el: 'Αποθήκευση & αντικατάσταση ενεργού προγράμματος' },
  'coach.builder.assignProgram': { en: 'Assign program', es: 'Asignar programa', el: 'Ανάθεση προγράμματος' },
  'coach.builder.pickClientHint': { en: 'Pick a client to load their current program', es: 'Elige un cliente para cargar su programa actual', el: 'Επίλεξε πελάτη για να φορτωθεί το τρέχον πρόγραμμά του' },
  'coach.builder.addTrainingDay': { en: 'Add at least one training day', es: 'Añade al menos un día de entrenamiento', el: 'Πρόσθεσε τουλάχιστον μία ημέρα προπόνησης' },
  'coach.builder.assignedToast':  { en: 'Program assigned', es: 'Programa asignado', el: 'Το πρόγραμμα ανατέθηκε' },
  'coach.builder.assignFailedToast': { en: 'Failed to assign program', es: 'Error al asignar el programa', el: 'Αποτυχία ανάθεσης προγράμματος' },
  'coach.builder.modalTitle':   { en: 'Assign Program', es: 'Asignar programa', el: 'Ανάθεση προγράμματος' },
  'coach.builder.noClients':    { en: 'No clients assigned to you', es: 'No tienes clientes asignados', el: 'Δεν σου έχουν ανατεθεί πελάτες' },

  // ── Templates page ──
  'coach.templates.edit':      { en: 'Edit template', es: 'Editar plantilla', el: 'Επεξεργασία προτύπου' },
  'coach.templates.editTitle': { en: 'Edit Template', es: 'Editar plantilla', el: 'Επεξεργασία προτύπου' },
  'coach.templates.assignToProgram': { en: 'Assign to a client program', es: 'Asignar a un programa de cliente', el: 'Ανάθεση σε πρόγραμμα πελάτη' },
  'coach.templates.delete':    { en: 'Delete template', es: 'Eliminar plantilla', el: 'Διαγραφή προτύπου' },
  'coach.templates.saveChanges': { en: 'Save Changes', es: 'Guardar cambios', el: 'Αποθήκευση αλλαγών' },
  'coach.templates.updatedToast': { en: 'Template updated', es: 'Plantilla actualizada', el: 'Το πρότυπο ενημερώθηκε' },
  'coach.templates.updateFailedToast': { en: 'Failed to update template', es: 'Error al actualizar la plantilla', el: 'Αποτυχία ενημέρωσης προτύπου' },
  'coach.templates.createFailedToast': { en: 'Failed to create template', es: 'Error al crear la plantilla', el: 'Αποτυχία δημιουργίας προτύπου' },
  'coach.templates.saveFailedToast':   { en: 'Failed to save template', es: 'Error al guardar la plantilla', el: 'Αποτυχία αποθήκευσης προτύπου' },
  'coach.templates.addExercise': { en: 'Add at least one exercise', es: 'Añade al menos un ejercicio', el: 'Πρόσθεσε τουλάχιστον μία άσκηση' },

  // ── Coach inbox ──
  'coach.inbox.filter':      { en: 'Filter conversations', es: 'Filtrar conversaciones', el: 'Φιλτράρισμα συνομιλιών' },
  'coach.inbox.all':         { en: 'All', es: 'Todos', el: 'Όλα' },
  'coach.inbox.unread':      { en: 'Unread', es: 'No leídos', el: 'Μη αναγνωσμένα' },
  'coach.inbox.quiet3d':     { en: 'Quiet 3d+', es: 'Inactivos 3d+', el: 'Σιωπηλοί 3ημ+' },
  'coach.inbox.noUnread':    { en: 'No unread messages', es: 'No hay mensajes sin leer', el: 'Δεν υπάρχουν μη αναγνωσμένα μηνύματα' },
  'coach.inbox.nobodyQuiet': { en: 'Nobody has been quiet 3+ days', es: 'Nadie lleva 3+ días inactivo', el: 'Κανείς δεν είναι σιωπηλός 3+ ημέρες' },

  // ── AI food-input loop — error taxonomy + clarification (mission/food-input-10) ──
  'food.err_ai_busy': { en: 'The AI had trouble with that one — please try again in a moment.', es: 'La IA tuvo problemas con eso — inténtalo de nuevo en un momento.', el: 'Το AI δυσκολεύτηκε με αυτό — δοκίμασε ξανά σε λίγο.' },
  'food.err_try_rephrase': { en: 'Could not read that as food — try rephrasing, e.g. "2 eggs and a slice of toast".', es: 'No se pudo interpretar como comida — reformúlalo, p. ej. "2 huevos y una tostada".', el: 'Δεν αναγνωρίστηκε ως φαγητό — δοκίμασε αλλιώς, π.χ. «2 αυγά και μια φέτα ψωμί».' },
  'food.err_too_long': { en: 'That entry is too long — keep it under {max} characters, or log the meal in parts.', es: 'Esa entrada es demasiado larga — mantenla por debajo de {max} caracteres o registra la comida por partes.', el: 'Πολύ μεγάλη καταχώρηση — κράτησέ τη κάτω από {max} χαρακτήρες ή κατέγραψε το γεύμα τμηματικά.' },
  'food.err_rate_limited': { en: 'Too many requests right now — give it a moment and try again.', es: 'Demasiadas solicitudes por ahora — espera un momento e inténtalo de nuevo.', el: 'Πάρα πολλά αιτήματα αυτή τη στιγμή — περίμενε λίγο και δοκίμασε ξανά.' },
  'food.err_timeout': { en: 'This took longer than expected — please try again.', es: 'Tardó más de lo esperado — inténtalo de nuevo.', el: 'Πήρε περισσότερη ώρα από το αναμενόμενο — δοκίμασε ξανά.' },
  'food.retry_in': { en: 'Retry ({n}s)', es: 'Reintentar ({n}s)', el: 'Επανάληψη ({n}s)' },
  'food.quick_question': { en: 'Quick question', es: 'Pregunta rápida', el: 'Γρήγορη ερώτηση' },
  'food.answer_placeholder': { en: 'Type your answer…', es: 'Escribe tu respuesta…', el: 'Γράψε την απάντησή σου…' },
  'food.photo_estimates_note': { en: 'Photo portions are estimates. Review each amount before logging.', es: 'Las porciones de la foto son estimaciones. Revisa cada cantidad antes de registrar.', el: 'Οι μερίδες από φωτογραφία είναι εκτιμήσεις. Έλεγξε κάθε ποσότητα πριν την καταχώρηση.' },
  'food.voice_unsupported': { en: 'Voice input not supported in this browser', es: 'El navegador no admite entrada por voz', el: 'Ο browser δεν υποστηρίζει φωνητική εισαγωγή' },

  // ── W1 parse narration (kitchen pass) ──
  'food.parse_stage_reading': { en: 'reading your meal…', es: 'leyendo tu comida…', el: 'διαβάζουμε το γεύμα σου…' },
  'food.parse_stage_matching': { en: 'matching 43,000 foods…', es: 'consultando 43.000 alimentos…', el: 'ψάχνουμε σε 43.000 τρόφιμα…' },
  'food.parse_stage_weighing': { en: 'weighing portions…', es: 'pesando porciones…', el: 'ζυγίζουμε τις μερίδες…' },
  'food.parse_stage_still': { en: 'still working — bigger meals take a few extra seconds…', es: 'seguimos trabajando — las comidas grandes tardan unos segundos más…', el: 'ακόμα δουλεύουμε — τα μεγάλα γεύματα θέλουν λίγα δευτερόλεπτα παραπάνω…' },

  // ── Parsed-food review (save-bar warnings + steppers + clarification) ──
  'food.answer_refine_placeholder': { en: 'Answer to refine…', es: 'Responde para afinar…', el: 'Απάντησε για διευκρίνιση…' },
  'food.warn_low_protein': { en: 'Low protein — consider adding eggs, chicken, or yogurt', es: 'Poca proteína — añade huevos, pollo o yogur', el: 'Λίγη πρωτεΐνη — πρόσθεσε αυγά, κοτόπουλο ή γιαούρτι' },
  'food.warn_carb_heavy': { en: 'Very carb-heavy — consider balancing with protein or fat', es: 'Muy alto en carbohidratos — equilibra con proteína o grasa', el: 'Πολλοί υδατάνθρακες — ισορρόπησε με πρωτεΐνη ή λίπος' },
  'food.large_meal_detected': { en: 'Large meal detected', es: 'Comida abundante detectada', el: 'Εντοπίστηκε μεγάλο γεύμα' },
  'food.range_approx': { en: '≈{min}–{max} kcal', es: '≈{min}–{max} kcal', el: '≈{min}–{max} kcal' },
  'food.stepper_decrease': { en: 'Decrease amount', es: 'Reducir cantidad', el: 'Μείωση ποσότητας' },
  'food.stepper_increase': { en: 'Increase amount', es: 'Aumentar cantidad', el: 'Αύξηση ποσότητας' },

  // ── Recipe analyzer ──
  'food.recipe_timeout': { en: 'Recipe analysis timed out — please try again', es: 'El análisis de la receta tardó demasiado — inténtalo de nuevo', el: 'Η ανάλυση της συνταγής καθυστέρησε πολύ — δοκίμασε ξανά' },
  'food.analyze_recipe': { en: 'Analyze recipe', es: 'Analizar receta', el: 'Ανάλυση συνταγής' },
  'food.analyze_recipe_aria': { en: 'Analyze a recipe', es: 'Analizar una receta', el: 'Ανάλυση συνταγής' },

  // ── Entry detail editor (MealSlotCard + MealPatternView) ──
  'food.edit.details': { en: 'Edit details', es: 'Editar detalles', el: 'Επεξεργασία λεπτομερειών' },
  'food.edit.name': { en: 'Name', es: 'Nombre', el: 'Όνομα' },
  'food.edit.grams': { en: 'Grams', es: 'Gramos', el: 'Γραμμάρια' },
  'food.edit.kcal': { en: 'Kcal', es: 'Kcal', el: 'Kcal' },
  'food.edit.protein': { en: 'Protein', es: 'Proteína', el: 'Πρωτεΐνη' },
  'food.edit.carbs': { en: 'Carbs', es: 'Carbohidratos', el: 'Υδατάνθρακες' },
  'food.edit.fat': { en: 'Fat', es: 'Grasa', el: 'Λίπος' },
  'food.edit.sugar': { en: 'Sugar', es: 'Azúcar', el: 'Ζάχαρη' },
  'food.edit.save': { en: 'Save', es: 'Guardar', el: 'Αποθήκευση' },
  'food.edit.saveQuantity': { en: 'Save quantity', es: 'Guardar cantidad', el: 'Αποθήκευση ποσότητας' },
  'food.edit.decreaseGrams': { en: 'Decrease grams', es: 'Reducir gramos', el: 'Μείωση γραμμαρίων' },
  'food.edit.increaseGrams': { en: 'Increase grams', es: 'Aumentar gramos', el: 'Αύξηση γραμμαρίων' },

  // ── Coach meal pattern view (AI chip + editor) ──
  'coach.mealPattern.aiLogged': { en: 'AI-logged', es: 'Registrado por IA', el: 'Καταγραφή με AI' },
  'coach.mealPattern.aiLoggedTitle': { en: 'Parsed by AI — edits train the parser', es: 'Analizado por IA — las ediciones entrenan el analizador', el: 'Αναλύθηκε από AI — οι διορθώσεις εκπαιδεύουν τον αναλυτή' },
  'coach.mealPattern.editEntry': { en: 'Edit {name}', es: 'Editar {name}', el: 'Επεξεργασία {name}' },
  'coach.mealPattern.cancel': { en: 'Cancel', es: 'Cancelar', el: 'Άκυρο' },

  // ── W10 next-slot invitation + batch undo (log page) ──
  'food.next_slot_protein': { en: '{slot} — {n}g protein keeps you on pace', es: '{slot} — {n}g de proteína te mantienen al ritmo', el: '{slot} — {n}g πρωτεΐνης σε κρατούν στον ρυθμό σου' },
  'food.next_slot_kcal': { en: '{slot} — {n} kcal left today', es: '{slot} — quedan {n} kcal hoy', el: '{slot} — απομένουν {n} kcal σήμερα' },
  'log.batch_logged': { en: 'Logged {n} items', es: '{n} alimentos registrados', el: 'Καταγράφηκαν {n} τρόφιμα' },
  'log.batch_logged_one': { en: 'Logged 1 item', es: '1 alimento registrado', el: 'Καταγράφηκε 1 τρόφιμο' },
  'log.batch_undo_aria': { en: 'Undo logging {n} items', es: 'Deshacer el registro de {n} alimentos', el: 'Αναίρεση καταγραφής {n} τροφίμων' },

  // ── W6 narrative day pill + W8 streak ember ──
  'food.pill_protein_to_go': { en: '{n}g to go', es: 'faltan {n}g', el: '{n}g ακόμη' },
  'food.pill_delta_nice':    { en: '+{n}g — nice', es: '+{n}g — ¡bien!', el: '+{n}g — ωραία' },
  'food.pill_protein_done':  { en: 'Protein ✓', es: 'Proteína ✓', el: 'Πρωτεΐνη ✓' },
  'food.pill_kcal_left':     { en: '{n} kcal left', es: '{n} kcal restantes', el: '{n} kcal απομένουν' },
  'food.pill_kcal_over':     { en: '{n} kcal over', es: '{n} kcal de más', el: '{n} kcal πάνω' },
  'log.streak_ember_aria':   { en: '{n}-day streak', es: 'racha de {n} días', el: 'σερί {n} ημερών' },

  // ── Barcode lookup modal (i18n) ──
  'barcode.scan_title':         { en: 'Scan a barcode', es: 'Escanear un código', el: 'Σάρωση barcode' },
  'barcode.add_product':        { en: 'Add product', es: 'Agregar producto', el: 'Προσθήκη προϊόντος' },
  'barcode.back':               { en: 'Back', es: 'Atrás', el: 'Πίσω' },
  'barcode.photo':              { en: 'Photo', es: 'Foto', el: 'Φωτογραφία' },
  'barcode.point_at':           { en: 'Point at the barcode', es: 'Apunta al código', el: 'Στόχευσε στο barcode' },
  'barcode.input':              { en: 'Input', es: 'Manual', el: 'Πληκτρολόγηση' },
  'barcode.type_number':        { en: 'Type the number', es: 'Escribe el número', el: 'Πληκτρολόγησε τον αριθμό' },
  'barcode.hold_in_frame':      { en: 'Hold the barcode inside the frame', es: 'Mantén el código dentro del marco', el: 'Κράτησε το barcode μέσα στο πλαίσιο' },
  'barcode.looking_up':         { en: 'Looking up…', es: 'Buscando…', el: 'Αναζήτηση…' },
  'barcode.look_up':            { en: 'Look up', es: 'Buscar', el: 'Αναζήτηση' },
  'barcode.enter_manually':     { en: 'Enter the number manually instead', es: 'Mejor ingresa el número manualmente', el: 'Εισαγωγή αριθμού χειροκίνητα' },
  'barcode.number_placeholder': { en: 'Barcode number (EAN/UPC)', es: 'Número de código (EAN/UPC)', el: 'Αριθμός barcode (EAN/UPC)' },
  'barcode.product_name':       { en: 'Product name', es: 'Nombre del producto', el: 'Όνομα προϊόντος' },
  'barcode.amount':             { en: 'Amount', es: 'Cantidad', el: 'Ποσότητα' },
  'barcode.add_to_log':         { en: 'Add to log', es: 'Agregar al registro', el: 'Προσθήκη στο ημερολόγιο' },
  'barcode.logging':            { en: 'Logging…', es: 'Registrando…', el: 'Καταγραφή…' },
  'barcode.scan_another':       { en: 'scan another', es: 'escanear otro', el: 'σάρωση άλλου' },
  'barcode.in_db':              { en: 'in DB', es: 'en BD', el: 'στη ΒΔ' },
  'barcode.per_100g_line':      { en: 'per 100g · {kcal} kcal · {p}P / {c}C / {f}F', es: 'por 100g · {kcal} kcal · {p}P / {c}C / {f}F', el: 'ανά 100g · {kcal} kcal · {p}P / {c}C / {f}F' },
  'barcode.not_in_db':          { en: 'Not in the database{code} — add it from the label (values per 100 g/ml).', es: 'No está en la base de datos{code} — agrégalo desde la etiqueta (valores por 100 g/ml).', el: 'Δεν υπάρχει στη βάση{code} — πρόσθεσέ το από την ετικέτα (τιμές ανά 100 g/ml).' },
  'barcode.ph_kcal':            { en: 'kcal /100', es: 'kcal /100', el: 'kcal /100' },
  'barcode.ph_protein':         { en: 'Protein g', es: 'Proteína g', el: 'Πρωτεΐνη g' },
  'barcode.ph_carbs':           { en: 'Carbs g', es: 'Carbos g', el: 'Υδατ. g' },
  'barcode.ph_fat':             { en: 'Fat g', es: 'Grasa g', el: 'Λίπος g' },
  'barcode.err_invalid':        { en: 'Enter a valid 8–14 digit barcode', es: 'Ingresa un código válido de 8 a 14 dígitos', el: 'Εισάγετε έγκυρο barcode 8–14 ψηφίων' },
  'barcode.err_lookup':         { en: 'Lookup failed — try again', es: 'Falló la búsqueda — inténtalo de nuevo', el: 'Αποτυχία αναζήτησης — δοκιμάστε ξανά' },
  'barcode.err_add_name':       { en: 'Add a product name', es: 'Agrega un nombre de producto', el: 'Προσθέστε όνομα προϊόντος' },
  'barcode.err_camera':         { en: 'Camera unavailable — enter the barcode manually', es: 'Cámara no disponible — ingresa el código manualmente', el: 'Η κάμερα δεν είναι διαθέσιμη — εισάγετε το barcode χειροκίνητα' },

  // ── Pain flag modal (i18n) ──
  'painflag.title':             { en: 'Pain Flag', es: 'Alerta de dolor', el: 'Επισήμανση πόνου' },
  'painflag.body_part_placeholder': { en: 'Body part (e.g. left shoulder)', es: 'Parte del cuerpo (ej. hombro izquierdo)', el: 'Μέρος σώματος (π.χ. αριστερός ώμος)' },
  'painflag.severity_prefix':   { en: 'Severity', es: 'Severidad', el: 'Σοβαρότητα' },
  'painflag.notes_placeholder': { en: 'Notes (optional)', es: 'Notas (opcional)', el: 'Σημειώσεις (προαιρετικά)' },
  'painflag.cancel':            { en: 'Cancel', es: 'Cancelar', el: 'Ακύρωση' },
  'painflag.save':              { en: 'Save Flag', es: 'Guardar', el: 'Αποθήκευση' },

  // ── Progress photos (i18n) ──
  'progressphotos.title':        { en: 'Progress Photos', es: 'Fotos de Progreso', el: 'Φωτογραφίες Προόδου' },
  'progressphotos.upload_first': { en: 'Upload your first progress photo', es: 'Sube tu primera foto de progreso', el: 'Ανέβασε την πρώτη σου φωτογραφία προόδου' },
  'progressphotos.description':  { en: 'Photos are taken every 30 days. Your coach can review them during sessions.', es: 'Las fotos se toman cada 30 días. Tu coach puede revisarlas durante las sesiones.', el: 'Οι φωτογραφίες λαμβάνονται κάθε 30 ημέρες. Ο coach σου μπορεί να τις εξετάσει στη διάρκεια των συνεδριών.' },
  'progressphotos.coming_soon':  { en: 'Coming Soon', es: 'Próximamente', el: 'Σύντομα' },

  // ── Exercise comparison (i18n) ──
  'exercisecompare.date':        { en: 'Date', es: 'Fecha', el: 'Ημερομηνία' },
  'exercisecompare.sets':        { en: 'Sets', es: 'Series', el: 'Σετ' },
  'exercisecompare.best_wt':     { en: 'Best Wt', es: 'Mejor Peso', el: 'Καλ. Βάρος' },
  'exercisecompare.total_reps':  { en: 'Total Reps', es: 'Reps Totales', el: 'Σύν. Επαν.' },
  'exercisecompare.volume':      { en: 'Volume', es: 'Volumen', el: 'Όγκος' },
  'exercisecompare.best_weight_trend': { en: 'Best Weight Trend', es: 'Tendencia de Mejor Peso', el: 'Τάση Καλύτερου Βάρους' },
  'exercisecompare.no_sessions': { en: 'No sessions found for this exercise', es: 'No hay sesiones para este ejercicio', el: 'Δεν βρέθηκαν συνεδρίες για αυτή την άσκηση' },
};

// ─── Context & Hook ───

interface I18nContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType>({
  lang: 'en',
  setLang: () => {},
  t: (key: string) => key,
});

export function I18nProvider({ children, defaultLang = 'en' }: { children: ReactNode; defaultLang?: Language }) {
  // Initialize with defaultLang so server and client first render match (fixes hydration mismatch).
  // Read localStorage only after mount in useEffect — localStorage is unavailable on the server.
  const [lang, setLangState] = useState<Language>(defaultLang);
  // Bumped when an overlay locale finishes loading so `t` re-renders with real strings.
  const [overlayVersion, setOverlayVersion] = useState(0);

  useEffect(() => {
    const stored = localStorage.getItem('trophe_lang') as Language | null;
    if (stored && stored !== defaultLang) {
      setLangState(stored);
      document.documentElement.lang = stored;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lazy-load the overlay dictionary the first time an overlay language is active.
  // Until it arrives, `t` falls back to English (brief, overlay-users only).
  useEffect(() => {
    if (!isOverlayLang(lang) || OVERLAYS[lang]) return;
    let cancelled = false;
    OVERLAY_LOADERS[lang]().then((dict) => {
      OVERLAYS[lang] = dict;
      if (!cancelled) setOverlayVersion((v) => v + 1);
    }).catch(() => { /* EN fallback already in place */ });
    return () => { cancelled = true; };
  }, [lang]);

  const setLang = useCallback((newLang: Language) => {
    setLangState(newLang);
    if (typeof window !== 'undefined') {
      localStorage.setItem('trophe_lang', newLang);
      document.documentElement.lang = newLang;
    }
  }, []);

  const t = useCallback((key: string, params?: Record<string, string | number>): string => {
    const inline = translations[key]?.[lang as CoreLanguage];
    let text = inline || OVERLAYS[lang]?.[key] || translations[key]?.['en'] || key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, String(v));
      });
    }
    return text;
  // overlayVersion re-binds t when an overlay dictionary arrives.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, overlayVersion]);

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

export const LANGUAGE_OPTIONS: { code: Language; label: string; flag: string }[] = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'el', label: 'Ελληνικά', flag: '🇬🇷' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
  { code: 'pt', label: 'Português', flag: '🇵🇹' },
  { code: 'nl', label: 'Nederlands', flag: '🇳🇱' },
];
