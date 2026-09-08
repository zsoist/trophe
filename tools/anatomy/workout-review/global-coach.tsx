import { useLayoutEffect, useRef } from 'react';
import { PrivateDraftControls } from './draft-controls';
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
import type { VoiceTranscriptionTransport, ReviewedVoiceTransport } from '../../../components/assistant/voice-client';
import { hasAmbiguousSpokenNumber } from '../../../agents/coach-assistant/voice-ambiguity';
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
      snapshot: { id: crypto.randomUUID(), capturedAt: new Date().toISOString(), subjectId: REVIEW_USER, organizationId: '00000000-0000-4000-8000-000000000002', actorRole: 'client', access: 'self', scopeKey: '0'.repeat(64), surface: request.context?.includeScreen ? request.context.surface : null, screenIncluded: Boolean(request.context?.includeScreen), window, language: lang, units: { weight: 'kg', energy: 'kcal', protein: 'g' }, capabilities: [{ key: 'food_records', status: 'available', reason: 'private_tab_example' }, { key: 'workout_records', status: 'available', reason: 'private_tab_example' }, { key: 'model', status: 'not_connected', reason: 'offline' }, { key: 'profile', status: 'available', reason: 'isolated_fixture' }, { key: 'actions', status: 'available', reason: 'isolated_ephemeral' }] },
      output: { answer: evidence.map(item => item.statement).join('\n') || legacyT('coach_assistant.empty'), evidenceRefs: evidence.map(item => item.id), limitations: [t('global_coach.example')], suggestions: [], escalation: { required: false, reason: null, draft: null } }, evidence,
      profile: { language: lang, timezone: window.timezone, units: { weight: 'kg', energy: 'kcal', protein: 'g' }, preferences: { durationMinutes: preferences.preferences.durationMinutes }, version: preferences.version, source: 'isolated_fixture' },
      memories: preferences.memories, proposals: [], receipts: [], attachments: [],
    };
  };
  /** Explicit UI fixture: its text is not derived from the recorded Blob. */
  const voiceTranscriptionTransport: VoiceTranscriptionTransport = async (_recording, metadata, signal) => {
    signal.throwIfAborted();
    return { version: 'coach-assistant.voice.v1', ok: true, status: 'review_required', scope: { actorId: REVIEW_USER, organizationId: '00000000-0000-4000-8000-000000000002', conversationId: metadata.conversationId }, turnId: metadata.turnId,
      transcript: { text: t('global_coach.voice_example_text'), locale: metadata.locale, languages: [metadata.locale], source: 'synthetic_fixture', trust: 'untrusted_transcript' },
      review: { token: 'offline-ui-fixture', expiresAt: new Date(Date.now() + 60_000).toISOString(), editable: true, audioRetention: 'discarded_after_transcription' }, durationMs: _recording.durationMs };
  };
  const reviewedVoiceTransport: ReviewedVoiceTransport = async (input, signal) => {
    signal.throwIfAborted();
    if (hasAmbiguousSpokenNumber(input.editedText)) return { ok: false, status: 'clarification_required', error: 'ambiguous_number' };
    const response = await transport({ ...input.request, message: input.editedText }, signal);
    return { ok: true, status: 'answered', transcript: { text: input.editedText, locale: input.voice.transcript.locale, languages: input.voice.transcript.languages, source: 'synthetic_fixture', trust: 'untrusted_user_reviewed_data' }, response,
      speech: input.offerSpeech ? { status: 'available_on_request', conversationId: response.conversationId, turnId: response.turnId, textSource: 'validated_final_answer', syntheticVoice: true, autoplay: false, expiresInMs: 60_000, requiresResponseId: true } : null };
  };
  return <GlobalCoach identity={REVIEW_USER} example={transport} preferenceTransport={actionTransport} contextSlot={props => <PrivateDraftControls {...props} />} voiceTranscriptionTransport={voiceTranscriptionTransport} reviewedVoiceTransport={reviewedVoiceTransport} />;
}
