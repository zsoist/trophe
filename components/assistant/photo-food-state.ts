import type { PhotoFoodOperation } from '@/agents/coach-assistant/photo-food-actions';
import type { PhotoFoodError, PhotoFoodProposal, PhotoFoodResult } from '@/agents/coach-assistant/photo-food-contracts';
import type { PhotoFoodTransport } from './photo-food-client';

type Snapshot = Extract<PhotoFoodResult, { ok: true; snapshot: unknown }>['snapshot'];
type Receipt = Extract<PhotoFoodResult, { ok: true; receipt: unknown }>['receipt'];
export interface PhotoFoodState { attachmentId:string|null;snapshot:Snapshot|null;itemIndex:number|null;proposal:PhotoFoodProposal|null;receipt:Receipt|null;refreshEntryId:string|null;pending:boolean;uncertain:boolean;receiptMissing:boolean;error:string|null }
const empty=():PhotoFoodState=>({attachmentId:null,snapshot:null,itemIndex:null,proposal:null,receipt:null,refreshEntryId:null,pending:false,uncertain:false,receiptMissing:false,error:null});
// Apply outcomes the writer contract proves did not commit: pre-dispatch validation (`invalid_input`),
// a transaction rollback (`not_connected` can be raised before dispatch *or* after the write statement
// rolls back, so nothing is committed), or a refusal that precedes the insert (`expired`/`version_conflict`/
// `identity_clarification_required`). `forbidden` is excluded because the service re-authorizes after
// dispatch, so a fresh-auth mismatch can follow a committed write. `idempotency_conflict` is excluded
// because it only reports that the *current* request was refused (consumed proposal or reused action id)
// and is not proof that no older write committed. `not_found`/`uncertain`/`cancelled` are ambiguous and
// never release the pinned envelope. These outcomes are only trusted for the *initial* dispatch: on an
// explicit retry a delayed original may still commit behind the same action lock, so a retry error never
// releases the pinned recovery (see `retry`).
const nonCommitApplyErrors=new Set<PhotoFoodError>(['identity_clarification_required','invalid_input','not_connected','expired','version_conflict']);

export class PhotoFoodController {
 private state=empty();private listeners=new Set<()=>void>();private active:AbortController|null=null;private generation=0;private conversationId='';private action:Extract<PhotoFoodOperation,{operation:'photo.food.apply'}>|null=null;
 snapshot=()=>this.state;subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};private publish(state:PhotoFoodState){this.state=state;this.listeners.forEach(listener=>listener());}
 reset(){this.generation++;this.active?.abort();this.active=null;this.action=null;this.conversationId='';this.publish(empty());}
 moveConversation(conversationId:string){if(conversationId===this.conversationId)return;this.reset();this.conversationId=conversationId;}
 cancel(){if(!this.active)return;this.generation++;this.active.abort();this.active=null;this.publish({...this.state,pending:false,uncertain:Boolean(this.action&&!this.state.receipt),error:this.action?'uncertain':null});}
 dismiss(){if(this.action&&!this.state.receipt)return;this.reset();}
 async select(attachmentId:string,conversationId:string,transport:PhotoFoodTransport){if(this.action&&!this.state.receipt)return false;this.reset();this.conversationId=conversationId;this.publish({...empty(),attachmentId});await this.run({version:'coach-assistant.v2',operation:'photo.food.read',conversationId,turnId:crypto.randomUUID(),attachmentId},transport);return true;}
 choose(index:number){if(!this.state.pending&&this.state.snapshot?.items.some(item=>item.index===index))this.publish({...this.state,itemIndex:index,proposal:null,error:null});}
 async propose(after:{loggedDate:string;mealType:'breakfast'|'lunch'|'dinner'|'snack'|'pre_workout'|'post_workout';mealSlot?:import('@/lib/food/meal-slot').CanonicalMealSlot;grams:number},transport:PhotoFoodTransport){const s=this.state,item=s.snapshot?.items.find(value=>value.index===s.itemIndex);if(!s.attachmentId||!s.snapshot||!item||s.pending||this.action||!Number.isFinite(after.grams)||after.grams<.1||after.grams>10000)return;if(item.identityStatus!=='identified'){this.publish({...s,error:'identity_clarification_required'});return;}await this.run({version:'coach-assistant.v2',operation:'photo.food.propose',conversationId:this.conversationId,turnId:crypto.randomUUID(),attachmentId:s.attachmentId,observationId:s.snapshot.observationId,itemIndex:item.index,resourceVersion:item.version,after},transport);}
 discard(){if(!this.state.pending&&!this.action)this.publish({...this.state,proposal:null,error:null});}
 async apply(transport:PhotoFoodTransport){const p=this.state.proposal;if(!p||this.state.pending||this.action||this.state.receipt)return;if(this.state.snapshot?.items.find(item=>item.index===this.state.itemIndex)?.identityStatus!=='identified'){this.publish({...this.state,proposal:null,error:'identity_clarification_required'});return;}if(Date.parse(p.expiresAt)<=Date.now()){this.publish({...this.state,error:'expired'});return;}this.action={version:'coach-assistant.v2',operation:'photo.food.apply',conversationId:this.conversationId,turnId:crypto.randomUUID(),proposalId:p.id,hash:p.hash,actionId:crypto.randomUUID(),resourceVersion:p.resource.version,reviewed:true};await this.run(this.action,transport);}
 async check(transport:PhotoFoodTransport){const action=this.action;if(!action||this.state.pending||!this.state.uncertain)return;await this.run({version:'coach-assistant.v2',operation:'photo.food.receipt',conversationId:this.conversationId,turnId:crypto.randomUUID(),actionId:action.actionId},transport);}
 // Explicit, user-triggered retry of the SAME already-confirmed immutable envelope (identical
 // actionId/proposalId/hash/resourceVersion). Offered only after a Check proved the receipt missing.
 // Writer idempotency (actor+actionId transaction lock, receipt-first equality checks, consumed-proposal
 // guard) makes a residual retry safe: if the delayed original won, the receipt is returned; if this retry
 // wins, exactly one commit occurs. Never automatic, never a new action identity.
 async retry(transport:PhotoFoodTransport){const action=this.action;if(!action||this.state.pending||this.state.receipt||!this.state.receiptMissing)return false;await this.run(action,transport,true);return true;}
 private async run(operation:PhotoFoodOperation,transport:PhotoFoodTransport,isRetry=false):Promise<PhotoFoodResult|null>{const controller=new AbortController();this.active=controller;const generation=++this.generation,valid=()=>generation===this.generation&&!controller.signal.aborted;this.publish({...this.state,pending:true,error:null});try{const result=await transport(operation,controller.signal);if(!valid())return null;if(!result.ok){
   // Receipt lookups are pure reads: no lookup error (including forbidden/not_connected/invalid_input)
   // can prove the pinned apply did not commit, so they never release the envelope or clear uncertainty.
   // Only an apply outcome the writer contract proves non-committing releases the pinned action.
   if(operation.operation==='photo.food.apply'&&!isRetry&&nonCommitApplyErrors.has(result.error))this.action=null;
   // Check is a pure read: a `not_found` lookup is only absence at lookup time and cannot prove a
   // delayed apply never commits, so it stays pinned and instead offers an explicit user retry.
   const receiptMissing=Boolean(this.action)&&(operation.operation==='photo.food.receipt'?result.error==='not_found':this.state.receiptMissing);
   this.publish({...this.state,pending:false,uncertain:Boolean(this.action),receiptMissing,error:result.error});return result;}if('snapshot'in result){if(result.snapshot.attachmentId!==this.state.attachmentId||result.snapshot.trust!=='untrusted_image_data'||result.snapshot.reviewRequired!==true)throw Error('invalid_snapshot');this.publish({...this.state,snapshot:result.snapshot,itemIndex:result.snapshot.items[0]?.index??null,pending:false});}else if('proposal'in result){const item=this.state.snapshot?.items.find(value=>value.index===this.state.itemIndex);if(!item||result.proposal.before!==null||result.proposal.precondition!==item.version||result.proposal.after.portion!=='explicit_user'||result.proposal.evidence.trust!=='untrusted_image_data')throw Error('invalid_proposal');this.publish({...this.state,proposal:result.proposal,pending:false});}else{if(!this.action||result.receipt.actionId!==this.action.actionId||result.refresh.entryId!==result.receipt.proposalId)throw Error('invalid_receipt');this.publish({...this.state,receipt:result.receipt,refreshEntryId:result.refresh.entryId,pending:false,uncertain:false,receiptMissing:false});}return result;}
 catch{if(valid())this.publish({...this.state,pending:false,uncertain:Boolean(this.action),error:this.action?'uncertain':'failed'});return null;}finally{if(valid())this.active=null;}}
}
