/**
 * Trophē v0.3 — tRPC clients router (Phase 7).
 *
 * Coach-facing procedures for client management.
 * All procedures require coach role or above.
 *
 * Procedures:
 *   clients.list       — paginated list of coach's assigned clients
 *   clients.get        — single client profile (coach must own the client)
 *   clients.search     — search by name/email (coach's clients only)
 *   clients.summary    — aggregated stats for the coach dashboard card
 */

import { z } from 'zod';
import { router, coachProcedure } from '../init';
import { profiles, clientProfiles } from '@/db/schema/profiles';
import { eq, and, ilike, or, desc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

export const clientsRouter = router({
  // ── List all clients assigned to this coach ──────────────────────────
  list: coachProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const coachId = ctx.user!.id;

      const rows = await ctx.db
        .select({
          id: profiles.id,
          fullName: profiles.fullName,
          email: profiles.email,
          avatarUrl: profiles.avatarUrl,
          createdAt: profiles.createdAt,
          clientProfile: {
            targetCalories: clientProfiles.targetCalories,
            targetProteinG: clientProfiles.targetProteinG,
            targetCarbsG: clientProfiles.targetCarbsG,
            targetFatG: clientProfiles.targetFatG,
            goal: clientProfiles.goal,
          },
        })
        .from(clientProfiles)
        .innerJoin(profiles, eq(profiles.id, clientProfiles.userId))
        .where(eq(clientProfiles.coachId, coachId))
        .orderBy(desc(profiles.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return { clients: rows, total: rows.length };
    }),

  // ── Single client detail ─────────────────────────────────────────────
  get: coachProcedure
    .input(z.object({ clientId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const coachId = ctx.user!.id;

      const [row] = await ctx.db
        .select({
          id: profiles.id,
          fullName: profiles.fullName,
          email: profiles.email,
          avatarUrl: profiles.avatarUrl,
          language: profiles.language,
          createdAt: profiles.createdAt,
          clientProfile: clientProfiles,
        })
        .from(clientProfiles)
        .innerJoin(profiles, eq(profiles.id, clientProfiles.userId))
        .where(
          and(
            eq(clientProfiles.userId, input.clientId),
            eq(clientProfiles.coachId, coachId),
          ),
        )
        .limit(1);

      if (!row) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Client not found or not assigned to you',
        });
      }

      return row;
    }),

  // ── Search clients by name or email ──────────────────────────────────
  search: coachProcedure
    .input(z.object({ query: z.string().min(1).max(100) }))
    .query(async ({ ctx, input }) => {
      const coachId = ctx.user!.id;
      const q = `%${input.query}%`;

      const rows = await ctx.db
        .select({
          id: profiles.id,
          fullName: profiles.fullName,
          email: profiles.email,
          avatarUrl: profiles.avatarUrl,
        })
        .from(clientProfiles)
        .innerJoin(profiles, eq(profiles.id, clientProfiles.userId))
        .where(
          and(
            eq(clientProfiles.coachId, coachId),
            or(ilike(profiles.fullName, q), ilike(profiles.email, q)),
          ),
        )
        .limit(10);

      return rows;
    }),
});
