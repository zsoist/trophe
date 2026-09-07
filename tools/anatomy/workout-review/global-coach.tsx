import { useWorkoutWorkspace } from '../../../components/workout/workspace/WorkoutWorkspaceProvider';
import GlobalCoach from '../../../components/assistant/GlobalCoach';
import type { ConversationTransport } from '../../../components/assistant/conversation-state';
import { useGlobalCoachI18n } from '../../../components/assistant/useGlobalCoachI18n';
import { privateCoachTransport } from './coach';
import { exampleFoodRows } from './food-store';
import { REVIEW_USER, reviewData } from './store';
import { useCoachI18n } from '../../../components/workout/coach/useCoachI18n';
import { localToday } from '../../../lib/utils/dates';
export function PrivateGlobalCoach() {
  const workspace = useWorkoutWorkspace();
  const { t, lang } = useGlobalCoachI18n();
  const { t: legacyT } = useCoachI18n();
  const transport: ConversationTransport = async (request, signal) => {
    const food = request.context?.includeScreen && request.context.surface === 'food';
    const legacy = await privateCoachTransport(reviewData, () => workspace.state.draft, legacyT)({ intent: 'today', message: request.message }, signal);
    const day = localToday();
    const window = { start: day, end: day, days: 1, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
    const rows = exampleFoodRows().filter(row => row.logged_date === day);
    const statement = t('global_coach.food_summary', { count: rows.length, protein: rows.reduce((sum, row) => sum + Number(row.protein_g ?? 0), 0) });
    return { ...legacy, version: 'coach-assistant.v2', conversationId: request.conversationId, turnId: request.turnId,
      snapshot: { id: crypto.randomUUID(), capturedAt: new Date().toISOString(), subjectId: REVIEW_USER, organizationId: '00000000-0000-4000-8000-000000000002', surface: request.context?.includeScreen ? request.context.surface : null, screenIncluded: Boolean(request.context?.includeScreen), window, language: lang, units: { weight: 'kg', energy: 'kcal', protein: 'g' }, capabilities: [{ key: 'food_records', status: 'available', reason: 'private_tab_example' }, { key: 'workout_records', status: 'available', reason: 'private_tab_example' }, { key: 'model', status: 'not_connected', reason: 'offline' }] },
      ...(food ? { output: { answer: statement, evidenceRefs: ['example-food'], limitations: [t('global_coach.food_preview')], suggestions: [], escalation: { required: false, reason: null, draft: null } }, evidence: [{ id: 'example-food', source: 'nutrition' as const, sourceIds: rows.map(row => row.id), window, completeness: 'complete' as const, statement, value: rows.length, unit: 'entries' }] } : {}),
      proposals: [], receipts: [], attachments: [],
    };
  };
  return <GlobalCoach identity={REVIEW_USER} example={transport} />;
}
