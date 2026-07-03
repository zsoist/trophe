# i18n TODO — client workout rebuild + client-view prefs (2026-07-02)

New client-facing strings hardcoded in English during the workout rebuild
(guided mode, program cards) and the client_view_prefs gating pass.
lib/i18n.tsx is owned by the coach agent / a follow-up pass — add these keys
there and swap the hardcoded literals for `t()` calls.

Format: `key | en | es | el` (es/el are draft translations — review before shipping).

## components/workout/TodayProgramCard.tsx

key | en | es | el
--- | --- | --- | ---
workout.program_today | {program} · Today | {program} · Hoy | {program} · Σήμερα
workout.start_workout | Start workout | Iniciar entreno | Έναρξη προπόνησης
workout.loading | Loading… | Cargando… | Φόρτωση…
workout.also_today | Also today | También hoy | Επίσης σήμερα
workout.exercise_count | {n} exercises | {n} ejercicios | {n} ασκήσεις
workout.est_sets | ~{n} sets | ~{n} series | ~{n} σετ
workout.difficulty_beginner | Beginner | Principiante | Αρχάριος
workout.difficulty_intermediate | Intermediate | Intermedio | Μεσαίος
workout.difficulty_advanced | Advanced | Avanzado | Προχωρημένος
workout.rest_day | Rest day | Día de descanso | Ημέρα ξεκούρασης
workout.rest_nothing_today | Nothing scheduled today | Nada programado hoy | Τίποτα προγραμματισμένο σήμερα
workout.next_session | Next session: | Próxima sesión: | Επόμενη συνεδρία:
workout.tomorrow | tomorrow | mañana | αύριο
workout.train_anyway | Train anyway | Entrenar igual | Προπόνηση ούτως ή άλλως
workout.rest_tip_1 | Recovery is where the adaptation happens — aim for 7-9h of sleep tonight. | La recuperación es donde ocurre la adaptación — apunta a 7-9h de sueño. | Η αποκατάσταση είναι όπου συμβαίνει η προσαρμογή — στόχευσε 7-9 ώρες ύπνου.
workout.rest_tip_2 | Light movement helps: a 20-30 min walk speeds up recovery without adding fatigue. | El movimiento ligero ayuda: una caminata de 20-30 min acelera la recuperación. | Η ελαφριά κίνηση βοηθά: 20-30 λεπτά περπάτημα επιταχύνουν την αποκατάσταση.
workout.rest_tip_3 | Hit your protein target today — muscle repair does not take rest days. | Cumple tu objetivo de proteína hoy — la reparación muscular no descansa. | Πέτυχε τον στόχο πρωτεΐνης σήμερα — η μυϊκή αποκατάσταση δεν κάνει ρεπό.
workout.rest_tip_4 | Hydrate and stretch the muscle groups you trained this week. | Hidrátate y estira los grupos musculares que entrenaste esta semana. | Ενυδατώσου και κάνε διατάσεις στους μύες που γύμνασες αυτή την εβδομάδα.
workout.rest_tip_5 | A rest day is part of the program, not a break from it. | Un día de descanso es parte del programa, no una pausa. | Η ημέρα ξεκούρασης είναι μέρος του προγράμματος, όχι διάλειμμα.
general.weekday_sunday…saturday | Sunday … Saturday | domingo … sábado | Κυριακή … Σάββατο

## components/workout/GuidedSession.tsx

key | en | es | el
--- | --- | --- | ---
workout.resting | Resting | Descansando | Ξεκούραση
workout.rested_go | Rested — go | Descansado — dale | Ξεκουράστηκες — πάμε
workout.rest_dismiss_hint | Rest since last set — tap to dismiss | Descanso desde la última serie — toca para cerrar | Ξεκούραση από το τελευταίο σετ — πάτησε για κλείσιμο
workout.exit | Exit workout | Salir del entreno | Έξοδος από την προπόνηση
workout.sets_progress | {done}/{total} sets | {done}/{total} series | {done}/{total} σετ
workout.up_next | Up next | Sigue | Επόμενο
workout.add_extra_set | Add extra set | Añadir serie extra | Πρόσθεσε extra σετ
workout.skip | Skip | Saltar | Παράλειψη
workout.exercise_skipped | Exercise skipped | Ejercicio saltado | Η άσκηση παραλείφθηκε
workout.undo_skip | Undo skip | Deshacer salto | Αναίρεση παράλειψης
workout.next_exercise | Next exercise | Siguiente ejercicio | Επόμενη άσκηση
workout.end_early | End | Terminar | Τέλος
workout.saving | Saving… | Guardando… | Αποθήκευση…
workout.template_done | {name} done | {name} completado | {name} ολοκληρώθηκε
workout.sets_label | Sets | Series | Σετ
workout.pr_count | {n} personal record(s) | {n} récord(s) personal(es) | {n} προσωπικό(ά) ρεκόρ
workout.pain_shared | {n} pain flag(s) shared with your coach | {n} señal(es) de dolor compartida(s) con tu coach | {n} σήμα(τα) πόνου κοινοποιήθηκαν στον προπονητή σου
workout.done | Done | Listo | Έγινε
workout.warmup_hint | Tap to mark as warmup | Toca para marcar como calentamiento | Πάτησε για σήμανση ως ζέσταμα
workout.complete_set | Complete set | Completar serie | Ολοκλήρωση σετ
workout.undo_set | Undo set | Deshacer serie | Αναίρεση σετ
workout.report_pain | Report pain | Reportar dolor | Αναφορά πόνου

## app/dashboard/workout/page.tsx (landing)

key | en | es | el
--- | --- | --- | ---
workout.freestyle | Freestyle | Libre | Ελεύθερο
workout.cardio | Cardio | Cardio | Καρδιο
workout.log_cardio | Log cardio | Registrar cardio | Καταγραφή cardio
workout.no_program_hint | No training program yet — ask your coach for one | Aún sin programa de entrenamiento — pídeselo a tu coach | Δεν υπάρχει πρόγραμμα ακόμα — ζήτησέ το από τον προπονητή σου
workout.stats | Stats | Estadísticas | Στατιστικά
workout.form_check | Form Check | Chequeo de técnica | Έλεγχος τεχνικής
workout.view_full_history | View full history → | Ver historial completo → | Δες πλήρες ιστορικό →
workout.no_sets_cardio | No sets recorded (cardio / quick log) | Sin series registradas (cardio / registro rápido) | Χωρίς σετ (cardio / γρήγορη καταγραφή)
workout.start_today_hint | Start today's session above to begin tracking PRs | Inicia la sesión de hoy arriba para empezar a registrar RPs | Ξεκίνα τη σημερινή συνεδρία για να καταγράφεις PR

## app/dashboard/page.tsx (smart-insight protein-first fallbacks)

key | en | es | el
--- | --- | --- | ---
insight.protein_hit | Protein target hit for today | Objetivo de proteína cumplido hoy | Ο στόχος πρωτεΐνης επιτεύχθηκε σήμερα
insight.protein_progress | Protein: {n} of {target}g today | Proteína: {n} de {target}g hoy | Πρωτεΐνη: {n} από {target}g σήμερα
insight.keep_logging | Nice logging — keep it up | Buen registro — sigue así | Καλή καταγραφή — συνέχισε έτσι

## components/summary/DailyInsights.tsx (protein-first pacing)

key | en | es | el
--- | --- | --- | ---
insights.protein_ahead | Strong protein pace — ahead of schedule for today. | Buen ritmo de proteína — vas adelantado hoy. | Δυνατός ρυθμός πρωτεΐνης — μπροστά από το πρόγραμμα σήμερα.
insights.protein_behind | Protein is lagging today — build your next meal around it. | La proteína va atrasada hoy — céntrala en tu próxima comida. | Η πρωτεΐνη υστερεί σήμερα — βάσισε το επόμενο γεύμα σου σε αυτήν.

## app/dashboard/workout/stats/page.tsx

key | en | es | el
--- | --- | --- | ---
workout.back_to_workout | Back to Workout | Volver a Entreno | Πίσω στην Προπόνηση
