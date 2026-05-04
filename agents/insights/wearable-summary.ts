/**
 * Trophē v0.3 — Wearable summary agent (Phase 6).
 *
 * Uses Sonnet 4.5 (per memory_extract policy — mid cost, medium latency)
 * to synthesize the last 7 days of HRV, sleep, and training load data
 * into a concise coaching insight block for the coach dashboard.
 *
 * Output injected into:
 *   1. Coach insight agent system prompt (coaches reading client overview)
 *   2. /coach/client/[id] page "Wearable Insights" card
 *
 * Data pulled:
 *   - HRV (last 7 days) — trend, average, lowest
 *   - Sleep (last 7 days) — total minutes, efficiency, stage breakdown
 *   - Workout (last 7 days) — sessions, duration, load
 *   - Readiness (last 7 days) — recovery scores (Whoop/Oura)
 *
 * Cost estimate: ~$0.003 per call (800 tokens in + 300 out at Sonnet rates)
 */

import { db } from '@/db/client';
import { wearableData } from '@/db/schema/wearable_data';
import { eq, and, gte, inArray, desc } from 'drizzle-orm';
import { callAnthropicMessages } from '@/agents/clients/anthropic';
import { taskPolicies } from '@/agents/router/policies';

// ── Types ──────────────────────────────────────────────────────────────────

export interface WearableSummaryInput {
  userId: string;
  /** How many days of history to include. Default: 7. */
  days?: number;
}

export interface WearableSummaryResult {
  /** Formatted markdown for coach dashboard. Empty if insufficient data. */
  summaryMarkdown: string;
  /** Plain text version for system prompt injection. */
  systemPromptBlock: string;
  /** Whether there was enough data to generate a summary. */
  hasData: boolean;
  /** Raw data counts for telemetry. */
  dataCounts: {
    hrv: number;
    sleep: number;
    workout: number;
    readiness: number;
    steps: number;
  };
}

// ── Data aggregation ───────────────────────────────────────────────────────

interface DailySummary {
  date: string;
  hrv_rmssd?: number;
  sleep_minutes?: number;
  sleep_stages?: Record<string, number>;
  workout_minutes?: number;
  workout_sport?: string;
  readiness_score?: number;
  steps?: number;
  resting_hr?: number;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function fetchLastNDays(userId: string, days: number): Promise<DailySummary[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const rows = await db
    .select()
    .from(wearableData)
    .where(
      and(
        eq(wearableData.userId, userId),
        gte(wearableData.recordedAt, since),
        inArray(wearableData.dataType, ['hrv', 'sleep', 'workout', 'readiness', 'steps', 'heart_rate']),
      ),
    )
    .orderBy(desc(wearableData.recordedAt));

  // Aggregate by date
  const byDate = new Map<string, DailySummary>();

  for (const row of rows) {
    const date = formatDate(new Date(row.recordedAt));
    const existing = byDate.get(date) ?? { date };

    if (row.dataType === 'hrv' && row.valueNumeric) {
      existing.hrv_rmssd = row.valueNumeric;
    } else if (row.dataType === 'sleep') {
      existing.sleep_minutes = row.valueNumeric ?? undefined;
      const stages = (row.valueJsonb as Record<string, unknown> | null)?.stages;
      if (stages && typeof stages === 'object') {
        existing.sleep_stages = stages as Record<string, number>;
      }
    } else if (row.dataType === 'workout') {
      existing.workout_minutes = row.valueNumeric ?? undefined;
      const sport = (row.valueJsonb as Record<string, unknown> | null)?.sport;
      if (typeof sport === 'string') existing.workout_sport = sport;
    } else if (row.dataType === 'readiness' && row.valueNumeric) {
      existing.readiness_score = row.valueNumeric;
    } else if (row.dataType === 'steps' && row.valueNumeric) {
      existing.steps = row.valueNumeric;
    } else if (row.dataType === 'heart_rate' && row.valueNumeric) {
      existing.resting_hr = row.valueNumeric;
    }

    byDate.set(date, existing);
  }

  return Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date));
}

// ── System prompt ──────────────────────────────────────────────────────────

const WEARABLE_SYSTEM = `You are a sports science and recovery expert analyzing wearable data for a nutrition coach.

Given 7 days of wearable metrics, write a concise coaching insight (150-200 words) covering:
1. Recovery status (HRV trend, readiness scores)
2. Sleep quality and consistency
3. Training load and volume
4. Key recommendations for the coach (1-2 actionable points)

Format as plain text. Be specific (cite actual numbers). Use coaching language, not medical language.
Avoid hedging. If data is insufficient for a dimension, skip it gracefully.`;

// ── Main export ────────────────────────────────────────────────────────────

export async function generateWearableSummary(
  input: WearableSummaryInput,
): Promise<WearableSummaryResult> {
  const { userId, days = 7 } = input;

  // ── Fetch data ─────────────────────────────────────────────────────────
  const summaries = await fetchLastNDays(userId, days);

  const dataCounts = {
    hrv: summaries.filter((s) => s.hrv_rmssd !== undefined).length,
    sleep: summaries.filter((s) => s.sleep_minutes !== undefined).length,
    workout: summaries.filter((s) => s.workout_minutes !== undefined).length,
    readiness: summaries.filter((s) => s.readiness_score !== undefined).length,
    steps: summaries.filter((s) => s.steps !== undefined).length,
  };

  const totalDataPoints = Object.values(dataCounts).reduce((a, b) => a + b, 0);

  if (totalDataPoints < 3) {
    return {
      summaryMarkdown: '',
      systemPromptBlock: '',
      hasData: false,
      dataCounts,
    };
  }

  // ── Format data for LLM ────────────────────────────────────────────────
  const lines = summaries.slice(0, days).map((s) => {
    const parts: string[] = [`${s.date}:`];
    if (s.hrv_rmssd) parts.push(`HRV ${s.hrv_rmssd.toFixed(0)}ms`);
    if (s.resting_hr) parts.push(`RHR ${s.resting_hr.toFixed(0)}bpm`);
    if (s.sleep_minutes) parts.push(`sleep ${(s.sleep_minutes / 60).toFixed(1)}h`);
    if (s.readiness_score) parts.push(`readiness ${s.readiness_score.toFixed(0)}/100`);
    if (s.workout_minutes) {
      parts.push(`workout ${s.workout_minutes.toFixed(0)}min${s.workout_sport ? ` (${s.workout_sport})` : ''}`);
    }
    if (s.steps) parts.push(`${s.steps.toFixed(0)} steps`);
    return parts.join(' | ');
  });

  const dataPrompt = `Last ${days} days of wearable data:\n${lines.join('\n')}`;

  // ── LLM synthesis ──────────────────────────────────────────────────────
  const policy = taskPolicies.coach_insight; // Sonnet 4.5 for nuanced coaching language
  const llmResult = await callAnthropicMessages({
    model: policy.model,
    system: WEARABLE_SYSTEM,
    userMessage: dataPrompt,
    maxTokens: 350,
    cacheSystem: policy.cacheSystem,
  });

  if (!llmResult.text || llmResult.rawError) {
    return {
      summaryMarkdown: '',
      systemPromptBlock: '',
      hasData: true,
      dataCounts,
    };
  }

  const summaryMarkdown = llmResult.text.trim();
  const systemPromptBlock = [
    '## Wearable Data Summary (last 7 days)',
    '',
    summaryMarkdown,
    '',
    '---',
    '',
  ].join('\n');

  return { summaryMarkdown, systemPromptBlock, hasData: true, dataCounts };
}
