// ═══════════════════════════════════════════════
// τροφή (Trophē) — Trilingual i18n System (EN/ES/EL)
// ═══════════════════════════════════════════════

'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { Language } from './types';

// ─── Translation Dictionary ───
const translations: Record<string, Record<Language, string>> = {
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
  'auth.role_both': { en: 'Both (Coach & Client)', es: 'Ambos (Coach y Cliente)', el: 'Και τα δύο (Coach & Πελάτης)' },

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
  'food.items_found': { en: '{n} items found', es: '{n} alimentos encontrados', el: '{n} τρόφιμα βρέθηκαν' },
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
  const [lang, setLangState] = useState<Language>(() => {
    if (typeof window === 'undefined') return defaultLang;
    return (localStorage.getItem('trophe_lang') as Language) || defaultLang;
  });

  const setLang = useCallback((newLang: Language) => {
    setLangState(newLang);
    if (typeof window !== 'undefined') {
      localStorage.setItem('trophe_lang', newLang);
      document.documentElement.lang = newLang;
    }
  }, []);

  const t = useCallback((key: string, params?: Record<string, string | number>): string => {
    let text = translations[key]?.[lang] || translations[key]?.['en'] || key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, String(v));
      });
    }
    return text;
  }, [lang]);

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
];
