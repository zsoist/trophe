import { and, eq, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import type { db } from '@/db/client';
import { clientProfiles } from '@/db/schema/profiles';
import { parseWorkoutPreferences, workoutPreferencesSchema } from './preferences';

/** Shared atomic writer for manual tRPC edits and reviewed coach transactions.
 * It requires no coach tables and remains usable when the coach flag is off.
 */
export async function writeWorkoutPreferences(database: Pick<typeof db, 'update'>, input: {
  actorId: string; subjectId: string; role: string; preferences: unknown;
}) {
  const preferences = workoutPreferencesSchema.parse(input.preferences);
  const self = input.role === 'client' && input.actorId === input.subjectId;
  if (!self && input.role !== 'coach') throw new TRPCError({ code: 'FORBIDDEN' });
  const [updated] = await database.update(clientProfiles).set({ workoutPreferences: preferences, updatedAt: new Date().toISOString() })
    .where(and(eq(clientProfiles.userId, input.subjectId),
      sql`EXISTS (SELECT 1 FROM public.profiles current_actor WHERE current_actor.id = ${input.actorId}::uuid AND current_actor.role::text = ${input.role})`,
      self ? eq(clientProfiles.userId, input.actorId) : and(eq(clientProfiles.coachId, input.actorId),
        sql`EXISTS (SELECT 1 FROM public.organization_members actor_org JOIN public.organization_members subject_org ON subject_org.org_id = actor_org.org_id
          WHERE actor_org.user_id = ${input.actorId}::uuid AND actor_org.role::text = 'coach' AND subject_org.user_id = ${input.subjectId}::uuid)`)))
    .returning({ workoutPreferences: clientProfiles.workoutPreferences });
  if (!updated) throw new TRPCError({ code: 'FORBIDDEN', message: 'Workout preference access changed' });
  return parseWorkoutPreferences(updated.workoutPreferences);
}
