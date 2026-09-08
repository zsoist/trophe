import { createHash,randomUUID } from 'node:crypto';
import { and,eq,sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { db } from '@/db/client';
import { workoutSets } from '@/db/schema/workouts';
import { applyWorkoutSetRepsEdit,parseWorkoutSetRepsChange,type WorkoutSetRow } from '@/lib/workout/set-edit-service';
import { workoutSetOperationSchema,workoutSetProposalSchema,workoutSetResultSchema,workoutSetValuesSchema,type WorkoutSetService } from './set-actions';
import type { WorkoutSetResult,WorkoutSetProposal,WorkoutSetRefresh } from './set-contracts';
import type { CoachReceipt } from './contracts';

type Database=typeof db;
type Transaction=Parameters<Parameters<Database['transaction']>[0]>[0];
type Scope={actorId:string;subjectId:string;organizationId:string;signal:AbortSignal};
const action='workout.set.reps.update';
const fail=(error:Extract<WorkoutSetResult,{ok:false}>['error']):WorkoutSetResult=>({version:'coach-assistant.v2',storage:'database',ok:false,error});
class Rejected extends Error {constructor(readonly reason:Extract<WorkoutSetResult,{ok:false}>['error']){super(reason);}}
const envelopeSchema=z.object({proposal:workoutSetProposalSchema}).strict();
function canonical(value:unknown):string {
  if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
  if(value!==null&&typeof value==='object')return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function digest(value:unknown){return createHash('sha256').update(canonical(value)).digest('hex');}
function values(row:WorkoutSetRow,exerciseName:string){return workoutSetValuesSchema.parse({sessionId:row.sessionId,exerciseId:row.exerciseId,exerciseName,setNumber:row.setNumber,reps:row.reps,weightKg:row.weightKg,rpe:row.rpe,isWarmup:row.isWarmup,isPr:row.isPr});}
async function authorize(tx:Transaction,scope:Scope) {
  scope.signal.throwIfAborted();
  const found=await tx.execute(sql`SELECT actor.id FROM public.profiles actor
    JOIN public.client_profiles cp ON cp.user_id=actor.id
    JOIN public.organization_members member ON member.user_id=actor.id
    WHERE actor.id=${scope.actorId}::uuid AND actor.id=${scope.subjectId}::uuid
      AND actor.role::text='client' AND member.role::text='client' AND member.org_id=${scope.organizationId}::uuid
    FOR SHARE OF actor,cp,member`);
  if(found.rows.length!==1)throw new Rejected('forbidden');
  scope.signal.throwIfAborted();
}
async function version(tx:Transaction,setId:string) {
  const result=await tx.execute<{revision:string}>(sql`SELECT revision::text FROM private.coach_workout_set_versions WHERE set_id=${setId}::uuid`);
  if(result.rows.length!==1)throw new Rejected('uncertain');
  return result.rows[0].revision;
}

/** Concrete transaction service. Requires AG1's isolated schema extension before
 * connection: the SAME action ledger plus set revisions, never a new ledger.
 * No production migration or HTTP enablement is performed by this factory.
 */
export function createWorkoutSetService(database:Database):WorkoutSetService {
  return {parseRepsChange:parseWorkoutSetRepsChange,async execute(scope) {
    const parsed=workoutSetOperationSchema.safeParse(scope.operation);
    if(!parsed.success)return fail('invalid_input');
    const operation=parsed.data;
    if(scope.actorId!==scope.subjectId||(operation.clientId??scope.actorId)!==scope.subjectId)return fail('forbidden');
    try {
      if(operation.operation==='set.propose')parseWorkoutSetRepsChange(operation.after);
      return await database.transaction(async tx=>{
        await tx.execute(sql`SET LOCAL statement_timeout='5000ms'`);
        if(operation.operation==='set.apply'||operation.operation==='set.receipt')await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${scope.actorId+':'+operation.actionId},0))`);
        await authorize(tx,scope);
        if(operation.operation==='set.apply'||operation.operation==='set.receipt') {
          const prior=await tx.execute<{subject_id:string;organization_id:string;conversation_id:string;proposal_id:string;request_hash:string;resource_version:string;action:string;envelope:unknown;result:unknown}>(sql`
            SELECT r.subject_id,r.organization_id,r.conversation_id,r.proposal_id,r.request_hash,r.resource_version,r.result,p.action,p.envelope
            FROM private.coach_action_receipts r JOIN private.coach_action_proposals p ON p.id=r.proposal_id AND p.actor_id=r.actor_id AND p.subject_id=r.subject_id AND p.organization_id=r.organization_id AND p.conversation_id=r.conversation_id
            WHERE r.actor_id=${scope.actorId}::uuid AND r.action_id=${operation.actionId}::uuid`);
          if(prior.rows.length) {
            const stored=prior.rows[0];const envelope=envelopeSchema.safeParse(stored.envelope);
            if(stored.action!==action||!envelope.success||envelope.data.proposal.resource.id!==operation.setId||stored.subject_id!==scope.subjectId||stored.organization_id!==scope.organizationId||stored.conversation_id!==operation.conversationId||(operation.operation==='set.apply'&&(stored.proposal_id!==operation.proposalId||stored.request_hash!==operation.hash||stored.resource_version!==operation.resourceVersion)))throw new Rejected('idempotency_conflict');
            const result=workoutSetResultSchema.safeParse(stored.result);
            if(!result.success||!result.data.ok||!('receipt' in result.data)||result.data.receipt.actionId!==operation.actionId||result.data.receipt.proposalId!==stored.proposal_id)throw new Rejected('uncertain');
            scope.signal.throwIfAborted();return result.data;
          }
          if(operation.operation==='set.receipt')return fail('not_found');
        }
        // Lock the owner session before the set, matching existing Workout RPC ordering.
        const session=await tx.execute<{id:string;completed_at:string|null;created_at?:string|null}>(operation.operation==='set.resolve'&&!operation.sessionId
          ? sql`SELECT s.id,s.completed_at,s.created_at::text AS created_at FROM public.workout_sessions s WHERE s.user_id=${scope.subjectId}::uuid AND s.completed_at IS NULL ORDER BY s.created_at DESC NULLS FIRST LIMIT 2 FOR UPDATE`
          : operation.operation==='set.resolve'
            ? sql`SELECT s.id,s.completed_at FROM public.workout_sessions s WHERE s.id=${operation.sessionId}::uuid AND s.user_id=${scope.subjectId}::uuid FOR UPDATE`
            : sql`SELECT s.id,s.completed_at FROM public.workout_sessions s JOIN public.workout_sets ws ON ws.session_id=s.id WHERE ws.id=${operation.setId}::uuid AND s.user_id=${scope.subjectId}::uuid FOR UPDATE OF s`);
        if(!session.rows.length)throw new Rejected('not_found');
        if(operation.operation==='set.resolve'&&!operation.sessionId&&(session.rows.length!==1||!session.rows[0].created_at))throw new Rejected('ambiguous_selection');
        if(operation.operation!=='set.resolve'||operation.sessionId)if(session.rows.length!==1)throw new Rejected('not_found');
        if(session.rows[0].completed_at!==null)throw new Rejected('session_completed');
        let setId:string;
        if(operation.operation==='set.resolve'){
          const candidates=await tx.execute<{id:string;created_at:string|null}>(operation.exerciseId
            ? sql`SELECT id,created_at::text FROM public.workout_sets WHERE session_id=${session.rows[0].id}::uuid AND exercise_id=${operation.exerciseId}::uuid ORDER BY created_at DESC NULLS FIRST LIMIT 2 FOR UPDATE`
            : sql`SELECT id,created_at::text FROM public.workout_sets WHERE session_id=${session.rows[0].id}::uuid ORDER BY created_at DESC NULLS FIRST LIMIT 2 FOR UPDATE`);
          if(!candidates.rows.length)throw new Rejected('not_found');
          if(!candidates.rows[0].created_at||(candidates.rows.length>1&&candidates.rows[0].created_at===candidates.rows[1].created_at))throw new Rejected('ambiguous_selection');
          setId=candidates.rows[0].id;
        }else setId=operation.setId;
        const [existing]=await tx.select().from(workoutSets).where(and(eq(workoutSets.id,setId),eq(workoutSets.sessionId,session.rows[0].id))).limit(1).for('update');
        if(!existing)throw new Rejected('not_found');
        const label=await tx.execute<{name:string}>(sql`SELECT name FROM public.exercises WHERE id=${existing.exerciseId}::uuid`);
        if(label.rows.length!==1)throw new Rejected('uncertain');
        const currentVersion=await version(tx,setId);
        const before=values(existing,label.rows[0].name);
        if(operation.operation==='set.read'||operation.operation==='set.resolve') {scope.signal.throwIfAborted();return {version:'coach-assistant.v2',storage:'database',ok:true,snapshot:{...before,setId,version:currentVersion}} as WorkoutSetResult;}
        if(operation.operation==='set.propose') {
          if(currentVersion!==operation.resourceVersion)throw new Rejected('version_conflict');
          if(before.reps===operation.after.reps)throw new Rejected('invalid_input');
          const count=await tx.execute<{count:string}>(sql`SELECT count(*)::text FROM private.coach_action_proposals WHERE actor_id=${scope.actorId}::uuid AND expires_at>now()`);
          if(Number(count.rows[0].count)>=128)throw new Rejected('uncertain');
          const after=values({...existing,...parseWorkoutSetRepsChange(operation.after)},label.rows[0].name);
          const clock=await tx.execute<{expires:string}>(sql`SELECT (clock_timestamp()+interval '5 minutes')::text AS expires`);
          const proposal:WorkoutSetProposal={id:randomUUID(),hash:'',action,resource:{kind:'workout_set',id:operation.setId,version:currentVersion},before,after,expectedVersion:currentVersion,precondition:currentVersion,expiresAt:new Date(clock.rows[0].expires).toISOString(),reviewRequired:true};
          const envelope={proposal};
          proposal.hash=digest({actor:scope.actorId,subject:scope.subjectId,organization:scope.organizationId,conversation:operation.conversationId,envelope});
          if(new TextEncoder().encode(JSON.stringify(envelope)).length>4096)throw new Rejected('invalid_input');
          await tx.execute(sql`INSERT INTO private.coach_action_proposals(id,actor_id,subject_id,organization_id,conversation_id,action,request_hash,resource_version,envelope,expires_at)
            VALUES (${proposal.id}::uuid,${scope.actorId}::uuid,${scope.subjectId}::uuid,${scope.organizationId}::uuid,${operation.conversationId}::uuid,${action},${proposal.hash},${currentVersion},${JSON.stringify(envelope)}::jsonb,${proposal.expiresAt}::timestamptz)`);
          scope.signal.throwIfAborted();return {version:'coach-assistant.v2',storage:'database',ok:true,proposal} as WorkoutSetResult;
        }
        if(operation.operation!=='set.apply')throw new Rejected('invalid_input');
        const saved=await tx.execute<{envelope:unknown;expired:boolean;request_hash:string;resource_version:string}>(sql`SELECT envelope,expires_at<=clock_timestamp() AS expired,request_hash,resource_version FROM private.coach_action_proposals
          WHERE id=${operation.proposalId}::uuid AND actor_id=${scope.actorId}::uuid AND subject_id=${scope.subjectId}::uuid AND organization_id=${scope.organizationId}::uuid AND conversation_id=${operation.conversationId}::uuid AND action=${action}`);
        const stored=saved.rows[0];if(!stored)throw new Rejected('not_found');
        const envelope=envelopeSchema.parse(stored.envelope);const proposal=envelope.proposal;
        if(proposal.resource.id!==operation.setId||proposal.id!==operation.proposalId||stored.request_hash!==operation.hash||proposal.hash!==operation.hash)throw new Rejected('invalid_input');
        if(stored.expired)throw new Rejected('expired');
        if(currentVersion!==operation.resourceVersion||stored.resource_version!==currentVersion||proposal.resource.version!==currentVersion||proposal.expectedVersion!==currentVersion||proposal.precondition!==currentVersion||canonical(proposal.before)!==canonical(before))throw new Rejected('version_conflict');
        const claimedHash=digest({actor:scope.actorId,subject:scope.subjectId,organization:scope.organizationId,conversation:operation.conversationId,envelope:{...envelope,proposal:{...proposal,hash:''}}});
        if(claimedHash!==proposal.hash)throw new Rejected('invalid_input');
        scope.signal.throwIfAborted();
        await authorize(tx,scope);
        const updated=await applyWorkoutSetRepsEdit(tx,existing,scope.subjectId,{reps:proposal.after.reps});
        if(canonical(values(updated,label.rows[0].name))!==canonical(proposal.after))throw new Rejected('version_conflict');
        const nextVersion=await version(tx,operation.setId);if(nextVersion===currentVersion)throw new Rejected('uncertain');
        const clock=await tx.execute<{recorded:string}>(sql`SELECT clock_timestamp()::text AS recorded`);
        const receipt:CoachReceipt={id:randomUUID(),actionId:operation.actionId,proposalId:proposal.id,status:'applied',resourceVersion:nextVersion,recordedAt:new Date(clock.rows[0].recorded).toISOString()};
        const refresh:WorkoutSetRefresh={setId:operation.setId,sessionId:before.sessionId,exerciseId:before.exerciseId,previousVersion:currentVersion,version:nextVersion,strategy:'refetch'};
        const result:WorkoutSetResult={version:'coach-assistant.v2',storage:'database',ok:true,receipt,refresh};
        await tx.execute(sql`INSERT INTO private.coach_action_receipts(id,actor_id,subject_id,organization_id,conversation_id,action_id,proposal_id,request_hash,resource_version,result)
          VALUES (${receipt.id}::uuid,${scope.actorId}::uuid,${scope.subjectId}::uuid,${scope.organizationId}::uuid,${operation.conversationId}::uuid,${operation.actionId}::uuid,${proposal.id}::uuid,${operation.hash},${currentVersion},${JSON.stringify(result)}::jsonb)`);
        await tx.execute(sql`INSERT INTO public.audit_log(actor_id,actor_role,action,table_name,record_id,new_value)
          VALUES (${scope.actorId}::uuid,'client'::user_role,'workout_set_reps_updated','workout_sets',${operation.setId}::uuid,${JSON.stringify({actionId:operation.actionId,version:nextVersion})}::jsonb)`);
        scope.signal.throwIfAborted();return result;
      });
    } catch(error) {
      if(error instanceof Rejected)return fail(error.reason);
      if(error instanceof z.ZodError)return fail('invalid_input');
      if(error instanceof TRPCError&&error.code==='CONFLICT')return fail('version_conflict');
      if(error instanceof TRPCError&&error.code==='FORBIDDEN')return fail('forbidden');
      return fail('uncertain');
    }
  }};
}
