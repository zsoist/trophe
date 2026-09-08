import { z } from 'zod';
import type { CoachRepository } from './repository';
import { clientMessageBodySchema } from '@/lib/chat/client-message-contract';
const version=z.string().min(1).max(128);
const base={version:z.literal('coach-assistant.v2'),conversationId:z.string().uuid(),turnId:z.string().uuid()};
export const coachMessageOperationSchema=z.discriminatedUnion('operation',[
 z.object({...base,operation:z.literal('message.recipient')}).strict(),
 z.object({...base,operation:z.literal('message.propose'),coachId:z.string().uuid(),resourceVersion:version,after:clientMessageBodySchema}).strict(),
 z.object({...base,operation:z.literal('message.apply'),coachId:z.string().uuid(),proposalId:z.string().uuid(),hash:z.string().regex(/^[a-f0-9]{64}$/),resourceVersion:version,actionId:z.string().uuid(),reviewed:z.literal(true)}).strict(),
 z.object({...base,operation:z.literal('message.receipt'),coachId:z.string().uuid(),actionId:z.string().uuid()}).strict(),
]);
export const recipientSchema=z.object({coachId:z.string().uuid(),name:z.string().max(500).nullable(),version}).strict();
export const coachMessageProposalSchema=z.object({id:z.string().uuid(),hash:z.string().regex(/^[a-f0-9]{64}$/),action:z.literal('chat.message.send'),recipient:recipientSchema,after:clientMessageBodySchema,expiresAt:z.string().datetime({offset:true}),reviewRequired:z.literal(true)}).strict();
export const coachMessageResultSchema=z.union([
 z.object({ok:z.literal(false),error:z.enum(['invalid_input','forbidden','not_found','ambiguous_selection','not_connected','version_conflict','expired','idempotency_conflict','rate_limited','cancelled','uncertain'])}).strict(),
 z.object({ok:z.literal(true),recipient:recipientSchema}).strict(),
 z.object({ok:z.literal(true),proposal:coachMessageProposalSchema}).strict(),
 z.object({ok:z.literal(true),receipt:z.object({id:z.string().uuid(),actionId:z.string().uuid(),proposalId:z.string().uuid(),messageId:z.string().uuid(),coachId:z.string().uuid(),status:z.literal('stored'),recordedAt:z.string().datetime({offset:true})}).strict(),refresh:z.object({coachId:z.string().uuid(),clientId:z.string().uuid(),strategy:z.literal('refetch')}).strict()}).strict(),
]);
export type CoachMessageOperation=z.infer<typeof coachMessageOperationSchema>;
export type CoachMessageResult=z.infer<typeof coachMessageResultSchema>;
export type CoachMessageProposal=z.infer<typeof coachMessageProposalSchema>;
export interface CoachMessageService {execute(scope:{actorId:string;subjectId:string;organizationId:string;signal:AbortSignal;operation:CoachMessageOperation}):Promise<CoachMessageResult>}
export async function executeCoachMessageAction(actorId:string,raw:unknown,repository:CoachRepository,service:CoachMessageService,signal:AbortSignal):Promise<CoachMessageResult>{
 const parsed=coachMessageOperationSchema.safeParse(raw);if(!parsed.success)return {ok:false,error:'invalid_input'};
 if(repository.dataSource!=='authorized_records')return {ok:false,error:'not_connected'};
 let dispatched=false;
 try{
  signal.throwIfAborted();const scope=await repository.authorize(actorId,actorId,signal);signal.throwIfAborted();
  if(scope.actorId!==actorId||scope.subjectId!==actorId)return {ok:false,error:'forbidden'};
  dispatched=true;const result=coachMessageResultSchema.parse(await service.execute({...scope,operation:parsed.data,signal}));
  signal.throwIfAborted();const fresh=await repository.authorize(actorId,actorId,signal);
  if(JSON.stringify(fresh)!==JSON.stringify(scope))return parsed.data.operation==='message.apply'&&result.ok&&'receipt'in result?{ok:false,error:'uncertain'}:{ok:false,error:'forbidden'};
  if(result.ok&&'recipient' in result&&parsed.data.operation!=='message.recipient')return {ok:false,error:'uncertain'};
  if(result.ok&&'proposal' in result){const op=parsed.data;if(op.operation!=='message.propose'||result.proposal.recipient.coachId!==op.coachId||result.proposal.recipient.version!==op.resourceVersion||result.proposal.after.message!==op.after.message)return {ok:false,error:'uncertain'};}
  if(result.ok&&'receipt' in result){const op=parsed.data;if(!('actionId' in op)||result.receipt.actionId!==op.actionId||result.receipt.coachId!==op.coachId||result.refresh.clientId!==actorId||result.refresh.coachId!==op.coachId||op.operation==='message.apply'&&result.receipt.proposalId!==op.proposalId)return {ok:false,error:'uncertain'};}
  return result;
 }catch{return {ok:false,error:dispatched?'uncertain':signal.aborted?'cancelled':'forbidden'};}
}
