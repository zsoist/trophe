-- Expand the template exercise library (~63 popular movements across all 13
-- muscle groups). Idempotent: each row is only inserted when no existing
-- template exercise shares its (case-insensitive) name, so re-running is safe.
-- All rows are templates (is_template=true, created_by=NULL) → visible to every
-- user via the exercises RLS "all users see templates" policy.

INSERT INTO exercises (name, name_es, name_el, muscle_group, secondary_muscles, equipment, is_compound, is_template)
SELECT v.name, v.name_es, v.name_el, v.muscle_group, v.secondary_muscles::text[], v.equipment, v.is_compound, true
FROM (VALUES
  -- Chest
  ('Floor Press', 'Press en el suelo', 'Πιέσεις στο πάτωμα', 'chest', '{triceps,shoulders}', 'barbell', true),
  ('Incline Cable Fly', 'Aperturas inclinadas en polea', 'Ανοίγματα σε επικλινή με τροχαλία', 'chest', '{shoulders}', 'cable', false),
  ('Smith Machine Bench Press', 'Press de banca en multipower', 'Πιέσεις πάγκου σε Smith', 'chest', '{triceps,shoulders}', 'machine', true),
  ('Machine Incline Press', 'Press inclinado en máquina', 'Πιέσεις επικλινές σε μηχάνημα', 'chest', '{shoulders,triceps}', 'machine', true),
  ('Svend Press', 'Press Svend', 'Πιέσεις Svend', 'chest', '{shoulders}', 'bodyweight', false),
  -- Back
  ('Meadows Row', 'Remo Meadows', 'Κωπηλατική Meadows', 'back', '{biceps,shoulders}', 'barbell', true),
  ('Inverted Row', 'Remo invertido', 'Ανάποδη κωπηλατική', 'back', '{biceps}', 'bodyweight', true),
  ('Snatch-Grip Deadlift', 'Peso muerto agarre ancho', 'Άρσεις θανάτου με φαρδύ πιάσιμο', 'back', '{hamstrings,glutes}', 'barbell', true),
  ('Single-Arm Lat Pulldown', 'Jalón a una mano', 'Έλξεις τροχαλίας με ένα χέρι', 'back', '{biceps}', 'cable', false),
  ('Wide-Grip Pull-up', 'Dominadas agarre ancho', 'Έλξεις με φαρδύ πιάσιμο', 'back', '{biceps,shoulders}', 'bodyweight', true),
  -- Shoulders
  ('Machine Shoulder Press', 'Press de hombros en máquina', 'Πιέσεις ώμων σε μηχάνημα', 'shoulders', '{triceps}', 'machine', true),
  ('Reverse Pec Deck', 'Pec deck invertido', 'Ανάποδο pec deck', 'shoulders', '{back}', 'machine', false),
  ('Cable Y-Raise', 'Elevación en Y en polea', 'Άρσεις σε σχήμα Υ με τροχαλία', 'shoulders', '{back}', 'cable', false),
  ('Plate Front Raise', 'Elevación frontal con disco', 'Μετωπικές άρσεις με δίσκο', 'shoulders', '{}', 'bodyweight', false),
  ('Behind-the-Neck Press', 'Press tras nuca', 'Πιέσεις πίσω από τον αυχένα', 'shoulders', '{triceps}', 'barbell', true),
  -- Biceps
  ('EZ-Bar Curl', 'Curl con barra Z', 'Κάμψεις με μπάρα EZ', 'biceps', '{forearms}', 'barbell', false),
  ('Zottman Curl', 'Curl Zottman', 'Κάμψεις Zottman', 'biceps', '{forearms}', 'dumbbell', false),
  ('Cable Rope Hammer Curl', 'Curl martillo en polea con cuerda', 'Σφυριές με σχοινί σε τροχαλία', 'biceps', '{forearms}', 'cable', false),
  ('Bayesian Cable Curl', 'Curl bayesiano en polea', 'Κάμψεις Bayesian με τροχαλία', 'biceps', '{}', 'cable', false),
  -- Triceps
  ('Rope Pushdown', 'Extensión en polea con cuerda', 'Εκτάσεις τρικεφάλων με σχοινί', 'triceps', '{}', 'cable', false),
  ('Overhead Cable Extension', 'Extensión de tríceps en polea sobre cabeza', 'Εκτάσεις τρικεφάλων πάνω από το κεφάλι', 'triceps', '{}', 'cable', false),
  ('Dumbbell Kickback', 'Patada de tríceps con mancuerna', 'Οπίσθιες εκτάσεις με αλτήρα', 'triceps', '{}', 'dumbbell', false),
  ('JM Press', 'Press JM', 'Πιέσεις JM', 'triceps', '{chest}', 'barbell', true),
  ('Bench Dip', 'Fondos en banco', 'Βυθίσεις σε πάγκο', 'triceps', '{shoulders}', 'bodyweight', false),
  -- Forearms
  ('Reverse Barbell Curl', 'Curl invertido con barra', 'Ανάποδες κάμψεις με μπάρα', 'forearms', '{biceps}', 'barbell', false),
  ('Wrist Roller', 'Enrollador de muñeca', 'Ρολό καρπού', 'forearms', '{}', 'cable', false),
  ('Plate Pinch', 'Pinza con discos', 'Λαβή δίσκου', 'forearms', '{}', 'bodyweight', false),
  -- Quads
  ('Smith Machine Squat', 'Sentadilla en multipower', 'Καθίσματα σε Smith', 'quads', '{glutes,hamstrings}', 'machine', true),
  ('Sissy Squat', 'Sentadilla sissy', 'Sissy καθίσματα', 'quads', '{}', 'bodyweight', false),
  ('Pendulum Squat', 'Sentadilla péndulo', 'Καθίσματα εκκρεμούς', 'quads', '{glutes}', 'machine', true),
  ('Belt Squat', 'Sentadilla con cinturón', 'Καθίσματα με ζώνη', 'quads', '{glutes}', 'machine', true),
  ('Landmine Squat', 'Sentadilla landmine', 'Καθίσματα landmine', 'quads', '{glutes,core}', 'barbell', true),
  -- Hamstrings
  ('Seated Leg Curl', 'Curl femoral sentado', 'Κάμψεις ποδιών καθιστός', 'hamstrings', '{}', 'machine', false),
  ('Nordic Curl', 'Curl nórdico', 'Nordic κάμψεις', 'hamstrings', '{glutes}', 'bodyweight', false),
  ('Stiff-Leg Deadlift', 'Peso muerto piernas rígidas', 'Άρσεις θανάτου με τεντωμένα πόδια', 'hamstrings', '{glutes,back}', 'barbell', true),
  ('Cable Pull-Through', 'Pull-through en polea', 'Pull-through με τροχαλία', 'hamstrings', '{glutes}', 'cable', false),
  -- Glutes
  ('Cable Kickback', 'Patada de glúteo en polea', 'Οπίσθιες κλωτσιές με τροχαλία', 'glutes', '{hamstrings}', 'cable', false),
  ('Frog Pump', 'Frog pump', 'Frog pump', 'glutes', '{}', 'bodyweight', false),
  ('Hip Abduction Machine', 'Máquina de abductores', 'Μηχάνημα απαγωγής ισχίου', 'glutes', '{}', 'machine', false),
  ('Curtsy Lunge', 'Zancada curtsy', 'Curtsy προβολές', 'glutes', '{quads}', 'bodyweight', false),
  ('Single-Leg Hip Thrust', 'Empuje de cadera a una pierna', 'Hip thrust με ένα πόδι', 'glutes', '{hamstrings}', 'bodyweight', false),
  -- Calves
  ('Standing Calf Raise Machine', 'Elevación de gemelos de pie en máquina', 'Άρσεις γάμπας όρθιος σε μηχάνημα', 'calves', '{}', 'machine', false),
  ('Leg Press Calf Raise', 'Elevación de gemelos en prensa', 'Άρσεις γάμπας σε πρέσα', 'calves', '{}', 'machine', false),
  ('Donkey Calf Raise', 'Elevación de gemelos burro', 'Άρσεις γάμπας donkey', 'calves', '{}', 'bodyweight', false),
  -- Core
  ('Cable Crunch', 'Crunch en polea', 'Κοιλιακοί με τροχαλία', 'core', '{}', 'cable', false),
  ('Toes-to-Bar', 'Pies a la barra', 'Πόδια στη μπάρα', 'core', '{back}', 'bodyweight', false),
  ('Hollow Hold', 'Hollow hold', 'Hollow hold', 'core', '{}', 'bodyweight', false),
  ('Weighted Sit-up', 'Abdominal con peso', 'Κοιλιακοί με βάρος', 'core', '{}', 'bodyweight', false),
  ('Reverse Crunch', 'Crunch invertido', 'Ανάποδοι κοιλιακοί', 'core', '{}', 'bodyweight', false),
  -- Full body
  ('Devil Press', 'Devil press', 'Devil press', 'full_body', '{shoulders,quads}', 'dumbbell', true),
  ('Wall Ball', 'Wall ball', 'Wall ball', 'full_body', '{quads,shoulders}', 'bodyweight', true),
  ('Power Clean', 'Cargada de potencia', 'Power clean', 'full_body', '{back,quads,shoulders}', 'barbell', true),
  ('Man Maker', 'Man maker', 'Man maker', 'full_body', '{chest,back,shoulders}', 'dumbbell', true),
  -- Cardio
  ('Assault Bike', 'Bici de asalto', 'Assault bike', 'cardio', '{}', 'machine', false),
  ('Incline Walk', 'Caminata inclinada', 'Περπάτημα σε κλίση', 'cardio', '{}', 'machine', false),
  ('Sprint Intervals', 'Intervalos de sprint', 'Διαλειμματικά σπριντ', 'cardio', '{}', 'bodyweight', false),
  ('Ski Erg', 'Ski erg', 'Ski erg', 'cardio', '{back}', 'machine', false),
  ('Sled Drag', 'Arrastre de trineo', 'Έλξη έλκηθρου', 'cardio', '{hamstrings}', 'machine', false)
) AS v(name, name_es, name_el, muscle_group, secondary_muscles, equipment, is_compound)
WHERE NOT EXISTS (
  SELECT 1 FROM exercises e WHERE lower(e.name) = lower(v.name) AND e.is_template = true
);
