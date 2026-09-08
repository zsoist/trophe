import { and, eq, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { db } from '@/db/client';
import { workoutSets } from '@/db/schema/workouts';

type Transaction=Parameters<Parameters<typeof db.transaction>[0]>[0];
export type WorkoutSetRow=typeof workoutSets.$inferSelect;
export const workoutSetRepsChangeSchema=z.object({reps:z.number().int().positive().max(2147483647)}).strict();
export const parseWorkoutSetRepsChange=(input:unknown)=>workoutSetRepsChangeSchema.parse(input);

/** New shared correction writer, executed on the caller's ledger transaction.
 * Preserves identity, original insertion request and all other fields, including
 * isPr. On an open live session, replaying the original insertion remains a no-op;
 * on a finished session the existing RPC rejects it. Neither restores old reps. No PR recalculation is implied by a correction.
 */
export async function applyWorkoutSetRepsEdit(tx:Transaction,existing:WorkoutSetRow,ownerUserId:string,input:unknown) {
 const after=parseWorkoutSetRepsChange(input);
 if(!existing.sessionId)throw new TRPCError({code:'FORBIDDEN'});
 const [updated]=await tx.update(workoutSets).set(after).where(and(
  eq(workoutSets.id,existing.id),eq(workoutSets.sessionId,existing.sessionId),
  sql`EXISTS (SELECT 1 FROM public.workout_sessions s WHERE s.id=${workoutSets.sessionId} AND s.user_id=${ownerUserId}::uuid AND s.completed_at IS NULL)`,
  sql`${workoutSets.reps} IS NOT DISTINCT FROM ${existing.reps}`,
 )).returning();
 if(!updated)throw new TRPCError({code:'CONFLICT'});
 return updated;
}
