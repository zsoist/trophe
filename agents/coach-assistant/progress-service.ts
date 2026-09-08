import { createHash,randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { db } from '@/db/client';
import { insertReviewedMeasurement } from '@/lib/workout/measurement-service';
import { measurementProposalSchema,progressOperationSchema,progressResultSchema,type ProgressService } from './progress-actions';
import { summarizeMeasurementTrends } from './progress-trends';
import type { MeasurementProposal,ProgressMeasurement,ProgressResult,ProgressError } from './progress-contracts';
type Database=typeof db;
type Transaction=Parameters<Parameters<Database['transaction']>[0]>[0];
type Scope=Parameters<ProgressService['execute']>[0];
const action='measurement.create';
const fail=(error:ProgressError):ProgressResult=>({version:'coach-assistant.v2',storage:'database',ok:false,error});
class Rejected extends Error{constructor(readonly code:ProgressError){super(code);}}
function canonical(value:unknown):string{if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;if(value!==null&&typeof value==='object')return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(',')}}`;return JSON.stringify(value);}
const hash=(value:unknown)=>createHash('sha256').update(canonical(value)).digest('hex');
async function authorize(tx:Transaction,scope:Scope){
 scope.signal.throwIfAborted();
 const found=await tx.execute<{timezone:string|null}>(sql`SELECT actor.timezone FROM public.profiles actor JOIN public.client_profiles cp ON cp.user_id=actor.id JOIN public.organization_members member ON member.user_id=actor.id
 WHERE actor.id=${scope.actorId}::uuid AND actor.id=${scope.subjectId}::uuid AND actor.role::text='client' AND member.role::text='client' AND member.org_id=${scope.organizationId}::uuid FOR SHARE OF actor,cp,member`);
 if(found.rows.length!==1)throw new Rejected('forbidden');scope.signal.throwIfAborted();return found.rows[0];
}
async function version(tx:Transaction,subjectId:string){
 const found=await tx.execute<{revision:string}>(sql`SELECT revision::text FROM private.coach_measurement_scope_versions WHERE subject_id=${subjectId}::uuid FOR UPDATE`);
 if(found.rows.length!==1)throw new Rejected('not_connected');const value=found.rows[0].revision;if(!/^[1-9][0-9]{0,18}$/.test(value))throw new Rejected('uncertain');return value;
}
function proposalHash(scope:Scope,proposal:MeasurementProposal){return hash({actor:scope.actorId,subject:scope.subjectId,organization:scope.organizationId,conversation:scope.operation.conversationId,proposal:{...proposal,hash:''}});}
/** SQL service uses the existing action ledger and caller-transaction domain writer.
 * Missing isolated scope revision schema fails closed. No schema installation here.
 */
export function createProgressService(database:Database):ProgressService{return {async execute(scope){
 const parsed=progressOperationSchema.safeParse(scope.operation);if(!parsed.success)return fail('invalid_input');const op=parsed.data;scope={...scope,operation:op};
 if(scope.actorId!==scope.subjectId||(op.clientId??scope.actorId)!==scope.subjectId)return fail('forbidden');
 if(scope.signal.aborted)return fail('cancelled');
 try{return await database.transaction(async tx=>{
  await tx.execute(sql`SET LOCAL statement_timeout='5000ms'`);
  if('actionId' in op)await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${scope.actorId+':'+op.actionId},0))`);
  const profile=await authorize(tx,scope);
  if('actionId' in op){
   const prior=await tx.execute<{subject_id:string;organization_id:string;conversation_id:string;proposal_id:string;request_hash:string;resource_version:string;action:string;result:unknown}>(sql`SELECT r.subject_id,r.organization_id,r.conversation_id,r.proposal_id,r.request_hash,r.resource_version,r.result,p.action
    FROM private.coach_action_receipts r JOIN private.coach_action_proposals p ON p.id=r.proposal_id AND p.actor_id=r.actor_id AND p.subject_id=r.subject_id AND p.organization_id=r.organization_id AND p.conversation_id=r.conversation_id WHERE r.actor_id=${scope.actorId}::uuid AND r.action_id=${op.actionId}::uuid`);
   if(prior.rows.length){const saved=prior.rows[0];const parsedResult=progressResultSchema.safeParse(saved.result);
    if(saved.action!==action||saved.subject_id!==scope.subjectId||saved.organization_id!==scope.organizationId||saved.conversation_id!==op.conversationId||op.operation==='measurement.apply'&&(saved.proposal_id!==op.proposalId||saved.request_hash!==op.hash||saved.resource_version!==op.resourceVersion))throw new Rejected('idempotency_conflict');
    if(!parsedResult.success||!parsedResult.data.ok||!('receipt' in parsedResult.data))throw new Rejected('uncertain');const result=parsedResult.data;
    if(result.receipt.proposalId!==saved.proposal_id||result.receipt.actionId!==op.actionId||result.refresh.measurementId!==saved.proposal_id||result.refresh.previousVersion!==saved.resource_version||result.refresh.version!==result.receipt.resourceVersion)throw new Rejected('uncertain');
    scope.signal.throwIfAborted();return result;
   }
   if(op.operation==='measurement.receipt')throw new Rejected('not_found');
  }
  // All native measurement mutations take this same scope lock via the proposed trigger.
  const currentVersion=await version(tx,scope.subjectId);
  if(op.operation==='progress.read'){
   if(!profile.timezone)throw new Rejected('uncertain');
   // PostgreSQL anchors calendar dates using the authenticated profile's zone.
   const dates=await tx.execute<{start:string;end:string}>(sql`SELECT ((statement_timestamp() AT TIME ZONE ${profile.timezone})::date-(${op.days}::int-1))::text AS start,((statement_timestamp() AT TIME ZONE ${profile.timezone})::date)::text AS end`);
   const window=dates.rows[0];if(!window||!z.string().date().safeParse(window.start).success||!z.string().date().safeParse(window.end).success)throw new Rejected('uncertain');
   const found=await tx.execute<{id:string;user_id:string;measured_date:string;weight_kg:unknown;body_fat_pct:unknown;waist_cm:unknown}>(sql`SELECT id,user_id,measured_date::text,weight_kg,body_fat_pct,waist_cm FROM public.measurements WHERE user_id=${scope.subjectId}::uuid AND measured_date BETWEEN ${window.start}::date AND ${window.end}::date ORDER BY measured_date DESC,created_at DESC NULLS LAST,id DESC LIMIT 251`);
   const selected=found.rows.slice(0,250),seen=new Map<string,string>(),rows:ProgressMeasurement[]=[];let duplicateRowsDropped=0,invalidValuesExcluded=0;
   for(const row of selected){
    if(row.user_id!==scope.subjectId||!z.string().uuid().safeParse(row.id).success||!z.string().date().safeParse(row.measured_date).success||row.measured_date<window.start||row.measured_date>window.end)throw new Rejected('uncertain');
    const fingerprint=canonical(row);if(seen.has(row.id)){if(seen.get(row.id)!==fingerprint)throw new Rejected('uncertain');duplicateRowsDropped++;continue;}seen.set(row.id,fingerprint);
    const numeric=(v:unknown,pct=false):number|null=>{if(v===null)return null;if(typeof v==='number'&&Number.isFinite(v)&&Number.isFinite(Math.fround(v))&&(pct?v>=0&&v<=100:Math.fround(v)>0))return v;invalidValuesExcluded++;return null;};
    rows.push({id:row.id,measuredDate:row.measured_date,weightKg:numeric(row.weight_kg),bodyFatPct:numeric(row.body_fat_pct,true),waistCm:numeric(row.waist_cm)});
   }
   rows.reverse();const truncated=found.rows.length>250;
   const limitations=['Only recorded values are summarized; missing records do not establish behavior.','Same-date observations use their arithmetic mean; measurement methods are not known.'];
   if(truncated)limitations.push('Window exceeds 250 rows; trends describe only the retained observations.');
   if(invalidValuesExcluded)limitations.push('Invalid stored numeric values were excluded.');
   if(rows.length<2)limitations.push('Too few observations for a trend across distinct dates.');
   scope.signal.throwIfAborted();return {version:'coach-assistant.v2',storage:'database',ok:true,snapshot:{subjectId:scope.subjectId,version:currentVersion,window:{...window,timezone:profile.timezone,days:op.days},measurements:rows,trends:summarizeMeasurementTrends(rows),truncated,duplicateRowsDropped,invalidValuesExcluded,limitations}};
  }
  if(op.operation==='measurement.propose'){
   if(op.resourceVersion!==currentVersion)throw new Rejected('version_conflict');
   const count=await tx.execute<{count:string}>(sql`SELECT count(*)::text FROM private.coach_action_proposals WHERE actor_id=${scope.actorId}::uuid AND expires_at>now()`);const active=Number(count.rows[0]?.count);if(!Number.isSafeInteger(active)||active<0||active>=128)throw new Rejected('uncertain');
   const clock=await tx.execute<{expires:string}>(sql`SELECT (clock_timestamp()+interval '5 minutes')::text AS expires`);const id=randomUUID();
   const proposal:MeasurementProposal={id,hash:'',action,resource:{kind:'measurement',id,version:currentVersion},before:null,after:op.after,precondition:currentVersion,expiresAt:new Date(clock.rows[0].expires).toISOString(),reviewRequired:true,inputSource:'explicit_user'};proposal.hash=proposalHash(scope,proposal);
   await tx.execute(sql`INSERT INTO private.coach_action_proposals(id,actor_id,subject_id,organization_id,conversation_id,action,request_hash,resource_version,envelope,expires_at) VALUES(${id}::uuid,${scope.actorId}::uuid,${scope.subjectId}::uuid,${scope.organizationId}::uuid,${op.conversationId}::uuid,${action},${proposal.hash},${currentVersion},${JSON.stringify(proposal)}::jsonb,${proposal.expiresAt}::timestamptz)`);
   scope.signal.throwIfAborted();return {version:'coach-assistant.v2',storage:'database',ok:true,proposal};
  }
  if(op.operation!=='measurement.apply')throw new Rejected('invalid_input');
  const saved=await tx.execute<{envelope:unknown;expired:boolean;request_hash:string;resource_version:string}>(sql`SELECT envelope,expires_at<=clock_timestamp() AS expired,request_hash,resource_version FROM private.coach_action_proposals WHERE id=${op.proposalId}::uuid AND actor_id=${scope.actorId}::uuid AND subject_id=${scope.subjectId}::uuid AND organization_id=${scope.organizationId}::uuid AND conversation_id=${op.conversationId}::uuid AND action=${action} FOR UPDATE`);
  if(saved.rows.length!==1)throw new Rejected('not_found');const stored=saved.rows[0],proposal=measurementProposalSchema.parse(stored.envelope);
  if(proposal.id!==op.proposalId||proposal.resource.id!==op.proposalId||proposal.hash!==op.hash||stored.request_hash!==op.hash||proposalHash(scope,proposal)!==proposal.hash)throw new Rejected('invalid_input');
  // A receipt consumes the proposal even after the canonical measurement is deleted.
  const consumed=await tx.execute(sql`SELECT id FROM private.coach_action_receipts WHERE actor_id=${scope.actorId}::uuid AND proposal_id=${proposal.id}::uuid LIMIT 1`);if(consumed.rows.length)throw new Rejected('idempotency_conflict');
  if(stored.expired)throw new Rejected('expired');
  if(currentVersion!==op.resourceVersion||stored.resource_version!==currentVersion||proposal.resource.version!==currentVersion||proposal.precondition!==currentVersion)throw new Rejected('version_conflict');
  await authorize(tx,scope);
  const expiry=await tx.execute<{expired:boolean}>(sql`SELECT clock_timestamp()>=${proposal.expiresAt}::timestamptz AS expired`);if(expiry.rows[0]?.expired!==false)throw new Rejected('expired');
  scope.signal.throwIfAborted();const created=await insertReviewedMeasurement(tx,{id:proposal.id,ownerUserId:scope.subjectId},proposal.after);
  if(created.id!==proposal.id||created.userId!==scope.subjectId||created.measuredDate!==proposal.after.measuredDate)throw new Rejected('uncertain');
  for(const key of ['weightKg','bodyFatPct','waistCm'] as const){const actual=created[key],expected=proposal.after[key];if(actual===null||expected===null?actual!==expected:typeof actual!=='number'||!Number.isFinite(actual)||Math.fround(actual)!==Math.fround(expected))throw new Rejected('uncertain');}
  const nextVersion=await version(tx,scope.subjectId);if(BigInt(nextVersion)<=BigInt(currentVersion))throw new Rejected('uncertain');
  const clock=await tx.execute<{recorded:string}>(sql`SELECT clock_timestamp()::text AS recorded`);
  const result:ProgressResult={version:'coach-assistant.v2',storage:'database',ok:true,receipt:{id:randomUUID(),actionId:op.actionId,proposalId:proposal.id,status:'applied',resourceVersion:nextVersion,recordedAt:new Date(clock.rows[0].recorded).toISOString(),action},refresh:{measurementId:proposal.id,measuredDate:proposal.after.measuredDate,previousVersion:currentVersion,version:nextVersion,strategy:'refetch'}};
  await tx.execute(sql`INSERT INTO private.coach_action_receipts(id,actor_id,subject_id,organization_id,conversation_id,action_id,proposal_id,request_hash,resource_version,result) VALUES(${result.receipt.id}::uuid,${scope.actorId}::uuid,${scope.subjectId}::uuid,${scope.organizationId}::uuid,${op.conversationId}::uuid,${op.actionId}::uuid,${proposal.id}::uuid,${op.hash},${currentVersion},${JSON.stringify(result)}::jsonb)`);
  await tx.execute(sql`INSERT INTO public.audit_log(actor_id,actor_role,action,table_name,record_id,new_value) VALUES(${scope.actorId}::uuid,'client'::user_role,'measurement_created','measurements',${proposal.id}::uuid,${JSON.stringify({actionId:op.actionId,version:nextVersion})}::jsonb)`);
  scope.signal.throwIfAborted();return result;
 });}catch(error){
  if(error instanceof Rejected)return fail(error.code);if(error instanceof z.ZodError)return fail('invalid_input');
  const code=(v:unknown)=>v&&typeof v==='object'&&'code' in v?v.code:undefined;const cause=error&&typeof error==='object'&&'cause' in error?error.cause:undefined;
  if([code(error),code(cause)].some(v=>v==='42P01'||v==='42703'))return fail('not_connected');
  if([code(error),code(cause)].includes('23505'))return fail('idempotency_conflict');
  return fail('uncertain');
 }
}};}
