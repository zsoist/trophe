# i18n TODO — Coach-surface overhaul (branch overhaul/workout-branded-premium)

New/changed English strings hardcoded on the coach surfaces during the
display-prefs + workouts overhaul. The orchestrator integrates these into
lib/i18n.tsx / lib/locales/* (files were off-limits to the build agent).

Format: `key | en | es | el`

## Customize mode (PanelGate + CustomizePanelsBar)

coach.customize.button | Customize | Personalizar | Προσαρμογή
coach.customize.done | Done | Listo | Έτοιμο
coach.customize.reset | Reset to essentials | Restablecer a lo esencial | Επαναφορά στα βασικά
coach.customize.shown | Shown | Visible | Εμφανές
coach.customize.hidden | Hidden | Oculto | Κρυφό
coach.customize.shownTapToHide | Shown — tap to hide | Visible — toca para ocultar | Εμφανές — πάτησε για απόκρυψη
coach.customize.hiddenTapToShow | Hidden — tap to show | Oculto — toca para mostrar | Κρυφό — πάτησε για εμφάνιση
coach.customize.title | Customize panels | Personalizar paneles | Προσαρμογή πάνελ

## Panel titles (edit-mode chips)

coach.panel.pulseCards | Weekly Pulse Cards | Tarjetas de pulso semanal | Κάρτες εβδομαδιαίου παλμού
coach.panel.coachStreak | Coaching Streak | Racha de coaching | Σερί προπονητικής
coach.panel.business | Business numbers | Números del negocio | Αριθμοί επιχείρησης
coach.panel.weeklySummary | Weekly Summary | Resumen semanal | Εβδομαδιαία σύνοψη
coach.panel.summaryBar | Summary Bar | Barra de resumen | Μπάρα σύνοψης
coach.panel.riskHeatmap | Risk Heatmap | Mapa de riesgo | Χάρτης κινδύνου
coach.panel.insightChips | Insight Chips | Chips de insights | Ψηφίδες ευρημάτων
coach.panel.compareClients | Compare Clients | Comparar clientes | Σύγκριση πελατών
coach.panel.activityChart | Activity This Week | Actividad de la semana | Δραστηριότητα εβδομάδας
coach.panel.pendingOnboarding | Pending Onboarding | Onboarding pendiente | Εκκρεμής ένταξη
coach.panel.achievements | Coach Achievements | Logros del coach | Επιτεύγματα προπονητή
coach.panel.monthlyReport | Monthly Report | Informe mensual | Μηνιαία αναφορά
coach.panel.assessment | Assessment | Evaluación | Αξιολόγηση
coach.panel.intake | Intake Interview | Entrevista inicial | Αρχική συνέντευξη
coach.panel.habitCard | Active Habit | Hábito activo | Ενεργή συνήθεια
coach.panel.supplementCompliance | Supplement Compliance | Cumplimiento de suplementos | Συμμόρφωση συμπληρωμάτων
coach.panel.moodTrend | Mood & Signals | Ánimo y señales | Διάθεση & σήματα
coach.panel.roadmap | Coaching Roadmap | Hoja de ruta | Οδικός χάρτης
coach.panel.recentFood | Recent Food Log | Registro de comidas reciente | Πρόσφατο ημερολόγιο φαγητού
coach.panel.mealQuality | Meal Quality | Calidad de comidas | Ποιότητα γευμάτων
coach.panel.proteinDistribution | Protein Distribution | Distribución de proteína | Κατανομή πρωτεΐνης
coach.panel.foodHeatmap | Food Logging Heatmap | Mapa de registro de comidas | Χάρτης καταγραφής φαγητού
coach.panel.weekendAnalysis | Weekday vs Weekend | Entre semana vs fin de semana | Καθημερινές vs Σαββατοκύριακο
coach.panel.twoWeekComparison | 2-Week Comparison | Comparación de 2 semanas | Σύγκριση 2 εβδομάδων
coach.panel.healthScore | Health Score | Puntuación de salud | Δείκτης υγείας
coach.panel.consistencyScore | Consistency Score | Puntuación de constancia | Δείκτης συνέπειας
coach.panel.aiInsight | AI Insight | Insight de IA | Εύρημα AI
coach.panel.activityTimeline | Activity Timeline | Línea de tiempo | Χρονολόγιο δραστηριότητας
coach.panel.smartTools | Smart Tools | Herramientas inteligentes | Έξυπνα εργαλεία
coach.panel.habitHistory | Habit History | Historial de hábitos | Ιστορικό συνηθειών
coach.panel.weightChart | Weight & Measurements | Peso y medidas | Βάρος & μετρήσεις
coach.panel.workouts | Workouts | Entrenamientos | Προπονήσεις

## Dashboard (relabels + compare modal)

coach.pulse.checkins | Check-ins | Check-ins | Check-ins
coach.pulse.checkinsExplain | Total habit check-ins from all your clients this week. | Total de check-ins de hábitos de todos tus clientes esta semana. | Σύνολο check-ins συνηθειών από όλους τους πελάτες σου αυτή την εβδομάδα.
coach.monthlyReport.checkins | Check-ins | Check-ins | Check-ins
coach.compare.clientA | Client A | Cliente A | Πελάτης Α
coach.compare.clientB | Client B | Cliente B | Πελάτης Β
coach.compare.loading | Loading 7-day intake… | Cargando ingesta de 7 días… | Φόρτωση πρόσληψης 7 ημερών…
coach.compare.title | 7-Day Intake vs Targets | Ingesta de 7 días vs objetivos | Πρόσληψη 7 ημερών vs στόχοι
coach.compare.footnote | Average intake over the last 7 logged days vs each client's targets (dashed ring = 100% of target). | Ingesta media de los últimos 7 días registrados vs los objetivos de cada cliente (anillo discontinuo = 100% del objetivo). | Μέση πρόσληψη τις τελευταίες 7 καταγεγραμμένες ημέρες vs στόχοι κάθε πελάτη (διακεκομμένος δακτύλιος = 100% του στόχου).
coach.compare.noTargets | No macro targets set for either client — the chart needs targets to compare against. | Ningún cliente tiene objetivos de macros — el gráfico necesita objetivos para comparar. | Κανένας πελάτης δεν έχει στόχους μακροθρεπτικών — το γράφημα χρειάζεται στόχους για σύγκριση.
coach.nav.calendar | Calendar | Calendario | Ημερολόγιο
coach.nav.workouts | Workouts | Entrenamientos | Προπονήσεις

## Client detail

coach.detail.noTargetsAdherence | No macro targets set yet — adherence can't be measured. | Aún no hay objetivos de macros — no se puede medir la adherencia. | Δεν έχουν οριστεί στόχοι μακροθρεπτικών — η συμμόρφωση δεν μπορεί να μετρηθεί.
coach.detail.setTargets | Set targets | Definir objetivos | Ορισμός στόχων
coach.detail.consistency28d | Consistency (28d) | Constancia (28d) | Συνέπεια (28ημ)
coach.detail.foodHeatmap28d | Food Logging Heatmap (28d) | Mapa de registro de comidas (28d) | Χάρτης καταγραφής φαγητού (28ημ)
coach.detail.smartSuggestions | Smart Suggestions | Sugerencias inteligentes | Έξυπνες προτάσεις
coach.detail.setTargetsOptimizer | Set macro targets to enable the optimizer | Define objetivos de macros para activar el optimizador | Όρισε στόχους μακροθρεπτικών για να ενεργοποιηθεί ο βελτιστοποιητής

## Client view settings (What this client sees)

coach.clientView.title | What this client sees | Lo que ve este cliente | Τι βλέπει αυτός ο πελάτης
coach.clientView.appliesTo | applies to their app | se aplica a su app | ισχύει για την εφαρμογή του
coach.clientView.saving | saving… | guardando… | αποθήκευση…
coach.clientView.saved | saved | guardado | αποθηκεύτηκε
coach.clientView.saveFailed | save failed | error al guardar | αποτυχία αποθήκευσης
coach.clientView.showCalories | Calorie numbers | Números de calorías | Αριθμοί θερμίδων
coach.clientView.showCaloriesHint | kcal values across the client app | valores de kcal en toda la app del cliente | τιμές kcal σε όλη την εφαρμογή του πελάτη
coach.clientView.showFoodIdeas | Food ideas | Ideas de comidas | Ιδέες φαγητού
coach.clientView.showFoodIdeasHint | Generic meal suggestions | Sugerencias genéricas de comidas | Γενικές προτάσεις γευμάτων
coach.clientView.logAnalytics | Log analytics | Analíticas del registro | Αναλύσεις καταγραφής
coach.clientView.logAnalyticsHint | Macro trends, food frequency, day patterns | Tendencias de macros, frecuencia de alimentos, patrones diarios | Τάσεις μακροθρεπτικών, συχνότητα τροφών, ημερήσια μοτίβα
coach.clientView.nutritionIntel | Nutrition intel | Inteligencia nutricional | Διατροφική ευφυΐα
coach.clientView.nutritionIntelHint | Fasting timer, nutrient density, photos | Temporizador de ayuno, densidad de nutrientes, fotos | Χρονόμετρο νηστείας, πυκνότητα θρεπτικών, φωτογραφίες
coach.clientView.smartInsight | Smart insight | Insight inteligente | Έξυπνο εύρημα
coach.clientView.smartInsightHint | One-line AI insight on home | Insight de IA de una línea en inicio | Μονόγραμμο εύρημα AI στην αρχική
coach.clientView.weeklyCheckin | Weekly check-in | Check-in semanal | Εβδομαδιαίο check-in
coach.clientView.weeklyCheckinHint | Weekly reflection prompt | Reflexión semanal | Εβδομαδιαία ερώτηση αναστοχασμού

## Workouts panel (client detail)

coach.workouts.title | Workouts | Entrenamientos | Προπονήσεις
coach.workouts.assignEdit | Assign / Edit program | Asignar / Editar programa | Ανάθεση / Επεξεργασία προγράμματος
coach.workouts.assign | Assign program | Asignar programa | Ανάθεση προγράμματος
coach.workouts.assigned | Assigned | Asignado | Ανατέθηκε
coach.workouts.noProgram | No workout program assigned yet | Aún no hay programa de entrenamiento asignado | Δεν έχει ανατεθεί πρόγραμμα προπόνησης ακόμα
coach.workouts.recentSessions | Recent sessions | Sesiones recientes | Πρόσφατες συνεδρίες
coach.workouts.noSessions | No sessions logged yet | Aún no hay sesiones registradas | Δεν έχουν καταγραφεί συνεδρίες ακόμα
coach.workouts.workout | Workout | Entrenamiento | Προπόνηση
coach.workouts.sets | sets | series | σετ
coach.workouts.set | set | serie | σετ
coach.workouts.prs | PRs | RPs | ΑΡ
coach.workouts.pr | PR | RP | ΑΡ
coach.workouts.personalRecords | personal records | récords personales | ατομικά ρεκόρ
coach.workouts.painFlags | Pain flags | Señales de dolor | Ενδείξεις πόνου
coach.workouts.restDay | Rest day | Día de descanso | Ημέρα ξεκούρασης
coach.workouts.loadError | Could not load workout data — try refreshing. | No se pudieron cargar los datos de entrenamiento — intenta recargar. | Δεν ήταν δυνατή η φόρτωση των δεδομένων προπόνησης — δοκίμασε ανανέωση.
coach.workouts.min | min | min | λεπ

## Program Builder (templates page)

coach.builder.title | Program Builder | Constructor de programas | Δημιουργός προγραμμάτων
coach.builder.editingActive | editing active program | editando programa activo | επεξεργασία ενεργού προγράμματος
coach.builder.client | Client | Cliente | Πελάτης
coach.builder.selectClient | Select a client… | Selecciona un cliente… | Επίλεξε πελάτη…
coach.builder.programName | Program name | Nombre del programa | Όνομα προγράμματος
coach.builder.programNamePlaceholder | e.g. Push/Pull/Legs — Block 1 | ej. Empuje/Tirón/Piernas — Bloque 1 | π.χ. Push/Pull/Legs — Μπλοκ 1
coach.builder.defaultProgramName | Training program | Programa de entrenamiento | Πρόγραμμα προπόνησης
coach.builder.possessiveProgram | {name}'s program | Programa de {name} | Πρόγραμμα του/της {name}
coach.builder.assigning | Assigning… | Asignando… | Ανάθεση…
coach.builder.saveReplace | Save & replace active program | Guardar y reemplazar programa activo | Αποθήκευση & αντικατάσταση ενεργού προγράμματος
coach.builder.assignProgram | Assign program | Asignar programa | Ανάθεση προγράμματος
coach.builder.pickClientHint | Pick a client to load their current program | Elige un cliente para cargar su programa actual | Επίλεξε πελάτη για να φορτωθεί το τρέχον πρόγραμμά του
coach.builder.addTrainingDay | Add at least one training day | Añade al menos un día de entrenamiento | Πρόσθεσε τουλάχιστον μία ημέρα προπόνησης
coach.builder.assignedToast | Program assigned | Programa asignado | Το πρόγραμμα ανατέθηκε
coach.builder.assignFailedToast | Failed to assign program | Error al asignar el programa | Αποτυχία ανάθεσης προγράμματος
coach.builder.modalTitle | Assign Program | Asignar programa | Ανάθεση προγράμματος
coach.builder.noClients | No clients assigned to you | No tienes clientes asignados | Δεν σου έχουν ανατεθεί πελάτες

## Templates page

coach.templates.edit | Edit template | Editar plantilla | Επεξεργασία προτύπου
coach.templates.editTitle | Edit Template | Editar plantilla | Επεξεργασία προτύπου
coach.templates.assignToProgram | Assign to a client program | Asignar a un programa de cliente | Ανάθεση σε πρόγραμμα πελάτη
coach.templates.delete | Delete template | Eliminar plantilla | Διαγραφή προτύπου
coach.templates.saveChanges | Save Changes | Guardar cambios | Αποθήκευση αλλαγών
coach.templates.updatedToast | Template updated | Plantilla actualizada | Το πρότυπο ενημερώθηκε
coach.templates.updateFailedToast | Failed to update template | Error al actualizar la plantilla | Αποτυχία ενημέρωσης προτύπου
coach.templates.createFailedToast | Failed to create template | Error al crear la plantilla | Αποτυχία δημιουργίας προτύπου
coach.templates.saveFailedToast | Failed to save template | Error al guardar la plantilla | Αποτυχία αποθήκευσης προτύπου
coach.templates.addExercise | Add at least one exercise | Añade al menos un ejercicio | Πρόσθεσε τουλάχιστον μία άσκηση

## Inbox

coach.inbox.filter | Filter conversations | Filtrar conversaciones | Φιλτράρισμα συνομιλιών
coach.inbox.all | All | Todos | Όλα
coach.inbox.unread | Unread | No leídos | Μη αναγνωσμένα
coach.inbox.quiet3d | Quiet 3d+ | Inactivos 3d+ | Σιωπηλοί 3ημ+
coach.inbox.noUnread | No unread messages | No hay mensajes sin leer | Δεν υπάρχουν μη αναγνωσμένα μηνύματα
coach.inbox.nobodyQuiet | Nobody has been quiet 3+ days | Nadie lleva 3+ días inactivo | Κανείς δεν είναι σιωπηλός 3+ ημέρες
