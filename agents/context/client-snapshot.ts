/**
 * Live client snapshot — the structured context block behind every coach
 * AI interaction (P5 of the master plan).
 *
 * Memory chunks and RAG capture *narratives*; this captures *state*: who the
 * client is right now, what they actually logged, how their body is trending.
 * Assembled fresh per request from the source tables — never cached, so the
 * AI can never reason from stale numbers.
 */

import { db } from '@/db/client';
import { sql } from 'drizzle-orm';

export interface ClientSnapshot {
  systemPromptBlock: string;
}

const fmt = (n: number | null | undefined, digits = 0): string =>
  n == null ? '—' : n.toFixed(digits);

export async function buildClientSnapshot(clientId: string): Promise<ClientSnapshot> {
  const [profileRes, intakeRes, foodRes, signalsRes, weightRes, habitRes] = await Promise.all([
    db.execute<{
      full_name: string; age: number | null; sex: string | null; goal: string | null;
      goal_title: string | null; goal_metric: string | null; goal_window: string | null;
      assessment: string | null; coaching_phase: string | null; stabilization: boolean | null;
      target_calories: number | null; target_protein_g: number | null;
      target_carbs_g: number | null; target_fat_g: number | null;
    }>(sql`
      SELECT p.full_name, cp.age, cp.sex, cp.goal, cp.goal_title, cp.goal_metric,
             cp.goal_window, cp.assessment, cp.coaching_phase, cp.stabilization,
             cp.target_calories, cp.target_protein_g, cp.target_carbs_g, cp.target_fat_g
      FROM profiles p LEFT JOIN client_profiles cp ON cp.user_id = p.id
      WHERE p.id = ${clientId}`),
    db.execute<{ prompt: string; answer: string }>(sql`
      SELECT qq.prompt, qr.answers ->> qq.id::text AS answer
      FROM questionnaire_responses qr
      JOIN questionnaire_questions qq ON qq.questionnaire_id = qr.questionnaire_id
      WHERE qr.client_id = ${clientId} AND qr.submitted_at IS NOT NULL
        AND coalesce(qr.answers ->> qq.id::text, '') != ''
      ORDER BY qq.position`),
    db.execute<{ days_logged: number; avg_kcal: number | null; avg_p: number | null; avg_c: number | null; avg_f: number | null }>(sql`
      SELECT count(DISTINCT logged_date)::int AS days_logged,
             sum(calories)::float / nullif(count(DISTINCT logged_date), 0) AS avg_kcal,
             sum(protein_g)::float / nullif(count(DISTINCT logged_date), 0) AS avg_p,
             sum(carbs_g)::float / nullif(count(DISTINCT logged_date), 0) AS avg_c,
             sum(fat_g)::float / nullif(count(DISTINCT logged_date), 0) AS avg_f
      FROM food_log WHERE user_id = ${clientId} AND logged_date >= CURRENT_DATE - 14`),
    db.execute<{ days: number; bowel_ok: number; sleep_ok: number; water_ok: number; avg_energy: number | null }>(sql`
      SELECT count(*)::int AS days,
             count(*) FILTER (WHERE bowel_movement)::int AS bowel_ok,
             count(*) FILTER (WHERE slept_8h)::int AS sleep_ok,
             count(*) FILTER (WHERE water_ok)::int AS water_ok,
             avg(energy)::float AS avg_energy
      FROM daily_checkins WHERE user_id = ${clientId} AND checked_date >= CURRENT_DATE - 7`),
    db.execute<{ first_w: number | null; last_w: number | null; n: number }>(sql`
      SELECT (array_agg(weight_kg ORDER BY measured_date ASC))[1]::float AS first_w,
             (array_agg(weight_kg ORDER BY measured_date DESC))[1]::float AS last_w,
             count(*)::int AS n
      FROM measurements
      WHERE user_id = ${clientId} AND measured_date >= CURRENT_DATE - 30 AND weight_kg IS NOT NULL`),
    db.execute<{ name_en: string; current_streak: number }>(sql`
      SELECT h.name_en, ch.current_streak
      FROM client_habits ch JOIN habits h ON h.id = ch.habit_id
      WHERE ch.client_id = ${clientId} AND ch.status = 'active'
      ORDER BY ch.sequence_number LIMIT 1`),
  ]);

  const p = profileRes.rows[0];
  if (!p) return { systemPromptBlock: '' };

  const lines: string[] = ['CLIENT SNAPSHOT (live data, assembled now):'];
  lines.push(
    `- ${p.full_name}${p.age ? `, ${p.age}` : ''}${p.sex ? `, ${p.sex}` : ''} · phase: ${p.coaching_phase ?? '—'}${p.stabilization ? ' · deliberate stabilization phase' : ''}`
  );
  if (p.goal_title || p.goal) {
    lines.push(`- Goal: ${p.goal_title ?? p.goal}${p.goal_metric ? ` (${p.goal_metric})` : ''}${p.goal_window ? ` over ${p.goal_window}` : ''}`);
  }
  if (p.target_calories) {
    lines.push(`- Targets: ${p.target_calories} kcal · P${fmt(p.target_protein_g)} C${fmt(p.target_carbs_g)} F${fmt(p.target_fat_g)}`);
  }
  if (p.assessment?.trim()) lines.push(`- Coach assessment notes: ${p.assessment.trim().slice(0, 600)}`);

  const f = foodRes.rows[0];
  if (f && f.days_logged > 0) {
    lines.push(
      `- Last 14 days: logged ${f.days_logged}/14 days · avg ${fmt(f.avg_kcal)} kcal (P${fmt(f.avg_p)} C${fmt(f.avg_c)} F${fmt(f.avg_f)})${p.target_calories && f.avg_kcal ? ` · ${f.avg_kcal > p.target_calories ? '+' : ''}${fmt(f.avg_kcal - p.target_calories)} vs target` : ''}`
    );
  } else {
    lines.push('- Last 14 days: no food logs');
  }

  const sig = signalsRes.rows[0];
  if (sig && sig.days > 0) {
    lines.push(
      `- Daily signals (7d, ${sig.days} check-ins): digestion OK ${sig.bowel_ok}/${sig.days} · slept 8h ${sig.sleep_ok}/${sig.days} · water OK ${sig.water_ok}/${sig.days}${sig.avg_energy ? ` · energy ${fmt(sig.avg_energy, 1)}/5` : ''}`
    );
  }

  const w = weightRes.rows[0];
  if (w && w.n >= 2 && w.first_w != null && w.last_w != null) {
    const delta = w.last_w - w.first_w;
    lines.push(`- Weight (30d, ${w.n} measurements): ${fmt(w.first_w, 1)} → ${fmt(w.last_w, 1)} kg (${delta >= 0 ? '+' : ''}${fmt(delta, 1)} kg)`);
  }

  const h = habitRes.rows[0];
  if (h) lines.push(`- Active habit: "${h.name_en}" · streak ${h.current_streak}d`);

  const intakeAnswers = intakeRes.rows;
  if (intakeAnswers.length > 0) {
    lines.push('- Intake interview (client\'s own words):');
    for (const row of intakeAnswers.slice(0, 12)) {
      lines.push(`    Q: ${row.prompt}\n    A: ${row.answer.slice(0, 300)}`);
    }
  }

  return { systemPromptBlock: lines.join('\n') };
}
