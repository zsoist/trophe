import type { CoreLanguage } from "../types";
const rows: Record<string, [string, string, string]> = {
  other_view_selection: [
    "This selection is on the other view. Use its muscle action to show it.",
    "Esta selección está en la otra vista. Usa su botón muscular para mostrarla.",
    "Αυτή η επιλογή βρίσκεται στην άλλη όψη. Χρησιμοποιήστε το κουμπί του μυός για να την εμφανίσετε.",
  ],
  zoom_in: ["Zoom in", "Ampliar", "Μεγέθυνση"],
  zoom_out: ["Zoom out", "Reducir", "Σμίκρυνση"],
  layer_limit: [
    "Hide another layer before adding this one. The full catalogue remains available.",
    "Oculta otra capa antes de añadir esta. El catálogo completo sigue disponible.",
    "Αποκρύψτε ένα άλλο επίπεδο πριν προσθέσετε αυτό. Ο πλήρης κατάλογος παραμένει διαθέσιμος.",
  ],
  mapped_group: [
    "Curated muscle group",
    "Grupo muscular curado",
    "Επιμελημένη μυϊκή ομάδα",
  ],
  mapping_scope: [
    "Source relationships, separate from exercise roles.",
    "Relaciones con la fuente, separadas de los roles en ejercicios.",
    "Σχέσεις με την πηγή, χωριστά από τους ρόλους στις ασκήσεις.",
  ],
  mapping_named: [
    "Named source structure",
    "Estructura nombrada en la fuente",
    "Ονομασμένη δομή πηγής",
  ],
  mapping_group: [
    "Several source structures form this group",
    "Varias estructuras forman este grupo",
    "Πολλές δομές σχηματίζουν αυτή την ομάδα",
  ],
  mapping_partial: [
    "Partial mapping; additional structures remain unresolved",
    "Correspondencia parcial; quedan estructuras sin resolver",
    "Μερική αντιστοίχιση· άλλες δομές παραμένουν ανεπίλυτες",
  ],
  mapping_unresolved: [
    "No verified source mapping available",
    "Sin correspondencia verificada en la fuente",
    "Χωρίς επαληθευμένη αντιστοίχιση στην πηγή",
  ],
  title: ["Explore anatomy", "Explorar anatomía", "Εξερεύνηση ανατομίας"],
  scope: [
    "A static, generic adult male atlas. Source coverage varies; this is not your personal anatomy.",
    "Atlas estático de un adulto masculino genérico. La cobertura de la fuente varía; no representa tu anatomía personal.",
    "Στατικός άτλαντας ενήλικου άνδρα. Η κάλυψη της πηγής ποικίλλει· δεν αναπαριστά τη δική σας ανατομία.",
  ],
  english_chrome: [
    "These explorer controls are currently available in English.",
    "Estos controles están disponibles en inglés.",
    "Τα χειριστήρια είναι διαθέσιμα στα αγγλικά.",
  ],
  viewer: [
    "Whole-body anatomy",
    "Anatomía de cuerpo completo",
    "Ανατομία ολόκληρου του σώματος",
  ],
  orientation: ["View direction", "Dirección de vista", "Κατεύθυνση προβολής"],
  front: ["Front", "Frente", "Μπροστά"],
  back: ["Back", "Espalda", "Πίσω"],
  side: ["Side", "Lateral", "Πλάι"],
  reset: ["Reset view", "Restablecer vista", "Επαναφορά προβολής"],
  fallback: [
    "The 3D view is unavailable. You can still search and explore the catalogue below.",
    "La vista 3D no está disponible. Puedes seguir explorando el catálogo de texto.",
    "Η προβολή 3D δεν είναι διαθέσιμη. Μπορείτε να εξερευνήσετε τον κατάλογο κειμένου.",
  ],
  open_hint: [
    "Open the body when you are ready. Geometry loads only for the layers you choose.",
    "Abre el cuerpo cuando quieras. Solo se carga la geometría de las capas que elijas.",
    "Ανοίξτε το σώμα όταν είστε έτοιμοι. Φορτώνεται μόνο η γεωμετρία των επιλεγμένων επιπέδων.",
  ],
  open: ["Open 3D view", "Abrir vista 3D", "Άνοιγμα προβολής 3D"],
  close: ["Close 3D view", "Cerrar vista 3D", "Κλείσιμο προβολής 3D"],
  retry: ["Retry", "Reintentar", "Δοκιμή ξανά"],
  loading: ["Loading catalogue…", "Cargando catálogo…", "Φόρτωση καταλόγου…"],
  layers_loaded: [
    "geometry chunks loaded",
    "bloques de geometría cargados",
    "τμήματα γεωμετρίας φορτώθηκαν",
  ],
  unlock_scroll: [
    "Finish rotating · scroll page",
    "Terminar giro · desplazar página",
    "Τέλος περιστροφής · κύλιση σελίδας",
  ],
  orbit: [
    "Enable drag to rotate / pinch to zoom",
    "Activar arrastre para girar / pellizco para ampliar",
    "Σύρετε για περιστροφή / τσιμπήστε για μεγέθυνση",
  ],
  systems: ["Body systems", "Sistemas del cuerpo", "Συστήματα σώματος"],
  skeleton: ["Skeleton", "Esqueleto", "Σκελετός"],
  muscles: ["Muscles", "Músculos", "Μύες"],
  connective: [
    "Connective structures",
    "Estructuras conectivas",
    "Συνδετικές δομές",
  ],
  vascular: [
    "Cardiovascular structures",
    "Estructuras cardiovasculares",
    "Αιμοφόρα αγγεία",
  ],
  nervous: ["Nervous structures", "Estructuras nerviosas", "Νευρικές δομές"],
  organs: ["Organs", "Órganos", "Όργανα"],
  other: [
    "Other supplied structures",
    "Otras estructuras de la fuente",
    "Άλλες δομές της πηγής",
  ],
  selection: [
    "Selected structure",
    "Estructura seleccionada",
    "Επιλεγμένη δομή",
  ],
  source_english: [
    "Original source name · English",
    "Nombre original de la fuente · inglés",
    "Αρχικό όνομα πηγής · αγγλικά",
  ],
  left: ["Left", "Izquierda", "Αριστερά"],
  right: ["Right", "Derecha", "Δεξιά"],
  bilateral: ["Both sides", "Ambos lados", "Και οι δύο πλευρές"],
  unspecified: [
    "Side not specified by name",
    "Lado no indicado en el nombre",
    "Η πλευρά δεν καθορίζεται στο όνομα",
  ],
  available: [
    "Geometry available",
    "Geometría disponible",
    "Διαθέσιμη γεωμετρία",
  ],
  partial: [
    "Some geometry unavailable",
    "Parte de la geometría no está disponible",
    "Μέρος της γεωμετρίας δεν είναι διαθέσιμο",
  ],
  missing: ["Missing geometry", "Geometría ausente", "Ελλείπουσα γεωμετρία"],
  unmapped: [
    "No source geometry mapping",
    "Sin correspondencia geométrica en la fuente",
    "Χωρίς αντιστοίχιση γεωμετρίας στην πηγή",
  ],
  rejected: [
    "Conversion rejected",
    "Conversión rechazada",
    "Η μετατροπή απορρίφθηκε",
  ],
  hidden_target: [
    "Some or all of this selection is hidden. Reveal it or enable its layer. The selected identity stays the same.",
    "Parte o toda esta selección está oculta. Muéstrala o activa su capa. La identidad seleccionada no cambia.",
    "Μέρος ή όλη η επιλογή είναι κρυφή. Εμφανίστε την ή ενεργοποιήστε το επίπεδό της. Η ταυτότητα δεν αλλάζει.",
  ],
  reveal: ["Reveal", "Mostrar", "Εμφάνιση"],
  hide: ["Hide", "Ocultar", "Απόκρυψη"],
  isolate: ["Isolate selection", "Aislar selección", "Απομόνωση επιλογής"],
  no_selection: [
    "Choose a structure in the body or the list.",
    "Elige una estructura en el cuerpo o en la lista.",
    "Επιλέξτε μια δομή στο σώμα ή στη λίστα.",
  ],
  search: [
    "Search original names or IDs",
    "Buscar nombres originales o IDs",
    "Αναζήτηση αρχικών ονομάτων ή ID",
  ],
  results: [
    "matching concepts",
    "conceptos coincidentes",
    "αντίστοιχες έννοιες",
  ],
  refine: [
    "Showing the first 100 matches. Refine your search to find any source concept.",
    "Se muestran las primeras 100 coincidencias. Acota la búsqueda para encontrar cualquier concepto de la fuente.",
    "Εμφανίζονται τα πρώτα 100 αποτελέσματα. Περιορίστε την αναζήτηση για οποιαδήποτε έννοια της πηγής.",
  ],
  details: [
    "Source, coverage and limitations",
    "Fuente, cobertura y límites",
    "Πηγή, κάλυψη και περιορισμοί",
  ],
  not_clinical: [
    "Licensed source geometry is not clinical validation. Reduced meshes cannot show every fine structure.",
    "Una licencia de uso no demuestra validación clínica. Las mallas reducidas no muestran todas las estructuras finas.",
    "Η άδεια χρήσης δεν αποτελεί κλινική επικύρωση. Τα μειωμένα πλέγματα δεν δείχνουν κάθε λεπτή δομή.",
  ],
  coverage: [
    "Converted source elements",
    "Elementos de la fuente convertidos",
    "Μετατρεπόμενα στοιχεία πηγής",
  ],
};
export const anatomyTranslations: Record<
  string,
  Record<CoreLanguage, string>
> = Object.fromEntries(
  Object.entries(rows).map(([key, [en, es, el]]) => [
    `anatomy.${key}`,
    { en, es, el },
  ]),
);
