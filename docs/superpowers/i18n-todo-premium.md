# i18n TODO — premium polish pass (2026-07-03)

New user-visible strings hardcoded in English during the gold/dark-glass
premium overhaul (ConfirmSheet rollout, empty-state CTAs, onboarding restyle).
lib/i18n.tsx is a follow-up pass — add these keys there and swap the hardcoded
literals for `t()` calls.

Format: `key | en | es | el` (es/el are draft translations — review before shipping).

## components/ui/ConfirmSheet.tsx (defaults)

key | en | es | el
--- | --- | --- | ---
confirm.confirm | Confirm | Confirmar | Επιβεβαίωση
confirm.cancel | Cancel | Cancelar | Άκυρο

## app/coach/habits/page.tsx

key | en | es | el
--- | --- | --- | ---
confirm.delete_habit_title | Delete this custom habit? | ¿Eliminar este hábito personalizado? | Διαγραφή αυτής της προσαρμοσμένης συνήθειας;
confirm.delete_habit_msg | Clients currently assigned to it keep their history, but the habit disappears from your library. | Los clientes asignados conservan su historial, pero el hábito desaparece de tu biblioteca. | Οι πελάτες που την έχουν κρατούν το ιστορικό τους, αλλά η συνήθεια αφαιρείται από τη βιβλιοθήκη σου.
confirm.delete | Delete | Eliminar | Διαγραφή
habits.emoji_placeholder | Optional | Opcional | Προαιρετικό

## app/coach/foods/page.tsx

key | en | es | el
--- | --- | --- | ---
confirm.delete_food_title | Delete this custom food? | ¿Eliminar este alimento personalizado? | Διαγραφή αυτού του προσαρμοσμένου τροφίμου;
confirm.delete_food_msg | It will no longer appear in searches or quick-log lists. | Ya no aparecerá en búsquedas ni listas rápidas. | Δεν θα εμφανίζεται πλέον σε αναζητήσεις ή γρήγορες λίστες.

## app/coach/protocols/page.tsx

key | en | es | el
--- | --- | --- | ---
confirm.delete_protocol_title | Delete this protocol? | ¿Eliminar este protocolo? | Διαγραφή αυτού του πρωτοκόλλου;
confirm.delete_protocol_msg | Clients already assigned keep their current plan; the template is removed from your library. | Los clientes asignados conservan su plan; la plantilla se elimina de tu biblioteca. | Οι πελάτες που το έχουν κρατούν το πλάνο τους· το πρότυπο αφαιρείται από τη βιβλιοθήκη σου.

## app/coach/templates/page.tsx

key | en | es | el
--- | --- | --- | ---
confirm.delete_template_title | Delete this template? | ¿Eliminar esta plantilla? | Διαγραφή αυτού του προτύπου;
confirm.delete_template_msg | Programs already assigned from it are unaffected. | Los programas ya asignados no se ven afectados. | Τα προγράμματα που έχουν ήδη ανατεθεί δεν επηρεάζονται.

## app/dashboard/book/page.tsx

key | en | es | el
--- | --- | --- | ---
confirm.late_cancel_title | Cancel this session? | ¿Cancelar esta sesión? | Ακύρωση αυτής της συνεδρίας;
confirm.late_cancel_msg | Less than 24h notice — your coach may apply a late-cancellation charge. | Menos de 24h de aviso — tu coach puede aplicar un cargo por cancelación tardía. | Λιγότερο από 24ώρη ειδοποίηση — ο coach σου μπορεί να χρεώσει καθυστερημένη ακύρωση.
confirm.cancel_anyway | Cancel anyway | Cancelar igualmente | Ακύρωση ούτως ή άλλως
confirm.keep_booking | Keep booking | Mantener la reserva | Διατήρηση κράτησης

## app/dashboard/page.tsx

key | en | es | el
--- | --- | --- | ---
dash.message_coach_cta | Message your coach | Escribe a tu coach | Στείλε μήνυμα στον coach σου

## app/dashboard/progress/page.tsx

key | en | es | el
--- | --- | --- | ---
progress.log_weight_cta | Log a weight now | Registra un peso ahora | Κατέγραψε βάρος τώρα
