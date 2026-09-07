import { sql } from 'drizzle-orm';
import type { db } from '@/db/client';
import { parseFoodPreferences } from './preferences';
type Transaction=Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Isolated column only; caller holds profile/scope locks on this same ledger transaction. */
export async function writeFoodPreferences(tx:Transaction,input:{actorId:string;subjectId:string;organizationId:string;before:unknown;after:unknown}) {
 const before=parseFoodPreferences(input.before);const after=parseFoodPreferences(input.after);
 if(input.actorId!==input.subjectId)throw new Error('forbidden');
 const result=await tx.execute<{food_preferences:unknown}>(sql`UPDATE public.client_profiles cp SET food_preferences=${JSON.stringify(after)}::jsonb,updated_at=clock_timestamp()
 WHERE cp.user_id=${input.subjectId}::uuid AND cp.food_preferences=${JSON.stringify(before)}::jsonb
 AND EXISTS(SELECT 1 FROM public.profiles actor JOIN public.organization_members member ON member.user_id=actor.id
 WHERE actor.id=${input.actorId}::uuid AND actor.role::text='client' AND member.role::text='client' AND member.org_id=${input.organizationId}::uuid)
 RETURNING cp.food_preferences`);
 if(result.rows.length!==1)throw new Error('version_conflict');
 return parseFoodPreferences(result.rows[0].food_preferences);
}
