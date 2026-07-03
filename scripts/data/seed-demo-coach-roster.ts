/**
 * Seed: a synthetic "demo coach roster" under the operator's super_admin account so the
 * COACH dashboard is fully populated for a live showcase. Zero real PII, fully reversible.
 *
 * Why this exists: the coach dashboard queries `client_profiles WHERE coach_id = auth.uid()`.
 * The super_admin account has no clients pointed at it, so its coach view is empty. This seeds
 * believable Greek-athlete clients pointed at the operator as coach, with realistic history
 * across every surface (food, water, habits, check-ins, meal plans, messages, measurements,
 * workouts, notes, appointments) — including the surfaces that are otherwise empty in prod
 * (meal plans, messaging, measurements).
 *
 * Modes:
 *   npx tsx scripts/data/seed-demo-coach-roster.ts --dry-run        # print plan, write NOTHING
 *   ALLOW_REMOTE_SEED=1 npx tsx scripts/data/seed-demo-coach-roster.ts            # seed
 *   ALLOW_REMOTE_SEED=1 npx tsx scripts/data/seed-demo-coach-roster.ts --rollback # delete demo roster
 *
 * Safety:
 *   - Additive only. Never touches existing (real) rows.
 *   - Every demo user is tagged: email `demo.<slug>@demo.trophe.app`.
 *   - Created ids are recorded in scripts/data/.demo-roster-manifest.json.
 *   - Rollback deletes exactly those users (explicit ordered child deletes + auth user delete).
 *   - Refuses a non-local Supabase URL unless ALLOW_REMOTE_SEED=1 (this seed targets prod on purpose).
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

// ─── Env loading (scripts run via tsx don't auto-load .env.local) ─────────────
function loadEnvLocal() {
  const p = join(process.cwd(), '.env.local');
  if (!existsSync(p)) return;
  for (const raw of readFileSync(p, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const COACH_EMAIL = 'daniel@reyes.com'; // the super_admin who will showcase the coach dashboard
const EMAIL_DOMAIN = 'demo.trophe.app'; // demo users live here so cleanup is unambiguous
const MANIFEST = join(process.cwd(), 'scripts/data/.demo-roster-manifest.json');
const DAYS = 30;

const MODE = process.argv.includes('--rollback')
  ? 'rollback'
  : process.argv.includes('--dry-run')
    ? 'dry-run'
    : 'seed';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (check .env.local).');
  process.exit(1);
}
const isLocal = /(127\.0\.0\.1|localhost)/.test(SUPABASE_URL);
if (!isLocal && MODE !== 'dry-run' && !process.env.ALLOW_REMOTE_SEED) {
  console.error(`✋ Refusing to ${MODE}: ${SUPABASE_URL} is not local.`);
  console.error('   Set ALLOW_REMOTE_SEED=1 to confirm you intend to write to this project.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Date helpers ────────────────────────────────────────────────────────────
function isoDate(daysBack: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return d.toISOString().split('T')[0];
}
function isoTs(daysBack: number, hour = 9): string {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  d.setHours(hour, Math.floor((hashStr(String(daysBack + hour)) % 60)), 0, 0);
  return d.toISOString();
}
// Deterministic RNG so re-runs / dry-run vs seed produce identical data.
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Nutrition: Mifflin-St Jeor → TDEE → goal-adjusted targets ───────────────
const ACTIVITY_FACTOR: Record<string, number> = {
  sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9,
};
const GOAL_KCAL_DELTA: Record<string, number> = {
  fat_loss: -0.18, muscle_gain: 0.12, maintenance: 0, recomp: -0.05, endurance: 0.05, health: 0,
};
function targets(p: Persona) {
  const s = p.sex === 'male' ? 5 : -161;
  const bmr = 10 * p.weight_kg + 6.25 * p.height_cm - 5 * p.age + s;
  const tdee = bmr * ACTIVITY_FACTOR[p.activity_level];
  const kcal = Math.round(tdee * (1 + GOAL_KCAL_DELTA[p.goal]));
  const protein = Math.round((p.goal === 'muscle_gain' ? 2.0 : p.goal === 'fat_loss' ? 1.9 : 1.7) * p.weight_kg);
  const fat = Math.round((kcal * 0.27) / 9);
  const carbs = Math.round((kcal - protein * 4 - fat * 9) / 4);
  return {
    bmr: Math.round(bmr), tdee: Math.round(tdee),
    target_calories: kcal, target_protein_g: protein, target_carbs_g: carbs,
    target_fat_g: fat, target_fiber_g: Math.round(kcal / 80), target_water_ml: 2500,
  };
}

// ─── Greek / Mediterranean food pools (macros assigned from each meal's share) ─
const FOODS = {
  breakfast: ['Greek yogurt with honey & walnuts', 'Oats with banana & tahini', 'Eggs with feta & tomato', 'Spanakopita slice', 'Whole-grain toast with avocado', 'Strapatsada (eggs & tomato)'],
  lunch: ['Grilled chicken with rice & salad', 'Gigantes (baked giant beans)', 'Souvlaki with pita & tzatziki', 'Lentil soup (fakes) with bread', 'Tuna & quinoa bowl', 'Grilled halloumi with greens'],
  dinner: ['Grilled salmon with potatoes', 'Beef with roasted vegetables', 'Baked cod with horta', 'Chicken with bulgur & veg', 'Moussaka portion', 'Shrimp with orzo (garides giouvetsi)'],
  snack: ['Apple with almonds', 'Protein shake', 'Greek yogurt & berries', 'Rice cakes with peanut butter', 'Handful of walnuts', 'Cottage cheese & honey'],
} as const;

type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
const MEAL_SHARE: Record<MealSlot, number> = { breakfast: 0.25, lunch: 0.35, dinner: 0.3, snack: 0.1 };

function buildDayFood(userId: string, daysBack: number, t: ReturnType<typeof targets>, rng: () => number) {
  const rows: Record<string, unknown>[] = [];
  const dayNoise = 0.9 + rng() * 0.2; // ±10% day-to-day variation
  for (const slot of ['breakfast', 'lunch', 'dinner', 'snack'] as MealSlot[]) {
    const share = MEAL_SHARE[slot] * dayNoise;
    const pool = FOODS[slot];
    const food = pool[Math.floor(rng() * pool.length)];
    rows.push({
      user_id: userId,
      logged_date: isoDate(daysBack),
      meal_type: slot,
      food_name: food,
      quantity: 1,
      unit: 'serving',
      calories: Math.round(t.target_calories * share),
      protein_g: Math.round(t.target_protein_g * share * (slot === 'snack' ? 0.8 : 1.05)),
      carbs_g: Math.round(t.target_carbs_g * share),
      fat_g: Math.round(t.target_fat_g * share),
      fiber_g: Math.round(t.target_fiber_g * share),
      source: rng() < 0.5 ? 'natural_language' : 'usda',
      created_at: isoTs(daysBack, slot === 'breakfast' ? 8 : slot === 'lunch' ? 13 : slot === 'dinner' ? 20 : 16),
    });
  }
  return rows;
}

// ─── Persona archetypes ───────────────────────────────────────────────────────
type Archetype = 'star' | 'wobbler' | 'at_risk' | 'new' | 'cutter' | 'bulker';
type Mood = 'great' | 'good' | 'okay' | 'tough' | 'struggled';

interface Signal {
  adherence: number;        // fraction of days the client logs food (drives the heatmap)
  currentStreak: number;    // consecutive habit check-ins ending at the most recent one
  lastCheckinDaysAgo: number; // recency of last check-in → green/yellow/red signal
  moodPool: Mood[];
}

interface Persona {
  slug: string;
  fullName: string;
  sex: 'male' | 'female';
  age: number;
  height_cm: number;
  weight_kg: number;
  body_fat_pct: number;
  goal: 'fat_loss' | 'muscle_gain' | 'maintenance' | 'recomp' | 'endurance' | 'health';
  activity_level: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
  language: 'en' | 'el';
  archetype: Archetype;
  habitName: string;       // matches a habits.name_en template
  athlete: boolean;        // gets workout sessions
  weightTrendKgPerWeek: number; // measurement trend
  signal: Signal;
}

const PERSONAS: Persona[] = [
  { slug: 'eleni', fullName: 'Eleni Vasilaki', sex: 'female', age: 28, height_cm: 168, weight_kg: 62, body_fat_pct: 22, goal: 'maintenance', activity_level: 'active', language: 'el', archetype: 'star', habitName: 'Eat protein at every meal', athlete: false, weightTrendKgPerWeek: 0, signal: { adherence: 0.95, currentStreak: 16, lastCheckinDaysAgo: 0, moodPool: ['great', 'good', 'great'] } },
  { slug: 'yannis', fullName: 'Yannis Petrou', sex: 'male', age: 35, height_cm: 178, weight_kg: 88, body_fat_pct: 24, goal: 'fat_loss', activity_level: 'moderate', language: 'el', archetype: 'wobbler', habitName: 'Walk 8000+ steps', athlete: false, weightTrendKgPerWeek: -0.3, signal: { adherence: 0.7, currentStreak: 6, lastCheckinDaysAgo: 2, moodPool: ['okay', 'good', 'tough'] } },
  { slug: 'sofia', fullName: 'Sofia Andreou', sex: 'female', age: 41, height_cm: 165, weight_kg: 74, body_fat_pct: 31, goal: 'fat_loss', activity_level: 'light', language: 'el', archetype: 'at_risk', habitName: 'Drink enough water daily', athlete: false, weightTrendKgPerWeek: -0.1, signal: { adherence: 0.45, currentStreak: 1, lastCheckinDaysAgo: 6, moodPool: ['tough', 'struggled', 'okay'] } },
  { slug: 'kostas', fullName: 'Kostas Dimitriou', sex: 'male', age: 24, height_cm: 182, weight_kg: 76, body_fat_pct: 16, goal: 'muscle_gain', activity_level: 'active', language: 'en', archetype: 'new', habitName: 'Sleep 7-9 hours', athlete: true, weightTrendKgPerWeek: 0.2, signal: { adherence: 0.9, currentStreak: 3, lastCheckinDaysAgo: 1, moodPool: ['good', 'great', 'good'] } },
  { slug: 'maria', fullName: 'Maria Nikolaou', sex: 'female', age: 31, height_cm: 171, weight_kg: 64, body_fat_pct: 20, goal: 'recomp', activity_level: 'very_active', language: 'en', archetype: 'cutter', habitName: 'Prepare meals in advance', athlete: true, weightTrendKgPerWeek: -0.4, signal: { adherence: 0.88, currentStreak: 11, lastCheckinDaysAgo: 1, moodPool: ['good', 'great', 'okay'] } },
  { slug: 'dimitris', fullName: 'Dimitris Pappas', sex: 'male', age: 27, height_cm: 185, weight_kg: 90, body_fat_pct: 15, goal: 'muscle_gain', activity_level: 'very_active', language: 'en', archetype: 'bulker', habitName: 'Eat 5 servings of vegetables', athlete: true, weightTrendKgPerWeek: 0.35, signal: { adherence: 0.82, currentStreak: 9, lastCheckinDaysAgo: 3, moodPool: ['good', 'okay', 'good'] } },
];

/**
 * Each archetype's food-logging pattern across the 30-day window. dayIndex 0 = today,
 * DAYS-1 = oldest. This drives the food heatmap, adherence chart, and "days since last
 * activity" gap that the audience reads when opening a client.
 */
function loggedOnDay(persona: Persona, dayIndex: number, rng: () => number): boolean {
  switch (persona.archetype) {
    case 'at_risk':
      return dayIndex >= 5 && rng() < 0.85;                  // solid early, went dark the last 5 days
    case 'new':
      return dayIndex < 4 && rng() < 0.9;                    // only data since onboarding ~4 days ago
    case 'wobbler':
      return dayIndex % 7 < 5 ? rng() < 0.85 : rng() < 0.3;  // weekdays solid, weekend slips
    case 'cutter':
      return dayIndex % 10 !== 4 && rng() < 0.9;             // disciplined, one planned off-day per ~10
    case 'bulker':
      return rng() < 0.82;
    case 'star':
    default:
      return rng() < 0.95;                                   // near-perfect
  }
}

// ─── Per-persona row generation ────────────────────────────────────────────────
function generateForPersona(p: Persona, userId: string, coachId: string, clientHabitId: string, habitId: string, idx: number) {
  const rng = mulberry32(hashStr(p.slug));
  const t = targets(p);
  const out = {
    profile: {
      id: userId, full_name: p.fullName, email: `demo.${p.slug}@${EMAIL_DOMAIN}`,
      role: 'client', language: p.language, timezone: 'Europe/Athens', created_at: isoTs(p.archetype === 'new' ? 4 : 34, 10),
    },
    client_profile: {
      user_id: userId, coach_id: coachId, age: p.age, sex: p.sex, height_cm: p.height_cm,
      weight_kg: p.weight_kg, body_fat_pct: p.body_fat_pct, activity_level: p.activity_level, goal: p.goal,
      ...t, current_habit_id: habitId, coaching_phase: p.archetype === 'new' ? 'onboarding' : 'active',
      goal_title: goalTitle(p), carb_cycling_enabled: p.archetype === 'cutter',
      created_at: isoTs(p.archetype === 'new' ? 4 : 34, 10), updated_at: isoTs(0, 10),
    } as Record<string, unknown>,
    client_habit: {
      id: clientHabitId, client_id: userId, habit_id: habitId, assigned_by: coachId, status: 'active',
      started_at: isoTs(Math.min(DAYS - 1, p.signal.currentStreak + 4), 9), current_streak: p.signal.currentStreak,
      best_streak: Math.max(p.signal.currentStreak, p.signal.currentStreak + 3), total_completions: p.signal.currentStreak + (p.archetype === 'new' ? 0 : 5),
      sequence_number: 1,
    },
    food: [] as Record<string, unknown>[],
    water: [] as Record<string, unknown>[],
    checkins: [] as Record<string, unknown>[],
    measurements: [] as Record<string, unknown>[],
    workouts: [] as Record<string, unknown>[],
    meal_plan: [] as Record<string, unknown>[],
    messages: [] as Record<string, unknown>[],
    notes: [] as Record<string, unknown>[],
    appts: [] as Record<string, unknown>[],
  };

  // Food + water (food-logging pattern is the TODO(human) decision)
  for (let day = 0; day < DAYS; day++) {
    if (!loggedOnDay(p, day, rng)) continue;
    out.food.push(...buildDayFood(userId, day, t, rng));
    out.water.push({ user_id: userId, logged_date: isoDate(day), amount_ml: 500 * (3 + Math.floor(rng() * 3)), created_at: isoTs(day, 18) });
  }

  // Habit check-ins: `currentStreak` consecutive completed days ending at lastCheckinDaysAgo
  for (let i = 0; i < p.signal.currentStreak; i++) {
    const daysBack = p.signal.lastCheckinDaysAgo + i;
    if (daysBack >= DAYS) break;
    out.checkins.push({
      client_habit_id: clientHabitId, user_id: userId, checked_date: isoDate(daysBack), completed: true,
      mood: p.signal.moodPool[i % p.signal.moodPool.length], created_at: isoTs(daysBack, 21),
    });
  }

  // Measurements: weekly weigh-ins trending toward the goal
  for (let w = 4; w >= 0; w--) {
    const daysBack = w * 7;
    out.measurements.push({
      user_id: userId, measured_date: isoDate(daysBack),
      weight_kg: round1(p.weight_kg - p.weightTrendKgPerWeek * (4 - w)),
      body_fat_pct: round1(p.body_fat_pct - (p.weightTrendKgPerWeek < 0 ? 0.3 : -0.1) * (4 - w)),
      waist_cm: round1(80 + p.body_fat_pct * 0.6 - (p.weightTrendKgPerWeek < 0 ? 0.4 : 0) * (4 - w)),
      created_at: isoTs(daysBack, 7),
    });
  }

  // Workouts for athletes: ~3/week
  if (p.athlete) {
    const names = ['Upper body push', 'Lower body strength', 'Pull & core', 'Conditioning / intervals'];
    for (let day = 0; day < DAYS; day++) {
      if (day % 7 === 1 || day % 7 === 3 || day % 7 === 5) {
        out.workouts.push({
          user_id: userId, session_date: isoDate(day), name: names[day % names.length],
          duration_minutes: 45 + Math.floor(rng() * 30), created_at: isoTs(day, 19),
        });
      }
    }
  }

  // Coach-authored 7-day meal plan (the surface that is empty in prod today)
  const slots: { slot: string; pool: readonly string[] }[] = [
    { slot: 'breakfast', pool: FOODS.breakfast }, { slot: 'snack1', pool: FOODS.snack },
    { slot: 'lunch', pool: FOODS.lunch }, { slot: 'snack2', pool: FOODS.snack }, { slot: 'dinner', pool: FOODS.dinner },
  ];
  for (let dow = 0; dow < 7; dow++) {
    for (const { slot, pool } of slots) {
      out.meal_plan.push({
        client_id: userId, coach_id: coachId, day_of_week: dow, meal_slot: slot,
        description: pool[(dow + slot.length) % pool.length], updated_at: isoTs(7, 11),
      });
    }
  }

  // Messages: a short coach↔client thread; latest from client is unread (shows in inbox)
  const thread = messageThread(p);
  thread.forEach((m, i) => {
    out.messages.push({
      coach_id: coachId, client_id: userId, sender_role: m.role, body: m.body,
      read_at: i < thread.length - 1 ? isoTs(thread.length - i, 12) : (m.role === 'client' ? null : isoTs(0, 12)),
      created_at: isoTs(thread.length - i, 12),
    });
  });

  // Coach notes
  out.notes.push({ coach_id: coachId, client_id: userId, note: noteFor(p), session_type: p.archetype === 'new' ? 'general' : 'check_in', created_at: isoTs(p.signal.lastCheckinDaysAgo + 1, 15) });

  // Appointments: one completed (past) + one upcoming (future) → drives booking KPIs.
  // Each persona gets a distinct day/slot so the UNIQUE(coach_id, starts_at) holds.
  out.appts.push({ coach_id: coachId, client_id: userId, starts_at: isoTs(7 + idx * 3, 10), duration_min: 30, kind: 'video', status: 'completed', created_at: isoTs(20, 10) });
  out.appts.push({ coach_id: coachId, client_id: userId, starts_at: futureTs(2 + idx * 2, 11), duration_min: 30, kind: 'video', status: 'booked', created_at: isoTs(3, 10) });

  return out;
}

function round1(n: number) { return Math.round(n * 10) / 10; }
function futureTs(daysAhead: number, hour: number) {
  const d = new Date(); d.setDate(d.getDate() + daysAhead); d.setHours(hour, 0, 0, 0); return d.toISOString();
}
function goalTitle(p: Persona) {
  return ({ fat_loss: 'Lose body fat sustainably', muscle_gain: 'Build lean muscle', maintenance: 'Hold performance & habits', recomp: 'Recomposition', endurance: 'Endurance base', health: 'General health' } as Record<string, string>)[p.goal];
}
function noteFor(p: Persona) {
  return ({
    star: 'Excellent consistency. Ready to progress the habit at next check-in.',
    wobbler: 'Adherence slipping mid-week. Reinforce the step goal, check stress load.',
    at_risk: 'Went quiet ~6 days. Send a low-pressure nudge; reframe around the water habit.',
    new: 'Onboarded this week. Targets set, first habit assigned. Watch first 14-day cycle.',
    cutter: 'Cut going well, weight trending down. Watch recovery on training days.',
    bulker: 'Lean gaining on plan. Keep protein high, monitor digestion with veg habit.',
  } as Record<Archetype, string>)[p.archetype];
}
function messageThread(p: Persona): { role: 'coach' | 'client'; body: string }[] {
  const first = p.fullName.split(' ')[0];
  const threads: Record<Archetype, { role: 'coach' | 'client'; body: string }[]> = {
    star: [
      { role: 'coach', body: `How did the week feel, ${first}?` },
      { role: 'client', body: 'Amazing — protein on point every single day.' },
      { role: 'coach', body: 'You are crushing it. Ready to progress the habit?' },
      { role: 'client', body: 'Streak is at 16 days 💪 what’s next?' },
    ],
    wobbler: [
      { role: 'coach', body: `${first}, noticed a couple of missed days — everything ok?` },
      { role: 'client', body: 'Yeah just busy mid-week, weekends are my weak spot.' },
      { role: 'coach', body: 'Let’s protect the weekends — prep two meals on Friday?' },
    ],
    at_risk: [
      { role: 'coach', body: `${first}, haven’t seen you log in a few days — just checking in 🙂` },
      { role: 'client', body: 'Sorry, work has been brutal and I fell off completely.' },
      { role: 'coach', body: 'No judgment — let’s restart with just the water habit, one day at a time.' },
    ],
    new: [
      { role: 'coach', body: `Welcome aboard, ${first}! Targets are set — shout if anything is unclear.` },
      { role: 'client', body: 'Thanks! Quick question — shake pre or post workout?' },
    ],
    cutter: [
      { role: 'coach', body: `${first}, the cut is looking clean — weight is trending right.` },
      { role: 'client', body: 'Feeling strong on training days, a bit flat on rest days.' },
      { role: 'coach', body: 'Normal on a deficit — let’s bump carbs slightly on rest days.' },
    ],
    bulker: [
      { role: 'coach', body: `${first}, solid lean gaining — protein is high, digestion ok?` },
      { role: 'client', body: 'All good — the veg habit is actually helping a lot.' },
    ],
  };
  return threads[p.archetype];
}

// ─── DB ops ────────────────────────────────────────────────────────────────────
async function resolveCoachId(): Promise<string> {
  const { data, error } = await supabase.from('profiles').select('id, role').eq('email', COACH_EMAIL).maybeSingle();
  if (error || !data) throw new Error(`Could not find coach profile ${COACH_EMAIL}: ${error?.message}`);
  if (data.role !== 'super_admin' && data.role !== 'coach') throw new Error(`${COACH_EMAIL} is role=${data.role}, expected super_admin/coach`);
  return data.id as string;
}
async function resolveHabitId(name: string): Promise<string> {
  const { data, error } = await supabase.from('habits').select('id').eq('name_en', name).limit(1).maybeSingle();
  if (error || !data) throw new Error(`Habit template not found: ${name}`);
  return data.id as string;
}
async function insertBatch(table: string, rows: Record<string, unknown>[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + 500));
    if (error) throw new Error(`insert ${table}: ${error.message}`);
  }
}

async function runSeed(dry: boolean) {
  const coachId = await resolveCoachId();
  console.log(`Coach (showcase account): ${COACH_EMAIL} → ${coachId}`);

  if (!dry && existsSync(MANIFEST)) {
    console.error('✋ Manifest already exists — roster appears seeded. Run --rollback first.');
    process.exit(1);
  }

  const tally: Record<string, number> = {};
  const bump = (k: string, n: number) => (tally[k] = (tally[k] || 0) + n);
  const manifest: { coachId: string; createdAt: string; users: { slug: string; email: string; id: string }[] } = {
    coachId, createdAt: new Date().toISOString(), users: [],
  };
  const buckets: Record<string, Record<string, unknown>[]> = {
    profiles: [], client_profiles: [], client_habits: [], habit_checkins: [], food_log: [],
    water_log: [], measurements: [], workout_sessions: [], meal_plan_entries: [], messages: [], coach_notes: [], appointments: [],
  };

  for (let pi = 0; pi < PERSONAS.length; pi++) {
    const p = PERSONAS[pi];
    const email = `demo.${p.slug}@${EMAIL_DOMAIN}`;
    let userId: string = randomUUID();
    const habitId = await resolveHabitId(p.habitName);
    const clientHabitId = randomUUID();

    if (!dry) {
      const { data, error } = await supabase.auth.admin.createUser({
        email, password: randomUUID() + 'Aa1!', email_confirm: true,
        user_metadata: { full_name: p.fullName, demo_roster: true },
      });
      if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
      userId = data.user.id;
    }
    manifest.users.push({ slug: p.slug, email, id: userId });

    const g = generateForPersona(p, userId, coachId, clientHabitId, habitId, pi);
    buckets.profiles.push(g.profile);
    buckets.client_profiles.push(g.client_profile);
    buckets.client_habits.push(g.client_habit);
    buckets.habit_checkins.push(...g.checkins);
    buckets.food_log.push(...g.food);
    buckets.water_log.push(...g.water);
    buckets.measurements.push(...g.measurements);
    buckets.workout_sessions.push(...g.workouts);
    buckets.meal_plan_entries.push(...g.meal_plan);
    buckets.messages.push(...g.messages);
    buckets.coach_notes.push(...g.notes);
    buckets.appointments.push(...g.appts);

    bump('clients', 1);
    bump('food_log', g.food.length); bump('water_log', g.water.length); bump('habit_checkins', g.checkins.length);
    bump('measurements', g.measurements.length); bump('workout_sessions', g.workouts.length);
    bump('meal_plan_entries', g.meal_plan.length); bump('messages', g.messages.length);
    bump('coach_notes', g.notes.length); bump('appointments', g.appts.length);
    console.log(`  • ${p.fullName.padEnd(22)} ${p.archetype.padEnd(9)} food:${g.food.length} checkins:${g.checkins.length} streak:${p.signal.currentStreak} lastCheckin:${p.signal.lastCheckinDaysAgo}d`);
  }

  console.log('\nPlan summary:', JSON.stringify(tally, null, 0));

  if (dry) {
    console.log('\n🟡 DRY RUN — nothing written. Re-run with ALLOW_REMOTE_SEED=1 (no --dry-run) to apply.');
    return;
  }

  // Insert in FK-safe order: profiles → client_profiles → client_habits → checkins → leaf tables
  await insertBatch('profiles', buckets.profiles);
  await insertBatch('client_profiles', buckets.client_profiles);
  await insertBatch('client_habits', buckets.client_habits);
  await insertBatch('habit_checkins', buckets.habit_checkins);
  for (const t of ['food_log', 'water_log', 'measurements', 'workout_sessions', 'meal_plan_entries', 'messages', 'coach_notes', 'appointments']) {
    await insertBatch(t, buckets[t]);
  }
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  console.log(`\n✅ Seeded ${manifest.users.length} demo clients under ${COACH_EMAIL}. Manifest: ${MANIFEST}`);
}

async function collectDemoIds(): Promise<string[]> {
  const ids = new Set<string>();
  if (existsSync(MANIFEST)) {
    const m = JSON.parse(readFileSync(MANIFEST, 'utf8')) as { users: { id: string }[] };
    for (const u of m.users) ids.add(u.id);
  }
  // Fallback / belt-and-suspenders: find by email tag (covers a partial seed with no manifest)
  const { data } = await supabase.from('profiles').select('id').like('email', `demo.%@${EMAIL_DOMAIN}`);
  for (const r of (data || []) as { id: string }[]) ids.add(r.id);
  return [...ids];
}

async function runRollback() {
  const ids = await collectDemoIds();
  if (ids.length === 0) { console.log('Nothing to roll back (no manifest, no tagged demo users).'); return; }
  console.log(`Rolling back ${ids.length} demo users…`);
  // Explicit ordered child deletes (one FK, habit_checkins.user_id, lacks ON DELETE CASCADE)
  await supabase.from('habit_checkins').delete().in('user_id', ids);
  for (const t of ['food_log', 'water_log', 'measurements', 'workout_sessions', 'coach_notes', 'client_habits']) {
    await supabase.from(t).delete().in(t === 'client_habits' ? 'client_id' : 'user_id', ids);
  }
  await supabase.from('meal_plan_entries').delete().in('client_id', ids);
  await supabase.from('messages').delete().in('client_id', ids);
  await supabase.from('appointments').delete().in('client_id', ids);
  await supabase.from('client_profiles').delete().in('user_id', ids);
  for (const id of ids) { await supabase.auth.admin.deleteUser(id); } // cascades profiles
  if (existsSync(MANIFEST)) { writeFileSync(MANIFEST + '.removed', readFileSync(MANIFEST)); unlinkSync(MANIFEST); }
  console.log('✅ Rollback complete. Demo roster removed.');
}

(async () => {
  console.log(`\n=== Demo Coach Roster — mode: ${MODE} — ${SUPABASE_URL} ===`);
  if (MODE === 'rollback') await runRollback();
  else await runSeed(MODE === 'dry-run');
})().catch((e) => { console.error('\n❌', e.message); process.exit(1); });
