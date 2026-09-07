import type { CoachResponse } from '../../../agents/coach-assistant/contracts';
import type { CoachTransport } from '../../../components/workout/coach/WorkoutCoachEntry';
import type { WorkoutDraft } from '../../../lib/workout/workspace-state';
import { localDateStr, localToday } from '../../../lib/utils/dates';
import type { ReviewData } from './store';

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** Export-only, deterministic tab data. No API, account reads or model transport. */
export function privateCoachTransport(getData: () => ReviewData, getDraft: () => WorkoutDraft | null, t: Translate, offeredExerciseCount = 0): CoachTransport {
  return async (request, signal): Promise<CoachResponse> => {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const data = getData();
    const end = localToday();
    const startDate = new Date();
    if (request.intent === 'week') startDate.setDate(startDate.getDate() - 6);
    const start = localDateStr(startDate);
    const window = { start, end, days: request.intent === 'week' ? 7 : 1, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
    const sessions = data.sessions.filter(item => item.completed_at && item.session_date >= start && item.session_date <= end);
    const ids = new Set(sessions.map(item => item.id));
    const sets = data.sets.filter(item => ids.has(item.session_id) && !item.is_warmup && (item.reps ?? 0) > 0);
    const draft = getDraft();
    const exerciseCount = draft ? (draft.kind === 'strength' ? draft.exercises.length : 0) : data.scenario === 'plan' ? offeredExerciseCount : 0;
    const plan = request.intent === 'plan';
    const available = plan ? exerciseCount > 0 : sessions.length > 0;
    const statement = available
      ? t(plan ? 'coach_assistant.sample_plan' : request.intent === 'week' ? 'coach_assistant.sample_week' : 'coach_assistant.sample_day', { count: exerciseCount, sessions: sessions.length, sets: sets.length })
      : t('coach_assistant.empty');
    return {
      version: 'coach-assistant.v1', ok: true, mode: 'offline', dataSource: 'synthetic',
      output: { answer: statement, evidenceRefs: available ? ['private-tab-summary'] : [], limitations: [t('coach_assistant.sample_limit')], suggestions: [], escalation: { required: false, reason: null, draft: null } },
      evidence: available ? [{ id: 'private-tab-summary', source: plan ? 'plan' : 'workout', sourceIds: plan ? [] : sessions.map(item => item.id), window, completeness: 'complete', statement, value: plan ? exerciseCount : sets.length, unit: plan ? 'exercises' : 'sets' }] : [],
      telemetry: { model: null, provider: null, promptVersion: 'private-tab-summary.v1', modelCalls: 0, dataReads: 0, tokensIn: 0, tokensOut: 0, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, latencyMs: 0, costUsd: 0, pricingVersion: 'no-provider' },
    };
  };
}
