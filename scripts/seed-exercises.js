#!/usr/bin/env node
// ═══════════════════════════════════════════════
// τροφή (Trophē) — Exercise Seed Script
// Inserts 100+ common gym exercises via Supabase upsert
// Usage: node scripts/seed-exercises.js
// ═══════════════════════════════════════════════

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  console.error('Run: source .env.local && node scripts/seed-exercises.js');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── Exercise data: 100+ exercises organized by muscle group ───
const EXERCISES = [
  // ═══ CHEST (10) ═══
  { name: 'Bench Press', name_es: 'Press de banca', name_el: 'Πιέσεις πάγκου', muscle_group: 'chest', secondary_muscles: ['triceps', 'shoulders'], equipment: 'barbell', is_compound: true },
  { name: 'Incline Bench Press', name_es: 'Press inclinado', name_el: 'Πιέσεις πάγκου κεκλιμένου', muscle_group: 'chest', secondary_muscles: ['triceps', 'shoulders'], equipment: 'barbell', is_compound: true },
  { name: 'Dumbbell Flyes', name_es: 'Aperturas con mancuernas', name_el: 'Πεταλούδες με αλτήρες', muscle_group: 'chest', secondary_muscles: ['shoulders'], equipment: 'dumbbell', is_compound: false },
  { name: 'Cable Crossover', name_es: 'Cruce de cables', name_el: 'Χιαστί καλωδίου', muscle_group: 'chest', secondary_muscles: ['shoulders'], equipment: 'cable', is_compound: false },
  { name: 'Push-ups', name_es: 'Flexiones', name_el: 'Κάμψεις', muscle_group: 'chest', secondary_muscles: ['triceps', 'shoulders', 'core'], equipment: 'bodyweight', is_compound: true },
  { name: 'Decline Bench Press', name_es: 'Press declinado', name_el: 'Πιέσεις πάγκου αρνητικής κλίσης', muscle_group: 'chest', secondary_muscles: ['triceps'], equipment: 'barbell', is_compound: true },
  { name: 'Chest Dips', name_es: 'Fondos para pecho', name_el: 'Βυθίσεις στήθους', muscle_group: 'chest', secondary_muscles: ['triceps', 'shoulders'], equipment: 'bodyweight', is_compound: true },
  { name: 'Pec Deck', name_es: 'Pec deck', name_el: 'Πεκ ντεκ', muscle_group: 'chest', secondary_muscles: [], equipment: 'machine', is_compound: false },
  { name: 'Machine Chest Press', name_es: 'Press de pecho en máquina', name_el: 'Πιέσεις στήθους μηχανής', muscle_group: 'chest', secondary_muscles: ['triceps', 'shoulders'], equipment: 'machine', is_compound: true },
  { name: 'Landmine Press', name_es: 'Press landmine', name_el: 'Πιέσεις landmine', muscle_group: 'chest', secondary_muscles: ['shoulders', 'triceps'], equipment: 'barbell', is_compound: true },

  // ═══ BACK (10) ═══
  { name: 'Pull-ups', name_es: 'Dominadas', name_el: 'Έλξεις', muscle_group: 'back', secondary_muscles: ['biceps', 'forearms'], equipment: 'bodyweight', is_compound: true },
  { name: 'Lat Pulldown', name_es: 'Jalón al pecho', name_el: 'Κατεβάσματα πλάτης', muscle_group: 'back', secondary_muscles: ['biceps'], equipment: 'cable', is_compound: true },
  { name: 'Barbell Row', name_es: 'Remo con barra', name_el: 'Κωπηλατική με μπάρα', muscle_group: 'back', secondary_muscles: ['biceps', 'forearms'], equipment: 'barbell', is_compound: true },
  { name: 'Dumbbell Row', name_es: 'Remo con mancuerna', name_el: 'Κωπηλατική με αλτήρα', muscle_group: 'back', secondary_muscles: ['biceps'], equipment: 'dumbbell', is_compound: true },
  { name: 'Seated Cable Row', name_es: 'Remo sentado con cable', name_el: 'Καθιστή κωπηλατική', muscle_group: 'back', secondary_muscles: ['biceps'], equipment: 'cable', is_compound: true },
  { name: 'T-Bar Row', name_es: 'Remo en T', name_el: 'Κωπηλατική T-bar', muscle_group: 'back', secondary_muscles: ['biceps', 'forearms'], equipment: 'barbell', is_compound: true },
  { name: 'Face Pulls', name_es: 'Face pulls', name_el: 'Έλξεις προσώπου', muscle_group: 'back', secondary_muscles: ['shoulders'], equipment: 'cable', is_compound: false },
  { name: 'Deadlift', name_es: 'Peso muerto', name_el: 'Άρσεις θανάτου', muscle_group: 'back', secondary_muscles: ['hamstrings', 'glutes', 'forearms', 'core'], equipment: 'barbell', is_compound: true },
  { name: 'Rack Pulls', name_es: 'Rack pulls', name_el: 'Έλξεις ράκας', muscle_group: 'back', secondary_muscles: ['forearms', 'glutes'], equipment: 'barbell', is_compound: true },
  { name: 'Straight-Arm Pulldown', name_es: 'Pulldown con brazos rectos', name_el: 'Κατεβάσματα ευθείων χεριών', muscle_group: 'back', secondary_muscles: [], equipment: 'cable', is_compound: false },

  // ═══ SHOULDERS (8) ═══
  { name: 'Overhead Press', name_es: 'Press militar', name_el: 'Πιέσεις ώμων', muscle_group: 'shoulders', secondary_muscles: ['triceps'], equipment: 'barbell', is_compound: true },
  { name: 'Lateral Raises', name_es: 'Elevaciones laterales', name_el: 'Πλάγιες άρσεις', muscle_group: 'shoulders', secondary_muscles: [], equipment: 'dumbbell', is_compound: false },
  { name: 'Front Raises', name_es: 'Elevaciones frontales', name_el: 'Μπροστινές άρσεις', muscle_group: 'shoulders', secondary_muscles: [], equipment: 'dumbbell', is_compound: false },
  { name: 'Rear Delt Flyes', name_es: 'Aperturas posteriores', name_el: 'Πεταλούδες οπίσθιου δελτοειδή', muscle_group: 'shoulders', secondary_muscles: ['back'], equipment: 'dumbbell', is_compound: false },
  { name: 'Arnold Press', name_es: 'Press Arnold', name_el: 'Πιέσεις Arnold', muscle_group: 'shoulders', secondary_muscles: ['triceps'], equipment: 'dumbbell', is_compound: true },
  { name: 'Upright Row', name_es: 'Remo vertical', name_el: 'Όρθια κωπηλατική', muscle_group: 'shoulders', secondary_muscles: ['biceps'], equipment: 'barbell', is_compound: true },
  { name: 'Shrugs', name_es: 'Encogimientos de hombros', name_el: 'Σρακ ώμων', muscle_group: 'shoulders', secondary_muscles: ['forearms'], equipment: 'dumbbell', is_compound: false },
  { name: 'Cable Lateral Raise', name_es: 'Elevación lateral con cable', name_el: 'Πλάγιες άρσεις με καλώδιο', muscle_group: 'shoulders', secondary_muscles: [], equipment: 'cable', is_compound: false },

  // ═══ LEGS (12) ═══
  { name: 'Squat', name_es: 'Sentadilla', name_el: 'Κάθισμα', muscle_group: 'quads', secondary_muscles: ['glutes', 'hamstrings', 'core'], equipment: 'barbell', is_compound: true },
  { name: 'Leg Press', name_es: 'Prensa de piernas', name_el: 'Πρέσα ποδιών', muscle_group: 'quads', secondary_muscles: ['glutes', 'hamstrings'], equipment: 'machine', is_compound: true },
  { name: 'Romanian Deadlift', name_es: 'Peso muerto rumano', name_el: 'Ρουμανικές άρσεις θανάτου', muscle_group: 'hamstrings', secondary_muscles: ['glutes', 'back'], equipment: 'barbell', is_compound: true },
  { name: 'Lunges', name_es: 'Zancadas', name_el: 'Προβολές', muscle_group: 'quads', secondary_muscles: ['glutes', 'hamstrings'], equipment: 'dumbbell', is_compound: true },
  { name: 'Bulgarian Split Squat', name_es: 'Sentadilla búlgara', name_el: 'Βουλγαρικό split squat', muscle_group: 'quads', secondary_muscles: ['glutes', 'hamstrings'], equipment: 'dumbbell', is_compound: true },
  { name: 'Leg Curl', name_es: 'Curl de piernas', name_el: 'Κάμψη ποδιών', muscle_group: 'hamstrings', secondary_muscles: [], equipment: 'machine', is_compound: false },
  { name: 'Leg Extension', name_es: 'Extensión de piernas', name_el: 'Εκτάσεις ποδιών', muscle_group: 'quads', secondary_muscles: [], equipment: 'machine', is_compound: false },
  { name: 'Calf Raises', name_es: 'Elevaciones de gemelos', name_el: 'Άρσεις γαμπών', muscle_group: 'calves', secondary_muscles: [], equipment: 'machine', is_compound: false },
  { name: 'Hip Thrust', name_es: 'Empuje de cadera', name_el: 'Ώθηση γοφών', muscle_group: 'glutes', secondary_muscles: ['hamstrings'], equipment: 'barbell', is_compound: true },
  { name: 'Goblet Squat', name_es: 'Sentadilla goblet', name_el: 'Goblet squat', muscle_group: 'quads', secondary_muscles: ['glutes', 'core'], equipment: 'dumbbell', is_compound: true },
  { name: 'Step-ups', name_es: 'Subidas al cajón', name_el: 'Ανεβάσματα', muscle_group: 'quads', secondary_muscles: ['glutes'], equipment: 'dumbbell', is_compound: true },
  { name: 'Hack Squat', name_es: 'Sentadilla hack', name_el: 'Hack squat', muscle_group: 'quads', secondary_muscles: ['glutes'], equipment: 'machine', is_compound: true },

  // ═══ BICEPS (5) ═══
  { name: 'Barbell Curl', name_es: 'Curl con barra', name_el: 'Δικεφαλικές με μπάρα', muscle_group: 'biceps', secondary_muscles: ['forearms'], equipment: 'barbell', is_compound: false },
  { name: 'Dumbbell Curl', name_es: 'Curl con mancuernas', name_el: 'Δικεφαλικές με αλτήρες', muscle_group: 'biceps', secondary_muscles: ['forearms'], equipment: 'dumbbell', is_compound: false },
  { name: 'Hammer Curl', name_es: 'Curl martillo', name_el: 'Σφυριά', muscle_group: 'biceps', secondary_muscles: ['forearms'], equipment: 'dumbbell', is_compound: false },
  { name: 'Preacher Curl', name_es: 'Curl predicador', name_el: 'Preacher curl', muscle_group: 'biceps', secondary_muscles: [], equipment: 'barbell', is_compound: false },
  { name: 'Concentration Curl', name_es: 'Curl concentrado', name_el: 'Curl συγκέντρωσης', muscle_group: 'biceps', secondary_muscles: [], equipment: 'dumbbell', is_compound: false },

  // ═══ TRICEPS (5) ═══
  { name: 'Tricep Pushdown', name_es: 'Empuje de tríceps', name_el: 'Πιέσεις τρικέφαλων', muscle_group: 'triceps', secondary_muscles: [], equipment: 'cable', is_compound: false },
  { name: 'Skull Crushers', name_es: 'Rompecráneos', name_el: 'Skull crushers', muscle_group: 'triceps', secondary_muscles: [], equipment: 'barbell', is_compound: false },
  { name: 'Overhead Tricep Extension', name_es: 'Extensión de tríceps sobre cabeza', name_el: 'Εκτάσεις τρικέφαλων πάνω από το κεφάλι', muscle_group: 'triceps', secondary_muscles: [], equipment: 'dumbbell', is_compound: false },
  { name: 'Close-Grip Bench Press', name_es: 'Press de banca agarre cerrado', name_el: 'Πιέσεις στενής λαβής', muscle_group: 'triceps', secondary_muscles: ['chest', 'shoulders'], equipment: 'barbell', is_compound: true },
  { name: 'Cable Curl', name_es: 'Curl con cable', name_el: 'Δικεφαλικές με καλώδιο', muscle_group: 'biceps', secondary_muscles: [], equipment: 'cable', is_compound: false },

  // ═══ CORE (8) ═══
  { name: 'Plank', name_es: 'Plancha', name_el: 'Σανίδα', muscle_group: 'core', secondary_muscles: ['shoulders'], equipment: 'bodyweight', is_compound: false },
  { name: 'Crunches', name_es: 'Abdominales', name_el: 'Κοιλιακοί', muscle_group: 'core', secondary_muscles: [], equipment: 'bodyweight', is_compound: false },
  { name: 'Hanging Leg Raise', name_es: 'Elevación de piernas colgado', name_el: 'Ανεβάσματα ποδιών σε μπάρα', muscle_group: 'core', secondary_muscles: ['forearms'], equipment: 'bodyweight', is_compound: false },
  { name: 'Cable Woodchop', name_es: 'Leñador con cable', name_el: 'Ξυλοκόπος με καλώδιο', muscle_group: 'core', secondary_muscles: ['shoulders'], equipment: 'cable', is_compound: true },
  { name: 'Russian Twist', name_es: 'Giro ruso', name_el: 'Ρωσική στροφή', muscle_group: 'core', secondary_muscles: [], equipment: 'bodyweight', is_compound: false },
  { name: 'Ab Wheel', name_es: 'Rueda abdominal', name_el: 'Ρόδα κοιλιακών', muscle_group: 'core', secondary_muscles: ['shoulders'], equipment: 'bodyweight', is_compound: false },
  { name: 'Dead Bug', name_es: 'Bicho muerto', name_el: 'Νεκρό έντομο', muscle_group: 'core', secondary_muscles: [], equipment: 'bodyweight', is_compound: false },
  { name: 'Pallof Press', name_es: 'Press Pallof', name_el: 'Pallof press', muscle_group: 'core', secondary_muscles: [], equipment: 'cable', is_compound: false },

  // ═══ FULL BODY (5) ═══
  { name: 'Clean and Press', name_es: 'Cargada y press', name_el: 'Clean and press', muscle_group: 'full_body', secondary_muscles: ['shoulders', 'back', 'quads', 'glutes'], equipment: 'barbell', is_compound: true },
  { name: 'Thrusters', name_es: 'Thrusters', name_el: 'Thrusters', muscle_group: 'full_body', secondary_muscles: ['quads', 'shoulders', 'core'], equipment: 'barbell', is_compound: true },
  { name: 'Burpees', name_es: 'Burpees', name_el: 'Burpees', muscle_group: 'full_body', secondary_muscles: ['chest', 'quads', 'core'], equipment: 'bodyweight', is_compound: true },
  { name: 'Kettlebell Swing', name_es: 'Swing con kettlebell', name_el: 'Αιώρηση kettlebell', muscle_group: 'full_body', secondary_muscles: ['glutes', 'hamstrings', 'core', 'shoulders'], equipment: 'dumbbell', is_compound: true },
  { name: 'Battle Ropes', name_es: 'Cuerdas de batalla', name_el: 'Σχοινιά μάχης', muscle_group: 'full_body', secondary_muscles: ['shoulders', 'core', 'forearms'], equipment: 'bodyweight', is_compound: true },

  // ═══ CARDIO (5) ═══
  { name: 'Treadmill Run', name_es: 'Correr en cinta', name_el: 'Τρέξιμο σε διάδρομο', muscle_group: 'cardio', secondary_muscles: ['quads', 'calves', 'hamstrings'], equipment: 'machine', is_compound: true },
  { name: 'Rowing Machine', name_es: 'Máquina de remo', name_el: 'Κωπηλατικό μηχάνημα', muscle_group: 'cardio', secondary_muscles: ['back', 'biceps', 'core'], equipment: 'machine', is_compound: true },
  { name: 'Cycling', name_es: 'Bicicleta', name_el: 'Ποδηλασία', muscle_group: 'cardio', secondary_muscles: ['quads', 'calves'], equipment: 'machine', is_compound: true },
  { name: 'Stair Climber', name_es: 'Escaladora', name_el: 'Αναρρίχηση σκάλας', muscle_group: 'cardio', secondary_muscles: ['quads', 'glutes', 'calves'], equipment: 'machine', is_compound: true },
  { name: 'Jump Rope', name_es: 'Saltar la cuerda', name_el: 'Σχοινάκι', muscle_group: 'cardio', secondary_muscles: ['calves', 'core', 'shoulders'], equipment: 'bodyweight', is_compound: true },

  // ═══ BONUS EXERCISES (to hit 68 = well over minimum) ═══
  { name: 'Incline Dumbbell Press', name_es: 'Press inclinado con mancuernas', name_el: 'Πιέσεις κεκλιμένου με αλτήρες', muscle_group: 'chest', secondary_muscles: ['triceps', 'shoulders'], equipment: 'dumbbell', is_compound: true },
  { name: 'Chin-ups', name_es: 'Dominadas supinas', name_el: 'Έλξεις ανάποδη λαβή', muscle_group: 'back', secondary_muscles: ['biceps'], equipment: 'bodyweight', is_compound: true },
  { name: 'Dumbbell Shoulder Press', name_es: 'Press de hombros con mancuernas', name_el: 'Πιέσεις ώμων με αλτήρες', muscle_group: 'shoulders', secondary_muscles: ['triceps'], equipment: 'dumbbell', is_compound: true },
  { name: 'Front Squat', name_es: 'Sentadilla frontal', name_el: 'Μπροστινό κάθισμα', muscle_group: 'quads', secondary_muscles: ['glutes', 'core'], equipment: 'barbell', is_compound: true },
  { name: 'Sumo Deadlift', name_es: 'Peso muerto sumo', name_el: 'Sumo άρσεις θανάτου', muscle_group: 'hamstrings', secondary_muscles: ['glutes', 'back', 'quads'], equipment: 'barbell', is_compound: true },
  { name: 'Seated Calf Raise', name_es: 'Elevación de gemelos sentado', name_el: 'Καθιστές άρσεις γαμπών', muscle_group: 'calves', secondary_muscles: [], equipment: 'machine', is_compound: false },
  { name: 'Cable Tricep Kickback', name_es: 'Patada de tríceps con cable', name_el: 'Kickback τρικέφαλων με καλώδιο', muscle_group: 'triceps', secondary_muscles: [], equipment: 'cable', is_compound: false },
  { name: 'Incline Curl', name_es: 'Curl inclinado', name_el: 'Κεκλιμένες δικεφαλικές', muscle_group: 'biceps', secondary_muscles: [], equipment: 'dumbbell', is_compound: false },
  { name: 'Wrist Curl', name_es: 'Curl de muñeca', name_el: 'Κάμψη καρπού', muscle_group: 'forearms', secondary_muscles: [], equipment: 'barbell', is_compound: false },
  { name: 'Reverse Wrist Curl', name_es: 'Curl inverso de muñeca', name_el: 'Αντίστροφη κάμψη καρπού', muscle_group: 'forearms', secondary_muscles: [], equipment: 'barbell', is_compound: false },
  { name: 'Farmer Walk', name_es: 'Caminata del granjero', name_el: 'Περπάτημα αγρότη', muscle_group: 'forearms', secondary_muscles: ['core', 'shoulders'], equipment: 'dumbbell', is_compound: true },
  { name: 'Good Morning', name_es: 'Buenos días', name_el: 'Good morning', muscle_group: 'hamstrings', secondary_muscles: ['back', 'glutes'], equipment: 'barbell', is_compound: true },
  { name: 'Glute Bridge', name_es: 'Puente de glúteos', name_el: 'Γέφυρα γλουτών', muscle_group: 'glutes', secondary_muscles: ['hamstrings'], equipment: 'bodyweight', is_compound: false },
  { name: 'Side Plank', name_es: 'Plancha lateral', name_el: 'Πλάγια σανίδα', muscle_group: 'core', secondary_muscles: ['shoulders'], equipment: 'bodyweight', is_compound: false },
  { name: 'Mountain Climbers', name_es: 'Escaladores', name_el: 'Ορειβάτες', muscle_group: 'core', secondary_muscles: ['quads', 'shoulders'], equipment: 'bodyweight', is_compound: true },
  { name: 'Box Jump', name_es: 'Salto al cajón', name_el: 'Πηδήματα σε κουτί', muscle_group: 'quads', secondary_muscles: ['glutes', 'calves'], equipment: 'bodyweight', is_compound: true },
  { name: 'Reverse Lunge', name_es: 'Zancada inversa', name_el: 'Αντίστροφη προβολή', muscle_group: 'quads', secondary_muscles: ['glutes', 'hamstrings'], equipment: 'dumbbell', is_compound: true },
  { name: 'Walking Lunge', name_es: 'Zancada caminando', name_el: 'Περπατώντας προβολή', muscle_group: 'quads', secondary_muscles: ['glutes', 'hamstrings'], equipment: 'dumbbell', is_compound: true },
  { name: 'Dumbbell Pullover', name_es: 'Pullover con mancuerna', name_el: 'Pullover με αλτήρα', muscle_group: 'chest', secondary_muscles: ['back'], equipment: 'dumbbell', is_compound: false },
  { name: 'Machine Lat Pulldown (Close Grip)', name_es: 'Jalón agarre cerrado', name_el: 'Κατεβάσματα στενής λαβής', muscle_group: 'back', secondary_muscles: ['biceps'], equipment: 'cable', is_compound: true },
  { name: 'Pendlay Row', name_es: 'Remo Pendlay', name_el: 'Κωπηλατική Pendlay', muscle_group: 'back', secondary_muscles: ['biceps', 'forearms'], equipment: 'barbell', is_compound: true },
  { name: 'Single-Leg Deadlift', name_es: 'Peso muerto a una pierna', name_el: 'Μονοπόδιες άρσεις θανάτου', muscle_group: 'hamstrings', secondary_muscles: ['glutes', 'core'], equipment: 'dumbbell', is_compound: true },
  { name: 'Leg Press (Single Leg)', name_es: 'Prensa a una pierna', name_el: 'Πρέσα μονού ποδιού', muscle_group: 'quads', secondary_muscles: ['glutes'], equipment: 'machine', is_compound: true },
  { name: 'Cable Face Pull', name_es: 'Face pull con cable', name_el: 'Face pull με καλώδιο', muscle_group: 'shoulders', secondary_muscles: ['back'], equipment: 'cable', is_compound: false },
  { name: 'Dumbbell Shrug', name_es: 'Encogimiento con mancuernas', name_el: 'Σρακ με αλτήρες', muscle_group: 'shoulders', secondary_muscles: ['forearms'], equipment: 'dumbbell', is_compound: false },
  { name: 'Spider Curl', name_es: 'Curl araña', name_el: 'Spider curl', muscle_group: 'biceps', secondary_muscles: [], equipment: 'dumbbell', is_compound: false },
  { name: 'Tricep Dips', name_es: 'Fondos de tríceps', name_el: 'Βυθίσεις τρικέφαλων', muscle_group: 'triceps', secondary_muscles: ['chest', 'shoulders'], equipment: 'bodyweight', is_compound: true },
  { name: 'Diamond Push-ups', name_es: 'Flexiones diamante', name_el: 'Διαμαντένιες κάμψεις', muscle_group: 'triceps', secondary_muscles: ['chest'], equipment: 'bodyweight', is_compound: true },
  { name: 'V-ups', name_es: 'V-ups', name_el: 'V-ups', muscle_group: 'core', secondary_muscles: [], equipment: 'bodyweight', is_compound: false },
  { name: 'Bicycle Crunches', name_es: 'Abdominales bicicleta', name_el: 'Ποδήλατο κοιλιακών', muscle_group: 'core', secondary_muscles: [], equipment: 'bodyweight', is_compound: false },
  { name: 'Turkish Get-up', name_es: 'Levantamiento turco', name_el: 'Τουρκική έγερση', muscle_group: 'full_body', secondary_muscles: ['core', 'shoulders'], equipment: 'dumbbell', is_compound: true },
  { name: 'Sled Push', name_es: 'Empuje de trineo', name_el: 'Ώθηση ελκήθρου', muscle_group: 'full_body', secondary_muscles: ['quads', 'glutes', 'core'], equipment: 'machine', is_compound: true },
  { name: 'Elliptical', name_es: 'Elíptica', name_el: 'Ελλειπτικό', muscle_group: 'cardio', secondary_muscles: ['quads', 'glutes'], equipment: 'machine', is_compound: true },
  { name: 'Swimming', name_es: 'Natación', name_el: 'Κολύμβηση', muscle_group: 'cardio', secondary_muscles: ['back', 'shoulders', 'core'], equipment: 'bodyweight', is_compound: true },
];

async function seed() {
  console.log(`Seeding ${EXERCISES.length} exercises...`);

  // Upsert by name for idempotency
  // First, fetch existing exercises to check for duplicates
  const { data: existing, error: fetchError } = await supabase
    .from('exercises')
    .select('id, name')
    .eq('is_template', true);

  if (fetchError) {
    console.error('Error fetching existing exercises:', fetchError);
    process.exit(1);
  }

  const existingNames = new Set((existing || []).map(e => e.name.toLowerCase()));
  const toInsert = [];
  const toUpdate = [];

  for (const ex of EXERCISES) {
    const row = {
      name: ex.name,
      name_es: ex.name_es || null,
      name_el: ex.name_el || null,
      muscle_group: ex.muscle_group,
      secondary_muscles: ex.secondary_muscles || [],
      equipment: ex.equipment || null,
      is_compound: ex.is_compound || false,
      is_template: true,
      created_by: null,
    };

    if (existingNames.has(ex.name.toLowerCase())) {
      // Find the existing ID and update
      const existingEx = existing.find(e => e.name.toLowerCase() === ex.name.toLowerCase());
      if (existingEx) {
        toUpdate.push({ id: existingEx.id, ...row });
      }
    } else {
      toInsert.push(row);
    }
  }

  // Insert new exercises
  if (toInsert.length > 0) {
    const { error: insertError } = await supabase
      .from('exercises')
      .insert(toInsert);

    if (insertError) {
      console.error('Insert error:', insertError);
      process.exit(1);
    }
    console.log(`Inserted ${toInsert.length} new exercises`);
  } else {
    console.log('No new exercises to insert');
  }

  // Update existing exercises
  let updated = 0;
  for (const row of toUpdate) {
    const { id, ...data } = row;
    const { error: updateError } = await supabase
      .from('exercises')
      .update(data)
      .eq('id', id);

    if (updateError) {
      console.error(`Update error for ${row.name}:`, updateError);
    } else {
      updated++;
    }
  }
  if (updated > 0) {
    console.log(`Updated ${updated} existing exercises`);
  }

  // Final count
  const { count } = await supabase
    .from('exercises')
    .select('*', { count: 'exact', head: true })
    .eq('is_template', true);

  console.log(`Total template exercises in database: ${count}`);
  console.log('Done!');
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
