/**
 * Trophē — tRPC workouts router.
 *
 * The server layer the workout module never had. Before this, every workout
 * operation was browser-side supabase-js, and "Assign to Client" wrote to a
 * column that does not exist (with an unchecked error and a success toast).
 *
 * Procedures:
 *   workouts.templates.update   — edit an existing template (coach, creator-only)
 *   workouts.program.assign     — assign/replace a client's ACTIVE program (coach)
 *   workouts.program.archive    — archive a client's active program (coach)
 *   workouts.program.forClient  — coach view of a client's active program
 *   workouts.program.mine       — client's own active program, fully resolved
 *   workouts.logs.forClient     — coach: recent sessions + sets (+ exercise names)
 *
 * Weekday convention: 0=Sunday … 6=Saturday (JS Date.getDay()).
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, coachProcedure, protectedProcedure } from '../init';
import type { db as dbClient } from '@/db/client';
import {
  exercises,
  workoutPrograms,
  workoutProgramDays,
  workoutSessions,
  workoutSets,
  workoutTemplates,
} from '@/db/schema/workouts';
import { clientProfiles } from '@/db/schema/profiles';
import { and, desc, eq, inArray, isNotNull, or } from 'drizzle-orm';
import { assertCanAccessClient } from '@/lib/auth/tenant-access';
import { recordAuditEvent } from '@/lib/utils/audit';
import type { Exercise, Goal, MuscleGroup, TemplateExercise, WorkoutTemplate } from '@/lib/types';
import { parseWorkoutPreferences, workoutPreferencesSchema } from '@/lib/workout/preferences';
import { buildWorkoutRecommendation } from '@/lib/workout/recommendation';
import { resolveMuscleActivations } from '@/lib/workout/anatomy';

type Db = typeof dbClient;

// ── Input schemas ──────────────────────────────────────────────────────────

const templateExerciseSchema = z.object({
  exercise_id: z.string().uuid(),
  target_sets: z.number().int().min(1).max(12),
  target_reps: z.string().min(1).max(20),
  target_rpe: z.number().min(1).max(10).optional(),
  notes: z.string().max(500).optional(),
});

const programDaySchema = z.object({
  /** 0=Sunday … 6=Saturday (JS Date.getDay()). */
  weekday: z.number().int().min(0).max(6),
  templateId: z.string().uuid(),
  sort: z.number().int().min(0).max(10).optional(),
});

/** Templates a coach may reference: their own, or shared library ones. */
async function assertTemplatesUsable(
  db: Db,
  coachId: string,
  templateIds: string[],
) {
  if (templateIds.length === 0) return;
  const usable = await db
    .select({ id: workoutTemplates.id })
    .from(workoutTemplates)
    .where(
      and(
        inArray(workoutTemplates.id, templateIds),
        or(eq(workoutTemplates.createdBy, coachId), eq(workoutTemplates.shared, true)),
      ),
    );
  if (usable.length !== templateIds.length) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown or inaccessible template in program' });
  }
}

/** Resolve the exercise rows referenced inside template jsonb payloads. */
async function resolveTemplateExercises(
  db: Db,
  templates: Array<{ exercises: unknown }>,
) {
  const ids = [
    ...new Set(
      templates.flatMap((t) =>
        ((t.exercises as TemplateExercise[]) ?? []).map((e) => e.exercise_id),
      ),
    ),
  ];
  if (ids.length === 0) return [];
  return db
    .select({
      id: exercises.id,
      name: exercises.name,
      nameEs: exercises.nameEs,
      nameEl: exercises.nameEl,
      muscleGroup: exercises.muscleGroup,
      equipment: exercises.equipment,
      isCompound: exercises.isCompound,
    })
    .from(exercises)
    .where(inArray(exercises.id, ids));
}

/** Weekday convention is shared with workout_program_days: 0=Sunday … 6=Saturday. */
export function selectCoachTemplateForWeekday(
  days: Array<{ weekday: number; template: unknown }>,
  weekday: number,
): WorkoutTemplate | null {
  return (days.find((day) => day.weekday === weekday)?.template as WorkoutTemplate | undefined) ?? null;
}

const recommendationContextSchema = z.object({
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  localWeekday: z.number().int().min(0).max(6),
}).superRefine(({ localDate, localWeekday }, ctx) => {
  const [year, month, day] = localDate.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  const validDate = parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
  if (!validDate || parsed.getUTCDay() !== localWeekday) {
    ctx.addIssue({ code: 'custom', message: 'localDate and localWeekday must identify the same valid calendar day' });
  }
});

// ── Router ─────────────────────────────────────────────────────────────────

export const workoutsRouter = router({
  templates: router({
    /** Edit an existing template — the CRUD gap (create/delete existed, edit didn't). */
    update: coachProcedure
      .input(
        z.object({
          templateId: z.string().uuid(),
          name: z.string().min(1).max(100).optional(),
          description: z.string().max(1000).nullable().optional(),
          dayLabel: z.string().max(40).nullable().optional(),
          difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
          targetMuscles: z.array(z.string().max(20)).max(13).optional(),
          exercises: z.array(templateExerciseSchema).min(1).max(20).optional(),
          shared: z.boolean().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const [existing] = await ctx.db
          .select({ id: workoutTemplates.id })
          .from(workoutTemplates)
          .where(
            and(
              eq(workoutTemplates.id, input.templateId),
              eq(workoutTemplates.createdBy, ctx.user!.id),
            ),
          )
          .limit(1);
        if (!existing) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Template not found' });
        }

        const { templateId, ...patch } = input;
        const [updated] = await ctx.db
          .update(workoutTemplates)
          .set({
            ...(patch.name !== undefined && { name: patch.name }),
            ...(patch.description !== undefined && { description: patch.description }),
            ...(patch.dayLabel !== undefined && { dayLabel: patch.dayLabel }),
            ...(patch.difficulty !== undefined && { difficulty: patch.difficulty }),
            ...(patch.targetMuscles !== undefined && { targetMuscles: patch.targetMuscles }),
            ...(patch.exercises !== undefined && { exercises: patch.exercises }),
            ...(patch.shared !== undefined && { shared: patch.shared }),
          })
          .where(eq(workoutTemplates.id, templateId))
          .returning();

        return updated;
      }),
  }),

  program: router({
    /**
     * Assign (or replace) a client's ACTIVE program. Archives any existing
     * active program in the same transaction — the partial unique index
     * (uq_workout_programs_active_client) guarantees one active per client.
     */
    assign: coachProcedure
      .input(
        z.object({
          clientId: z.string().uuid(),
          name: z.string().min(1).max(100),
          notes: z.string().max(2000).optional(),
          startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          days: z.array(programDaySchema).min(1).max(21),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await assertCanAccessClient(ctx.db, ctx.user!.id, ctx.profile!.role, input.clientId);
        await assertTemplatesUsable(
          ctx.db,
          ctx.user!.id,
          [...new Set(input.days.map((d) => d.templateId))],
        );

        const program = await ctx.db.transaction(async (tx) => {
          await tx
            .update(workoutPrograms)
            .set({ status: 'archived', updatedAt: new Date().toISOString() })
            .where(
              and(
                eq(workoutPrograms.clientId, input.clientId),
                eq(workoutPrograms.status, 'active'),
              ),
            );

          const [p] = await tx
            .insert(workoutPrograms)
            .values({
              clientId: input.clientId,
              coachId: ctx.user!.id,
              name: input.name,
              notes: input.notes ?? null,
              startsOn: input.startsOn ?? null,
            })
            .returning();

          await tx.insert(workoutProgramDays).values(
            input.days.map((d) => ({
              programId: p.id,
              weekday: d.weekday,
              templateId: d.templateId,
              sort: d.sort ?? 0,
            })),
          );

          return p;
        });

        // Audit coverage: who assigned which program to which client.
        await recordAuditEvent({
          actorId: ctx.user!.id,
          actorRole: ctx.profile!.role,
          action: 'workout_program_assigned',
          tableName: 'workout_programs',
          recordId: program?.id ?? null,
          newValue: { clientId: input.clientId, name: input.name, days: input.days.length },
        });

        return program;
      }),

    /** Archive a client's active program without assigning a new one. */
    archive: coachProcedure
      .input(z.object({ clientId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        await assertCanAccessClient(ctx.db, ctx.user!.id, ctx.profile!.role, input.clientId);

        const [archived] = await ctx.db
          .update(workoutPrograms)
          .set({ status: 'archived', updatedAt: new Date().toISOString() })
          .where(
            and(
              eq(workoutPrograms.clientId, input.clientId),
              eq(workoutPrograms.status, 'active'),
            ),
          )
          .returning({ id: workoutPrograms.id });

        if (archived) {
          await recordAuditEvent({
            actorId: ctx.user!.id,
            actorRole: ctx.profile!.role,
            action: 'workout_program_archived',
            tableName: 'workout_programs',
            recordId: archived.id,
            newValue: { clientId: input.clientId },
          });
        }

        return { ok: true, archived: Boolean(archived) };
      }),

    /** Coach view of a client's active program (days + templates + exercises). */
    forClient: coachProcedure
      .input(z.object({ clientId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        await assertCanAccessClient(ctx.db, ctx.user!.id, ctx.profile!.role, input.clientId);
        return loadActiveProgram(ctx.db, input.clientId);
      }),

    /** Client's own active program, fully resolved for rendering "today". */
    mine: protectedProcedure.query(async ({ ctx }) => {
      return loadActiveProgram(ctx.db, ctx.user!.id);
    }),
  }),

  preferences: router({
    /** The caller's persisted v1 intake, with safe defaults for pre-0082 rows. */
    mine: protectedProcedure.query(async ({ ctx }) => {
      const [profile] = await ctx.db
        .select({ workoutPreferences: clientProfiles.workoutPreferences })
        .from(clientProfiles)
        .where(eq(clientProfiles.userId, ctx.user!.id))
        .limit(1);
      return parseWorkoutPreferences(profile?.workoutPreferences);
    }),

    /** A client edits their own document; an assigned coach may edit a client's document. */
    update: protectedProcedure
      .input(z.object({
        clientId: z.string().uuid().optional(),
        preferences: workoutPreferencesSchema,
      }))
      .mutation(async ({ ctx, input }) => {
        const clientId = input.clientId ?? ctx.user!.id;
        const isClientSelfUpdate = ctx.profile?.role === 'client' && clientId === ctx.user!.id;
        const isAssignedCoachUpdate = ctx.profile?.role === 'coach';
        if (!isClientSelfUpdate && !isAssignedCoachUpdate) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the client or assigned coach may update workout preferences' });
        }

        const [updated] = await ctx.db
          .update(clientProfiles)
          .set({
            workoutPreferences: input.preferences,
            updatedAt: new Date().toISOString(),
          })
          .where(and(
            eq(clientProfiles.userId, clientId),
            isClientSelfUpdate
              ? eq(clientProfiles.userId, ctx.user!.id)
              : eq(clientProfiles.coachId, ctx.user!.id),
          ))
          .returning({ workoutPreferences: clientProfiles.workoutPreferences });
        if (!updated) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Client is no longer assigned to this coach' });
        }
        await recordAuditEvent({
          actorId: ctx.user!.id,
          actorRole: ctx.profile!.role,
          action: 'workout_preferences_updated',
          tableName: 'client_profiles',
          recordId: clientId,
          newValue: { clientId, version: input.preferences.version },
        });
        return parseWorkoutPreferences(updated.workoutPreferences);
      }),
  }),

  recommendation: router({
    /**
     * A read-only, inspectable draft. It never creates workout_sessions or
     * enters the existing draft/review/live state machine.
     */
    mine: protectedProcedure
      .input(recommendationContextSchema)
      .query(async ({ ctx, input }) => {
      const [profile] = await ctx.db
        .select({
          goal: clientProfiles.goal,
          activityLevel: clientProfiles.activityLevel,
          coachId: clientProfiles.coachId,
          workoutPreferences: clientProfiles.workoutPreferences,
        })
        .from(clientProfiles)
        .where(eq(clientProfiles.userId, ctx.user!.id))
        .limit(1);
      if (!profile) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Client profile not found' });
      }

      const activeProgram = await loadActiveProgram(ctx.db, ctx.user!.id, false);
      const activeCoachTemplate = selectCoachTemplateForWeekday(activeProgram?.days ?? [], input.localWeekday);
      const coachTemplateIds = activeCoachTemplate && activeProgram?.program.coachId === profile.coachId
        ? activeCoachTemplate.exercises.map((exercise) => exercise.exercise_id)
        : [];
      const exerciseVisibility = coachTemplateIds.length
        ? or(
            eq(exercises.isTemplate, true),
            eq(exercises.createdBy, ctx.user!.id),
            and(inArray(exercises.id, coachTemplateIds), eq(exercises.createdBy, profile.coachId!)),
          )
        : or(eq(exercises.isTemplate, true), eq(exercises.createdBy, ctx.user!.id));

      const [exerciseRows, recentSets, recentSessions] = await Promise.all([
        ctx.db.select().from(exercises)
          .where(exerciseVisibility),
        ctx.db
          .select({
            exerciseId: workoutSets.exerciseId,
            reps: workoutSets.reps,
            weightKg: workoutSets.weightKg,
            completedOn: workoutSessions.sessionDate,
            isWarmup: workoutSets.isWarmup,
          })
          .from(workoutSets)
          .innerJoin(workoutSessions, eq(workoutSets.sessionId, workoutSessions.id))
          .where(and(eq(workoutSessions.userId, ctx.user!.id), isNotNull(workoutSessions.completedAt)))
          .orderBy(desc(workoutSessions.sessionDate), desc(workoutSets.createdAt))
          .limit(100),
        ctx.db
          .select({ painFlags: workoutSessions.painFlags })
          .from(workoutSessions)
          .where(and(eq(workoutSessions.userId, ctx.user!.id), isNotNull(workoutSessions.completedAt)))
          .orderBy(desc(workoutSessions.sessionDate), desc(workoutSessions.createdAt))
          .limit(20),
      ]);
      const painRegions = recentSessions.flatMap((session) =>
        Array.isArray(session.painFlags)
          ? session.painFlags.flatMap((flag) => {
              if (typeof flag !== 'object' || flag === null || !('body_part' in flag)) return [];
              return typeof flag.body_part === 'string' ? [flag.body_part] : [];
            })
          : [],
      );
      // Keep the SQL predicate as the primary boundary, and filter again here
      // so a mocked, misconfigured, or privileged DB client cannot leak a
      // private exercise into the deterministic draft.
      const visibleExerciseRows = exerciseRows.filter((exercise) =>
        exercise.isTemplate === true
        || exercise.createdBy === ctx.user!.id
        || (coachTemplateIds.includes(exercise.id) && exercise.createdBy === profile.coachId),
      );

      const recommendationExercises: Exercise[] = visibleExerciseRows.map((exercise) => ({
        id: exercise.id,
        name: exercise.name,
        name_es: exercise.nameEs,
        name_el: exercise.nameEl,
        muscle_group: exercise.muscleGroup as MuscleGroup,
        secondary_muscles: exercise.secondaryMuscles,
        anatomy_activations: resolveMuscleActivations({
          name: exercise.name,
          equipment: exercise.equipment,
          muscleGroup: exercise.muscleGroup,
        }).map((activation) => activation.id),
        equipment: exercise.equipment,
        is_compound: exercise.isCompound ?? false,
        is_template: exercise.isTemplate ?? true,
        instructions: exercise.instructions,
        instructions_es: exercise.instructionsEs,
        instructions_el: exercise.instructionsEl,
        created_by: exercise.createdBy,
        created_at: exercise.createdAt ?? '',
      }));

      return buildWorkoutRecommendation({
        preferences: parseWorkoutPreferences(profile.workoutPreferences),
        profileGoal: profile.goal as Goal | null,
        profileActivity: profile.activityLevel as import('@/lib/types').ActivityLevel | null,
        asOf: input.localDate,
        exercises: recommendationExercises,
        recentSets: recentSets
          .filter((set): set is typeof set & { exerciseId: string } => Boolean(set.exerciseId))
          .map((set) => ({
            exerciseId: set.exerciseId,
            reps: set.reps,
            weightKg: set.weightKg,
            completedOn: set.completedOn,
            isWarmup: set.isWarmup ?? false,
          })),
        painRegions,
        activeCoachTemplate,
        missingCoachTemplateExerciseIds: coachTemplateIds.filter((id) => !visibleExerciseRows.some((exercise) => exercise.id === id)),
      });
    }),
  }),

  logs: router({
    /** Coach: a client's recent sessions with sets + exercise names. */
    forClient: coachProcedure
      .input(
        z.object({
          clientId: z.string().uuid(),
          limit: z.number().int().min(1).max(60).default(20),
        }),
      )
      .query(async ({ ctx, input }) => {
        await assertCanAccessClient(ctx.db, ctx.user!.id, ctx.profile!.role, input.clientId);

        const sessions = await ctx.db
          .select()
          .from(workoutSessions)
          .where(eq(workoutSessions.userId, input.clientId))
          .orderBy(desc(workoutSessions.sessionDate), desc(workoutSessions.createdAt))
          .limit(input.limit);

        const sessionIds = sessions.map((s) => s.id);
        const sets = sessionIds.length
          ? await ctx.db
              .select({
                id: workoutSets.id,
                sessionId: workoutSets.sessionId,
                exerciseId: workoutSets.exerciseId,
                setNumber: workoutSets.setNumber,
                weightKg: workoutSets.weightKg,
                reps: workoutSets.reps,
                rpe: workoutSets.rpe,
                isWarmup: workoutSets.isWarmup,
                isPr: workoutSets.isPr,
                exerciseName: exercises.name,
                exerciseNameEs: exercises.nameEs,
                exerciseNameEl: exercises.nameEl,
                muscleGroup: exercises.muscleGroup,
              })
              .from(workoutSets)
              .leftJoin(exercises, eq(workoutSets.exerciseId, exercises.id))
              .where(inArray(workoutSets.sessionId, sessionIds))
              .orderBy(workoutSets.setNumber)
          : [];

        return { sessions, sets };
      }),
  }),
});

// ── Shared loader ──────────────────────────────────────────────────────────

async function loadActiveProgram(db: Db, clientId: string, includeExerciseRows = true) {
  const [program] = await db
    .select()
    .from(workoutPrograms)
    .where(and(eq(workoutPrograms.clientId, clientId), eq(workoutPrograms.status, 'active')))
    .limit(1);

  if (!program) return null;

  const days = await db
    .select({
      id: workoutProgramDays.id,
      weekday: workoutProgramDays.weekday,
      sort: workoutProgramDays.sort,
      template: workoutTemplates,
    })
    .from(workoutProgramDays)
    .innerJoin(workoutTemplates, eq(workoutProgramDays.templateId, workoutTemplates.id))
    .where(eq(workoutProgramDays.programId, program.id))
    .orderBy(workoutProgramDays.weekday, workoutProgramDays.sort);

  const exerciseRows = includeExerciseRows
    ? await resolveTemplateExercises(db, days.map((d) => d.template))
    : [];

  return { program, days, exercises: exerciseRows };
}
