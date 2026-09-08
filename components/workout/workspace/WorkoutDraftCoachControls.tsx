'use client';

import { useEffect, useRef, useState } from 'react';
import type { CoachContextSlot } from '@/components/assistant/GlobalCoach';
import { useGlobalCoachI18n } from '@/components/assistant/useGlobalCoachI18n';
import { reviewDraftRefresh } from '@/agents/coach-assistant/draft-refresh';
import { hashWorkoutWorkspace } from '@/lib/workout/workspace-hash';
import type { WorkoutDraft } from '@/lib/workout/workspace-state';
import { useWorkoutWorkspace } from './WorkoutWorkspaceProvider';
import styles from '@/components/assistant/GlobalCoach.module.css';

type Props = Parameters<CoachContextSlot>[0] & { identity: string; allowDirectProposal?: boolean };

function DraftSnapshot({ label, draft }: { label: string; draft: WorkoutDraft }) {
  return <section aria-label={label}>
    <h4>{label}</h4>
    <p>{draft.name}</p>
    {draft.kind === 'strength' ? <ul>{draft.exercises.map((exercise, index) => <li key={`${exercise.exerciseId}:${index}`}>
      {exercise.exerciseName ?? exercise.exerciseId} · {exercise.targetSets} × {exercise.targetReps}
      {exercise.restSeconds !== undefined ? ` · ${exercise.restSeconds}s rest` : ''}
      {exercise.targetRpe !== undefined && exercise.targetRpe !== null ? ` · RPE ${exercise.targetRpe}` : ''}
    </li>)}</ul> : <p>{draft.activity} · {draft.durationMinutes} min{draft.distanceKm !== null ? ` · ${draft.distanceKm} km` : ''}{draft.effort !== null ? ` · effort ${draft.effort}` : ''}</p>}
  </section>;
}

/** Reviews an Ask Trophē draft proposal against the exact live Workout workspace. */
export function WorkoutDraftCoachControls({ identity, controller, state, conversationId, transport, allowDirectProposal = false }: Props) {
  const workspace = useWorkoutWorkspace();
  const { t } = useGlobalCoachI18n();
  const draft = workspace.state.draft;
  const version = hashWorkoutWorkspace(workspace.state);
  const [choice, setChoice] = useState<{ version: string; name: string; sets: number | null } | null>(null);
  const name = choice?.version === version ? choice.name : draft?.name ?? '';
  const sets = choice?.version === version ? choice.sets : null;
  const proposal = state.proposal?.action === 'draft.update' ? state.proposal : null;
  const refresh = proposal ? state.draftRefresh : null;
  const applied = Boolean(refresh && state.receipt?.status === 'applied' && version === refresh.version);
  const stale = Boolean(proposal && !applied && version !== proposal.resource.version);
  const editable = Boolean(draft && (workspace.state.stage === 'draft' || workspace.state.stage === 'review') && !workspace.state.startRequest && !workspace.state.retrospectiveRequest);
  const reviewRef = useRef<HTMLElement>(null);
  const receiptRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!refresh || state.receipt?.status !== 'applied' || applied || stale || !workspace.ready) return;
    const result = reviewDraftRefresh(workspace.state, refresh, hashWorkoutWorkspace, true);
    if (result.ok && result.state.draft) workspace.applyReviewedDraft(identity, workspace.state, result.state.draft);
  }, [applied, identity, refresh, stale, state.receipt, workspace]);
  useEffect(() => {
    if (applied) receiptRef.current?.focus();
    else if (proposal) reviewRef.current?.focus();
  }, [applied, proposal]);

  if (!proposal && (!draft || !allowDirectProposal)) return null;
  const locked = state.pending || state.uncertain;
  return <div className={styles.profileBody}>
    <h3>{t('global_coach.draft_title')}</h3>
    <p>{t('global_coach.draft_private')}</p>
    {allowDirectProposal && editable && draft && !proposal && <form onSubmit={event => {
      event.preventDefault();
      if (!draft) return;
      const after = { ...structuredClone(draft), name: name.trim(), updatedAt: Date.now() };
      if (after.kind === 'strength' && sets !== null) after.exercises = after.exercises.map(exercise => ({ ...exercise, targetSets: sets }));
      void controller.proposeDraft(conversationId, version, after, transport);
    }}>
      <label htmlFor="coach-draft-name">{t('global_coach.draft_name')}</label>
      <input id="coach-draft-name" maxLength={120} value={name} disabled={locked} onChange={event => setChoice({ version, name: event.target.value, sets })} />
      {draft.kind === 'strength' && draft.exercises.length > 0 && <>
        <label htmlFor="coach-draft-sets">{t('global_coach.draft_sets')}</label>
        <select id="coach-draft-sets" value={sets ?? ''} disabled={locked} onChange={event => setChoice({ version, name, sets: event.target.value ? Number(event.target.value) : null })}>
          <option value="">{t('global_coach.draft_keep_sets')}</option>
          {[1, 2, 3, 4, 5, 6].map(value => <option key={value} value={value}>{value}</option>)}
        </select>
      </>}
      <button type="submit" disabled={locked || !name.trim() || (name.trim() === draft.name && (sets === null || draft.kind !== 'strength' || draft.exercises.every(exercise => exercise.targetSets === sets)))}>{t('global_coach.draft_review')}</button>
    </form>}
    {!editable && !proposal && <p>{t('global_coach.draft_unavailable')}</p>}
    {proposal && <section ref={reviewRef} tabIndex={-1} className={styles.proposal} aria-label={t('global_coach.draft_review')}>
      {proposal.draftReview && <>
        <p>{t('global_coach.draft_origin')}</p>
        <DraftSnapshot label={t('global_coach.before')} draft={proposal.draftReview.before} />
        <DraftSnapshot label={t('global_coach.after')} draft={proposal.draftReview.after} />
        {proposal.draftReview.after.kind === 'strength' && <p>{t('global_coach.draft_impact')}: {proposal.draftReview.after.exercises.map((exercise, index) => {
          const before = proposal.draftReview!.before;
          const prior = before.kind === 'strength' ? before.exercises[index] : null;
          return `${exercise.exerciseName ?? exercise.exerciseId} ${t('global_coach.draft_set_change', { before: prior?.targetSets ?? 0, after: exercise.targetSets })}`;
        }).join(' · ')}</p>}
      </>}
      {applied ? <p ref={receiptRef} role="status" tabIndex={-1}>{t('global_coach.draft_applied')}</p>
        : state.uncertain ? <div role="status"><p>{t('global_coach.uncertain')}</p><button type="button" disabled={state.pending} onClick={() => void controller.check(transport)}>{t('global_coach.check_status')}</button></div>
        : stale || state.error ? <p role="status">{t('global_coach.draft_stale')}</p>
        : state.receipt?.status !== 'applied' && <button type="button" disabled={locked} onClick={() => void controller.apply(conversationId, transport)}>{t('global_coach.confirm_change')}</button>}
      {state.pending && <p role="status">{t('global_coach.preference_pending')}</p>}
      <button type="button" disabled={locked} onClick={() => controller.dismiss()}>{t(applied ? 'global_coach.draft_done' : 'general.cancel')}</button>
    </section>}
  </div>;
}
