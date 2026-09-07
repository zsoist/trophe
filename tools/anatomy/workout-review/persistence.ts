/** Private export boundary: actual workout state machine, browser-only records. */
import type * as Runtime from '../../../components/workout/workout-persistence';
import { localToday } from '../../../lib/utils/dates';
import { reviewData, updateReview, REVIEW_USER, type ReviewSession } from './store';
export * from '../../../components/workout/workout-persistence';

const session = (id: string) => reviewData().sessions.find(item => item.id === id);
function patchSession(id: string, patch: Partial<ReviewSession>) {
  updateReview(data => ({ ...data, sessions: data.sessions.map(item => item.id === id ? { ...item, ...patch } : item) }));
}
export const startWorkoutSessionAtomic: typeof Runtime.startWorkoutSessionAtomic = async input => {
  const existing = reviewData().sessions.find(item => item.requestId === input.idempotencyKey);
  if (existing) return { ok: true, sessionId: existing.id };
  const id = crypto.randomUUID();
  const record: ReviewSession = { id, user_id: REVIEW_USER, requestId: input.idempotencyKey, session_date: input.sessionDate, name: input.name, template_id: input.templateId ?? null, workout_kind: input.kind, duration_minutes: null, notes: null, pain_flags: [], completed_at: null, created_at: new Date().toISOString(), structure: input.liveStructure, version: 0 };
  updateReview(data => ({ ...data, sessions: [record, ...data.sessions] }));
  return { ok: true, sessionId: id };
};
export const loadWorkoutSessionStructure: typeof Runtime.loadWorkoutSessionStructure = async id => {
  const record = session(id);
  if (!record) return { ok: false, reason: 'missing' };
  return record.completed_at ? { ok: true, terminal: true, completedAt: record.completed_at, durationMinutes: record.duration_minutes } : { ok: true, terminal: false, version: record.version, structure: record.structure };
};
export const updateLiveWorkoutStructureAtomic: typeof Runtime.updateLiveWorkoutStructureAtomic = async (id, version, structure, removeId) => {
  const record = session(id);
  if (!record || record.completed_at || record.version !== version) return { ok: false };
  updateReview(data => ({ ...data, sessions: data.sessions.map(item => item.id === id ? { ...item, structure, version: version + 1 } : item), sets: data.sets.filter(item => !(item.session_id === id && item.exercise_id === removeId)) }));
  return { ok: true, version: version + 1, structure };
};
export const saveLiveWorkoutSetAtomicResult: typeof Runtime.saveLiveWorkoutSetAtomicResult = async input => {
  const record = session(input.sessionId);
  if (!record || record.completed_at) return { ok: false, kind: 'rejected', code: 'session_closed' };
  const prior = reviewData().sets.find(set => set.session_id === input.sessionId && set.exercise_id === input.exerciseId && set.set_number === input.setNumber);
  const id = prior?.id ?? crypto.randomUUID();
  const set = { id, session_id: input.sessionId, exercise_id: input.exerciseId, set_number: input.setNumber, weight_kg: input.weightKg, reps: input.reps, rpe: input.rpe, is_warmup: input.isWarmup, is_pr: input.isPr, superset_group: input.supersetGroup, notes: null, created_at: new Date().toISOString() };
  updateReview(data => ({ ...data, sets: [...data.sets.filter(item => item.id !== id), set] }));
  return { ok: true, setId: id };
};
export const saveLiveWorkoutSetAtomic: typeof Runtime.saveLiveWorkoutSetAtomic = async input => {
  const result = await saveLiveWorkoutSetAtomicResult(input); return result.ok ? result.setId : null;
};
export const loadWorkoutSessionSets: typeof Runtime.loadWorkoutSessionSets = async id => ({ ok: true, sets: reviewData().sets.filter(item => item.session_id === id) });
export const deleteLiveWorkoutSetAtomic: typeof Runtime.deleteLiveWorkoutSetAtomic = async (id, setId) => {
  if (!session(id) || session(id)?.completed_at) return false;
  updateReview(data => ({ ...data, sets: data.sets.filter(item => !(item.session_id === id && item.id === setId)) })); return true;
};
export const deleteEmptyWorkoutSession: typeof Runtime.deleteEmptyWorkoutSession = async id => {
  if (session(id)?.completed_at || reviewData().sets.some(item => item.session_id === id)) return false;
  updateReview(data => ({ ...data, sessions: data.sessions.filter(item => item.id !== id) })); return true;
};
export const finishLiveWorkoutSessionAtomic: typeof Runtime.finishLiveWorkoutSessionAtomic = async (id, input) => {
  const record = session(id);
  if (!record || (record.workout_kind !== 'cardio' && !reviewData().sets.some(item => item.session_id === id))) return false;
  patchSession(id, { name: input.name, duration_minutes: input.durationMinutes, completed_at: record.completed_at ?? new Date().toISOString(), ...(input.cardio ? { cardio_activity: input.cardio.activity as ReviewSession['cardio_activity'], cardio_distance_km: input.cardio.distanceKm, cardio_effort: input.cardio.effort } : {}) }); return true;
};
export const loadWorkoutSessionPainFlags: typeof Runtime.loadWorkoutSessionPainFlags = async id => ({ ok: true, flags: session(id)?.pain_flags ?? [] });
export const appendWorkoutSessionPainFlag: typeof Runtime.appendWorkoutSessionPainFlag = async (id, _mutation, flag) => {
  const record = session(id); if (!record || record.completed_at) return { ok: false };
  const flags = [...record.pain_flags, flag]; patchSession(id, { pain_flags: flags }); return { ok: true, flags };
};
export const loadPrMap: typeof Runtime.loadPrMap = async (_user, ids) => Object.fromEntries(ids.map(id => [id, Math.max(0, ...reviewData().sets.filter(set => set.exercise_id === id && !set.is_warmup).map(set => set.weight_kg ?? 0))]));
export const saveRetrospectiveWorkoutAtomic: typeof Runtime.saveRetrospectiveWorkoutAtomic = async input => {
  const created = await startWorkoutSessionAtomic({ ...input, draftFingerprint: input.idempotencyKey, sessionDate: input.sessionDate ?? localToday(), liveStructure: [] });
  if (!created.ok) return null;
  const id = created.sessionId;
  if (!session(id)?.completed_at) {
    updateReview(data => ({ ...data, sets: [...data.sets, ...input.sets.map(set => ({ ...set, id: crypto.randomUUID(), session_id: id, notes: null, created_at: new Date().toISOString() }))] }));
    patchSession(id, { duration_minutes: input.durationMinutes, pain_flags: input.painFlags, completed_at: new Date().toISOString(), cardio_activity: input.activity as ReviewSession['cardio_activity'], cardio_distance_km: input.distanceKm, cardio_effort: input.effort });
  }
  return id;
};
