import { useLayoutEffect, useRef } from 'react';
import { PrivateDraftControls } from './draft-controls';
import { PrivateVoiceReview } from './voice-review';
import type { PreferenceTransport } from '../../../components/assistant/preference-state';
import { useWorkoutWorkspace } from '../../../components/workout/workspace/WorkoutWorkspaceProvider';
import GlobalCoach from '../../../components/assistant/GlobalCoach';
import type { ConversationTransport } from '../../../components/assistant/conversation-state';
import { selectConversationScope, evidenceMatchesScope } from '../../../agents/coach-assistant/conversation-scope';
import { useGlobalCoachI18n } from '../../../components/assistant/useGlobalCoachI18n';
import { privateCoachTransport } from './coach';
import { exampleFoodRows } from './food-store';
import { REVIEW_USER, reviewData } from './store';
import { privatePreferences, privatePreferenceTransport } from './preferences';
import { useCoachI18n } from '../../../components/workout/coach/useCoachI18n';
import { localToday, localDateStr } from '../../../lib/utils/dates';
export function PrivateGlobalCoach() {
  const workspace = useWorkoutWorkspace();
  const currentWorkspace = useRef(workspace);
  useLayoutEffect(() => { currentWorkspace.current = workspace; }, [workspace]);
  const actionTransport: PreferenceTransport = async (operation, signal) => {
    signal.throwIfAborted();
    const current = currentWorkspace.current;
    if (!current.ready) return { version: 'coach-assistant.v2', ok: false, storage: 'isolated_ephemeral', error: 'forbidden' };
    const bound = privatePreferences().bindWorkspace(REVIEW_USER, REVIEW_USER, current.state);
    if (!bound.ok) return bound;
    return privatePreferenceTransport(operation, signal);
  };
  const { t, lang } = useGlobalCoachI18n();
  const { t: legacyT } = useCoachI18n();
  const transport: ConversationTransport = async (request, signal) => {
    const selection = selectConversationScope(request);
    const legacy = await privateCoachTransport(reviewData, () => workspace.state.draft, legacyT)({ intent: selection.intent, message: request.message }, signal);
    const day = localToday();
    const startDate = new Date(); if (selection.intent === 'week') startDate.setDate(startDate.getDate() - 6);
    const window = { start: localDateStr(startDate), end: day, days: selection.intent === 'week' ? 7 : 1, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
    const rows = exampleFoodRows().filter(row => row.logged_date >= window.start && row.logged_date <= window.end);
    const statement = t('global_coach.food_summary', { count: rows.length, protein: rows.reduce((sum, row) => sum + Number(row.protein_g ?? 0), 0) });
    const evidence = [...legacy.evidence, { id: 'example-food', source: 'nutrition' as const, sourceIds: rows.map(row => row.id), window, completeness: 'complete' as const, statement, value: rows.length, unit: 'entries' }].filter(item => evidenceMatchesScope(item.source, selection.domain));
    const preferences = privatePreferences().read(REVIEW_USER, REVIEW_USER)!;
    return { ...legacy, version: 'coach-assistant.v2', conversationId: request.conversationId, turnId: request.turnId,
      snapshot: { id: crypto.randomUUID(), capturedAt: new Date().toISOString(), subjectId: REVIEW_USER, organizationId: '00000000-0000-4000-8000-000000000002', surface: request.context?.includeScreen ? request.context.surface : null, screenIncluded: Boolean(request.context?.includeScreen), window, language: lang, units: { weight: 'kg', energy: 'kcal', protein: 'g' }, capabilities: [{ key: 'food_records', status: 'available', reason: 'private_tab_example' }, { key: 'workout_records', status: 'available', reason: 'private_tab_example' }, { key: 'model', status: 'not_connected', reason: 'offline' }, { key: 'profile', status: 'available', reason: 'isolated_fixture' }, { key: 'actions', status: 'available', reason: 'isolated_ephemeral' }] },
      output: { answer: evidence.map(item => item.statement).join('\n') || legacyT('coach_assistant.empty'), evidenceRefs: evidence.map(item => item.id), limitations: [t('global_coach.example')], suggestions: [], escalation: { required: false, reason: null, draft: null } }, evidence,
      profile: { language: lang, timezone: window.timezone, units: { weight: 'kg', energy: 'kcal', protein: 'g' }, preferences: { durationMinutes: preferences.preferences.durationMinutes }, version: preferences.version, source: 'isolated_fixture' },
      memories: preferences.memories, proposals: [], receipts: [], attachments: [],
    };
  };
  return <GlobalCoach identity={REVIEW_USER} example={transport} preferenceTransport={actionTransport} contextSlot={props => <PrivateDraftControls {...props} />} voiceSlot={props => <PrivateVoiceReview {...props} />} />;
}
