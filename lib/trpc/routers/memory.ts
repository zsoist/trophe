/**
 * Trophē v0.3 — tRPC memory router (Phase 7).
 *
 * Procedures for memory chunk management.
 *
 * Procedures:
 *   memory.list     — active memory chunks for a user (coach or self)
 *   memory.delete   — soft-delete a chunk (set active=false)
 *   memory.stats    — counts by fact_type for the memory overview card
 */

import { z } from 'zod';
import { router, coachProcedure, protectedProcedure } from '../init';
import { memoryChunks } from '@/db/schema/memory_chunks';
import { clientProfiles } from '@/db/schema/profiles';
import { eq, and, desc, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { db as dbType } from '@/db/client';

// ── Guard helper ───────────────────────────────────────────────────────────

async function assertCanReadMemory(
  db: typeof dbType,
  requesterId: string,
  targetUserId: string,
  requesterRole: string | undefined,
): Promise<void> {
  if (requesterId === targetUserId) return; // own memory

  const isCoachRole =
    requesterRole === 'coach' || requesterRole === 'admin' || requesterRole === 'super_admin';
  if (!isCoachRole) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot read another user\'s memory' });
  }

  // Verify coach–client assignment
  const [assignment] = await db
    .select({ userId: clientProfiles.userId })
    .from(clientProfiles)
    .where(
      and(eq(clientProfiles.coachId, requesterId), eq(clientProfiles.userId, targetUserId)),
    )
    .limit(1);

  if (!assignment) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Client not assigned to you' });
  }
}

// ── Router ─────────────────────────────────────────────────────────────────

export const memoryRouter = router({
  // ── List active memory chunks ──────────────────────────────────────
  list: protectedProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        scope: z.enum(['user', 'session', 'agent', 'all']).default('all'),
        factType: z
          .enum(['preference', 'allergy', 'goal', 'event', 'observation', 'all'])
          .default('all'),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertCanReadMemory(
        ctx.db,
        ctx.user!.id,
        input.userId,
        ctx.profile?.role,
      );

      const conditions = [
        eq(memoryChunks.userId, input.userId),
        eq(memoryChunks.active, true),
        sql`(expires_at IS NULL OR expires_at > NOW())`,
      ];

      if (input.scope !== 'all') {
        conditions.push(
          eq(memoryChunks.scope, input.scope as 'user' | 'session' | 'agent'),
        );
      }

      if (input.factType !== 'all') {
        conditions.push(
          eq(
            memoryChunks.factType,
            input.factType as 'preference' | 'allergy' | 'goal' | 'event' | 'observation',
          ),
        );
      }

      const rows = await ctx.db
        .select({
          id: memoryChunks.id,
          factText: memoryChunks.factText,
          factType: memoryChunks.factType,
          scope: memoryChunks.scope,
          confidence: memoryChunks.confidence,
          salience: memoryChunks.salience,
          source: memoryChunks.source,
          retrievalCount: memoryChunks.retrievalCount,
          lastRetrievedAt: memoryChunks.lastRetrievedAt,
          expiresAt: memoryChunks.expiresAt,
          createdAt: memoryChunks.createdAt,
        })
        .from(memoryChunks)
        .where(and(...conditions))
        .orderBy(desc(memoryChunks.salience), desc(memoryChunks.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return rows;
    }),

  // ── Soft-delete a memory chunk ─────────────────────────────────────
  delete: coachProcedure
    .input(z.object({ chunkId: z.string().uuid(), userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertCanReadMemory(
        ctx.db,
        ctx.user!.id,
        input.userId,
        ctx.profile?.role,
      );

      await ctx.db
        .update(memoryChunks)
        .set({ active: false })
        .where(
          and(
            eq(memoryChunks.id, input.chunkId),
            eq(memoryChunks.userId, input.userId),
          ),
        );

      return { ok: true };
    }),

  // ── Stats: counts by fact_type ─────────────────────────────────────
  stats: protectedProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertCanReadMemory(
        ctx.db,
        ctx.user!.id,
        input.userId,
        ctx.profile?.role,
      );

      const result = await ctx.db.execute(
        sql`
          SELECT
            fact_type,
            COUNT(*)::int AS count
          FROM memory_chunks
          WHERE user_id = ${input.userId}
            AND active = true
            AND (expires_at IS NULL OR expires_at > NOW())
          GROUP BY fact_type
          ORDER BY fact_type
        `,
      );

      return result.rows as Array<{ fact_type: string; count: number }>;
    }),
});
