/**
 * Seed the CLIENT side of daniel@reyes.com: the past 15 days of food + water +
 * an active habit with check-ins + recent measurements, laddered to his existing
 * macro targets. Populates his personal /dashboard view for the showcase.
 *
 * Does NOT touch his auth user, role, or coach assignment — data rows only.
 *
 * Modes:
 *   npx tsx scripts/data/seed-daniel-client.ts --dry-run
 *   ALLOW_REMOTE_SEED=1 npx tsx scripts/data/seed-daniel-client.ts
 *   ALLOW_REMOTE_SEED=1 npx tsx scripts/data/seed-daniel-client.ts --rollback
 *
 * Idempotent: clears his last-15-days food/water (+ the seeded habit) before re-inserting.
 */
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const EMAIL = 'daniel@reyes.com';
const DAYS = 15;
const HABIT_NAME = 'Eat protein at every meal';
const MODE = process.argv.includes('--rollback') ? 'rollback' : process.argv.includes('--dry-run') ? 'dry-run' : 'seed';

if (!SUPABASE_URL || !SERVICE_KEY) { console.error('Missing Supabase env (.env.local).'); process.exit(1); }
const isLocal = /(127\.0\.0\.1|localhost)/.test(SUPABASE_URL);
if (!isLocal && MODE !== 'dry-run' && !process.env.ALLOW_REMOTE_SEED) {
  console.error(`✋ Refusing to ${MODE}: ${SUPABASE_URL} is not local. Set ALLOW_REMOTE_SEED=1 to confirm.`);
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

function isoDate(daysBack: number) { const d = new Date(); d.setDate(d.getDate() - daysBack); return d.toISOString().split('T')[0]; }
function isoTs(daysBack: number, hour: number) { const d = new Date(); d.setDate(d.getDate() - daysBack); d.setHours(hour, (daysBack * 7 + hour) % 60, 0, 0); return d.toISOString(); }
function mulberry32(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Colombian / Mediterranean foods — matches Daniel's profile (Bogotá)
const FOODS = {
  breakfast: ['Huevos pericos con arepa', 'Avena con banano y canela', 'Yogur griego con granola', 'Pan integral con aguacate', 'Calentado paisa liviano'],
  lunch: ['Pechuga a la plancha con arroz y ensalada', 'Ajiaco con pollo', 'Sopa de lentejas con pan', 'Bowl de quinua y atún', 'Frijol con arroz y carne magra'],
  dinner: ['Salmón con verduras al vapor', 'Pollo al horno con papa criolla', 'Pescado con ensalada grande', 'Wrap de pollo y vegetales', 'Sancocho liviano'],
  snack: ['Manzana y almendras', 'Batido de proteína', 'Yogur con fresas', 'Tostadas de arroz con maní', 'Mix de frutos secos'],
};
const MEAL_SHARE = { breakfast: 0.25, lunch: 0.35, dinner: 0.3, snack: 0.1 } as const;

async function resolveDaniel() {
  const { data, error } = await supabase.from('profiles').select('id').eq('email', EMAIL).maybeSingle();
  if (error || !data) throw new Error(`Profile ${EMAIL} not found: ${error?.message}`);
  return data.id as string;
}
async function resolveTargets(userId: string) {
  const { data } = await supabase.from('client_profiles').select('target_calories, target_protein_g, target_carbs_g, target_fat_g, target_fiber_g, target_water_ml')
    .eq('user_id', userId).maybeSingle();
  return {
    target_calories: data?.target_calories ?? 2255, target_protein_g: data?.target_protein_g ?? 82,
    target_carbs_g: data?.target_carbs_g ?? 329, target_fat_g: data?.target_fat_g ?? 68,
    target_fiber_g: data?.target_fiber_g ?? 32, target_water_ml: data?.target_water_ml ?? 2380,
  };
}
async function resolveHabitId() {
  const { data, error } = await supabase.from('habits').select('id').eq('name_en', HABIT_NAME).limit(1).maybeSingle();
  if (error || !data) throw new Error(`Habit not found: ${HABIT_NAME}`);
  return data.id as string;
}
async function insertBatch(table: string, rows: Record<string, unknown>[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + 500));
    if (error) throw new Error(`insert ${table}: ${error.message}`);
  }
}

async function clearRange(userId: string, habitId: string) {
  const from = isoDate(DAYS - 1);
  await supabase.from('food_log').delete().eq('user_id', userId).gte('logged_date', from);
  await supabase.from('water_log').delete().eq('user_id', userId).gte('logged_date', from);
  await supabase.from('client_habits').delete().eq('client_id', userId).eq('habit_id', habitId); // cascades its check-ins
  await supabase.from('measurements').delete().eq('user_id', userId).gte('measured_date', from);
}

async function main() {
  console.log(`\n=== Seed Daniel client side — mode: ${MODE} — ${SUPABASE_URL} ===`);
  const userId = await resolveDaniel();
  const habitId = await resolveHabitId();

  if (MODE === 'rollback') {
    await clearRange(userId, habitId);
    console.log('✅ Rollback complete: last 15 days of food/water, seeded habit, and recent measurements removed.');
    return;
  }

  const t = await resolveTargets(userId);
  const rng = mulberry32(424242);
  const food: Record<string, unknown>[] = [];
  const water: Record<string, unknown>[] = [];
  for (let day = 0; day < DAYS; day++) {
    if (rng() < 0.1 && day > 0) continue; // ~1-2 skipped days for realism (never skip today)
    const dayNoise = 0.9 + rng() * 0.2;
    for (const slot of ['breakfast', 'lunch', 'dinner', 'snack'] as (keyof typeof FOODS)[]) {
      const share = MEAL_SHARE[slot] * dayNoise;
      const pool = FOODS[slot];
      food.push({
        user_id: userId, logged_date: isoDate(day), meal_type: slot, food_name: pool[Math.floor(rng() * pool.length)],
        quantity: 1, unit: 'serving', calories: Math.round(t.target_calories * share),
        protein_g: Math.round(t.target_protein_g * share * (slot === 'snack' ? 0.8 : 1.05)),
        carbs_g: Math.round(t.target_carbs_g * share), fat_g: Math.round(t.target_fat_g * share),
        fiber_g: Math.round(t.target_fiber_g * share), source: rng() < 0.5 ? 'natural_language' : 'usda',
        created_at: isoTs(day, slot === 'breakfast' ? 8 : slot === 'lunch' ? 13 : slot === 'dinner' ? 20 : 16),
      });
    }
    water.push({ user_id: userId, logged_date: isoDate(day), amount_ml: 500 * (4 + Math.floor(rng() * 2)), created_at: isoTs(day, 18) });
  }

  const clientHabitId = randomUUID();
  const clientHabit = { id: clientHabitId, client_id: userId, habit_id: habitId, assigned_by: userId, status: 'active',
    started_at: isoTs(12, 9), current_streak: 10, best_streak: 12, total_completions: 12, sequence_number: 1 };
  const moods = ['good', 'great', 'okay', 'good'];
  const checkins = Array.from({ length: 10 }, (_, i) => ({ client_habit_id: clientHabitId, user_id: userId,
    checked_date: isoDate(i), completed: true, mood: moods[i % moods.length], created_at: isoTs(i, 21) }));
  const measurements = [0, 7, 14].map((d, i) => ({ user_id: userId, measured_date: isoDate(d),
    weight_kg: 68 + i * 0.3, body_fat_pct: 18 - i * 0.2, waist_cm: 82 - i * 0.3, created_at: isoTs(d, 7) }));

  console.log(`Plan: food=${food.length} water=${water.length} checkins=${checkins.length} measurements=${measurements.length} (targets ${t.target_calories}kcal)`);
  if (MODE === 'dry-run') { console.log('🟡 DRY RUN — nothing written.'); return; }

  await clearRange(userId, habitId); // idempotent
  await insertBatch('food_log', food);
  await insertBatch('water_log', water);
  await insertBatch('client_habits', [clientHabit]);
  await insertBatch('habit_checkins', checkins);
  await insertBatch('measurements', measurements);
  await supabase.from('client_profiles').update({ current_habit_id: habitId }).eq('user_id', userId);
  console.log(`✅ Seeded ${DAYS} days of client data for ${EMAIL}.`);
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
