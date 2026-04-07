// ═══════════════════════════════════════════════
// τροφή (Trophē) — Core Type Definitions
// ═══════════════════════════════════════════════

export type Role = 'client' | 'coach' | 'both';
export type Language = 'en' | 'es' | 'el';
export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type Goal = 'fat_loss' | 'muscle_gain' | 'maintenance' | 'recomp' | 'endurance' | 'health';
export type CoachingPhase = 'onboarding' | 'active' | 'maintenance';
export type HabitCategory = 'nutrition' | 'hydration' | 'movement' | 'sleep' | 'mindset' | 'recovery';
export type HabitDifficulty = 'beginner' | 'intermediate' | 'advanced';
export type HabitStatus = 'active' | 'completed' | 'paused' | 'skipped';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'pre_workout' | 'post_workout';
export type FoodSource = 'usda' | 'openfoodfacts' | 'custom' | 'photo_ai';
export type Mood = 'great' | 'good' | 'okay' | 'tough' | 'struggled';
export type SessionType = 'check_in' | 'progression' | 'concern' | 'general';

// ═══════════════════════════════════════════════
// Database Row Types (match Supabase schema)
// ═══════════════════════════════════════════════

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  avatar_url: string | null;
  language: Language;
  timezone: string;
  created_at: string;
}

export interface ClientProfile {
  id: string;
  user_id: string;
  coach_id: string | null;
  age: number | null;
  sex: Sex | null;
  height_cm: number | null;
  weight_kg: number | null;
  body_fat_pct: number | null;
  activity_level: ActivityLevel | null;
  goal: Goal | null;
  bmr: number | null;
  tdee: number | null;
  target_calories: number | null;
  target_protein_g: number | null;
  target_carbs_g: number | null;
  target_fat_g: number | null;
  target_fiber_g: number | null;
  target_water_ml: number | null;
  current_habit_id: string | null;
  carb_cycling_enabled: boolean;
  coaching_phase: CoachingPhase;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Habit {
  id: string;
  created_by: string | null;
  name_en: string;
  name_es: string | null;
  name_el: string | null;
  description_en: string | null;
  description_es: string | null;
  description_el: string | null;
  emoji: string;
  category: HabitCategory | null;
  difficulty: HabitDifficulty;
  target_value: number | null;
  target_unit: string | null;
  cycle_days: number;
  suggested_order: number | null;
  is_template: boolean;
  created_at: string;
}

export interface ClientHabit {
  id: string;
  client_id: string;
  habit_id: string;
  assigned_by: string | null;
  status: HabitStatus;
  started_at: string;
  completed_at: string | null;
  current_streak: number;
  best_streak: number;
  total_completions: number;
  sequence_number: number;
  coach_note: string | null;
  created_at: string;
  // Joined fields
  habit?: Habit;
}

export interface HabitCheckin {
  id: string;
  client_habit_id: string;
  user_id: string;
  checked_date: string;
  completed: boolean;
  value: number | null;
  note: string | null;
  mood: Mood | null;
  created_at: string;
}

export interface FoodLogEntry {
  id: string;
  user_id: string;
  logged_date: string;
  meal_type: MealType | null;
  food_name: string;
  quantity: number;
  unit: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  source: FoodSource | null;
  source_id: string | null;
  photo_url: string | null;
  created_at: string;
}

export interface WaterLogEntry {
  id: string;
  user_id: string;
  logged_date: string;
  amount_ml: number;
  created_at: string;
}

export interface SupplementProtocol {
  id: string;
  coach_id: string | null;
  name: string;
  description: string | null;
  supplements: SupplementItem[];
  goal: string | null;
  created_at: string;
}

export interface SupplementItem {
  name: string;
  dose: string;
  timing: string;
  notes?: string;
  evidence_level?: 'A' | 'B' | 'C' | 'D';
}

export interface ClientSupplement {
  id: string;
  user_id: string;
  protocol_id: string;
  assigned_by: string | null;
  active: boolean;
  created_at: string;
  protocol?: SupplementProtocol;
}

export interface SupplementLogEntry {
  id: string;
  user_id: string;
  supplement_name: string;
  taken: boolean;
  logged_date: string;
  created_at: string;
}

export interface CoachNote {
  id: string;
  coach_id: string;
  client_id: string;
  note: string;
  session_type: SessionType | null;
  created_at: string;
}

export interface CustomFood {
  id: string;
  created_by: string | null;
  name: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  unit: string;
  category: string | null;
  shared: boolean;
  created_at: string;
}

export interface Measurement {
  id: string;
  user_id: string;
  measured_date: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  waist_cm: number | null;
  notes: string | null;
  created_at: string;
}

// ═══════════════════════════════════════════════
// Computed / UI Types
// ═══════════════════════════════════════════════

export interface MacroTargets {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  water_ml: number;
}

export interface DailyMacroSummary {
  date: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  water_ml: number;
  meals: FoodLogEntry[];
}

export interface ClientOverview {
  profile: Profile;
  clientProfile: ClientProfile;
  currentHabit: ClientHabit | null;
  streakStatus: 'on_track' | 'at_risk' | 'inactive';
  lastCheckinDate: string | null;
  daysSinceCheckin: number;
}

// USDA FoodData Central API types
export interface USDAFood {
  fdcId: number;
  description: string;
  foodNutrients: USDANutrient[];
  brandName?: string;
  servingSize?: number;
  servingSizeUnit?: string;
}

export interface USDANutrient {
  nutrientId: number;
  nutrientName: string;
  value: number;
  unitName: string;
}

// ═══════════════════════════════════════════════
// Workout Module Types
// ═══════════════════════════════════════════════

export type MuscleGroup = 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'forearms' | 'quads' | 'hamstrings' | 'glutes' | 'calves' | 'core' | 'full_body' | 'cardio';

export interface Exercise {
  id: string;
  name: string;
  name_es: string | null;
  name_el: string | null;
  muscle_group: MuscleGroup;
  secondary_muscles: string[] | null;
  equipment: string | null;
  is_compound: boolean;
  is_template: boolean;
  created_by: string | null;
  created_at: string;
}

export interface WorkoutSession {
  id: string;
  user_id: string;
  session_date: string;
  name: string | null;
  template_id: string | null;
  duration_minutes: number | null;
  notes: string | null;
  pain_flags: PainFlag[];
  created_at: string;
}

export interface WorkoutSet {
  id: string;
  session_id: string;
  exercise_id: string;
  set_number: number;
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
  is_warmup: boolean;
  is_pr: boolean;
  notes: string | null;
  created_at: string;
  exercise?: Exercise;
}

export interface PainFlag {
  exercise_id: string;
  body_part: string;
  severity: number;
  notes?: string;
}

export interface WorkoutTemplate {
  id: string;
  created_by: string | null;
  name: string;
  description: string | null;
  target_muscles: string[] | null;
  exercises: TemplateExercise[];
  day_label: string | null;
  difficulty: string;
  shared: boolean;
  created_at: string;
}

export interface TemplateExercise {
  exercise_id: string;
  target_sets: number;
  target_reps: string;
  target_rpe?: number;
  notes?: string;
}
