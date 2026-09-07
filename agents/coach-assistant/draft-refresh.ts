import { workoutWorkspaceReducer, type WorkoutWorkspaceState } from '@/lib/workout/workspace-state';
import { coachDraftSchema } from './schema';
import type { CoachActionResult } from './contracts';
import type { PreferencePrimitives } from './preference-store';

/** Pure boundary for the UI owner after explicit review and identity verification.
 * Compares the entire current workspace, including pending request envelopes.
 * Returns a new state; it never writes browser storage or starts a session.
 */
export function reviewDraftRefresh(current:WorkoutWorkspaceState, refresh:NonNullable<CoachActionResult['draftRefresh']>, hash:PreferencePrimitives['hash'], reviewed:boolean, signal?:AbortSignal):
  {ok:true;state:WorkoutWorkspaceState}|{ok:false;error:'cancelled'|'review_required'|'version_conflict'|'invalid_input'} {
  if(signal?.aborted)return {ok:false,error:'cancelled'};
  if(!reviewed)return {ok:false,error:'review_required'};
  if(hash(current)!==refresh.previousVersion)return {ok:false,error:'version_conflict'};
  const draft=coachDraftSchema.safeParse(refresh.draft);
  if(!draft.success)return {ok:false,error:'invalid_input'};
  try {
    const state=workoutWorkspaceReducer(current,{type:'draft.updated',payload:{draft:structuredClone(draft.data)}});
    if(hash(state)!==refresh.version)return {ok:false,error:'invalid_input'};
    return {ok:true,state};
  } catch { return {ok:false,error:'version_conflict'}; }
}
