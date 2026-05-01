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
