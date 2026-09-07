import type { CoachReceipt } from './contracts';

/** A persisted single-set correction. Selection is resolved before proposing. */
export interface WorkoutSetValues {
 sessionId:string;exerciseId:string;setNumber:number;reps:number|null;weightKg:number|null;
 rpe:number|null;isWarmup:boolean|null;isPr:boolean|null;
}
export interface WorkoutSetSnapshot extends WorkoutSetValues {setId:string;version:string}
export interface WorkoutSetProposal {
 id:string;hash:string;action:'workout.set.reps.update';resource:{kind:'workout_set';id:string;version:string};
 before:WorkoutSetValues;after:WorkoutSetValues;precondition:string;expiresAt:string;reviewRequired:true;
}
interface Base {version:'coach-assistant.v2';conversationId:string;turnId:string;clientId?:string}
export type WorkoutSetOperation=Base&(
 {operation:'set.resolve';sessionId:string;exerciseId:string}|
 {operation:'set.read';setId:string}|
 {operation:'set.propose';setId:string;resourceVersion:string;after:{reps:number}}|
 {operation:'set.apply';setId:string;proposalId:string;hash:string;actionId:string;resourceVersion:string;reviewed:true}|
 {operation:'set.receipt';setId:string;actionId:string}
);
export interface WorkoutSetRefresh {setId:string;sessionId:string;exerciseId:string;previousVersion:string;version:string;strategy:'refetch'}
export type WorkoutSetResult={version:'coach-assistant.v2';storage:'database'}&(
 {ok:false;error:'invalid_input'|'forbidden'|'not_found'|'ambiguous_selection'|'version_conflict'|'expired'|'idempotency_conflict'|'cancelled'|'uncertain'}|
 {ok:true;snapshot:WorkoutSetSnapshot}|
 {ok:true;proposal:WorkoutSetProposal}|
 {ok:true;receipt:CoachReceipt;refresh?:WorkoutSetRefresh}
);
