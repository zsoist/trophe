import { sql } from 'drizzle-orm';
import type { db } from '@/db/client';
import { parseClientMessageBody } from './client-message-contract';
type Transaction=Parameters<Parameters<typeof db.transaction>[0]>[0];
/** New shared writer, not yet adopted by the existing route. Caller locks relation
 * and commits this insert together with its durable action receipt. No delivery claim. */
export async function insertReviewedClientMessage(tx:Transaction,input:{messageId:string;actorId:string;subjectId:string;organizationId:string;coachId:string;message:string}){
 if(input.actorId!==input.subjectId)throw new Error('forbidden');
 const {message}=parseClientMessageBody({message:input.message});
 if(message!==input.message)throw new Error('invalid_input');
 const result=await tx.execute<{id:string}>(sql`INSERT INTO public.messages(id,coach_id,client_id,sender_role,body)
 SELECT ${input.messageId}::uuid,cp.coach_id,cp.user_id,'client',${message}
 FROM public.client_profiles cp JOIN public.profiles actor ON actor.id=cp.user_id JOIN public.profiles coach ON coach.id=cp.coach_id
 WHERE cp.user_id=${input.subjectId}::uuid AND cp.coach_id=${input.coachId}::uuid AND actor.role::text='client' AND coach.role::text='coach'
 AND EXISTS(SELECT 1 FROM public.organization_members cm JOIN public.organization_members am ON am.org_id=cm.org_id
 WHERE cm.user_id=cp.coach_id AND cm.role::text='coach' AND am.user_id=cp.user_id AND am.role::text='client' AND cm.org_id=${input.organizationId}::uuid)
 RETURNING id`);
 if(result.rows.length!==1||result.rows[0].id!==input.messageId)throw new Error('forbidden');
 return {messageId:result.rows[0].id,status:'stored' as const};
}
