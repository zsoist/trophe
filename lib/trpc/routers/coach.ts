/**
 * Trophē v0.3 — tRPC coach router (Phase 7).
 *
 * Coach-facing procedures for notes, blocks, and dashboard data.
 *
 * Procedures:
 *   coach.notes.list      — coach notes for a client (paginated)
 *   coach.notes.create    — add a new coach note
 *   coach.blocks.list     — all active coach blocks for a client
 *   coach.blocks.upsert   — create/update a coach block
 *   coach.blocks.setVisibility — toggle client visibility
 */

import { z } from 'zod';
import { router, coachProcedure } from '../init';
import { coachNotes } from '@/db/schema/coach';
import { coachBlocks } from '@/db/schema/coach_blocks';
import { eq, and, desc } from 'drizzle-orm';
import { assertCanAccessClient } from '@/lib/auth/tenant-access';

// ── Router ────────────────────────────────────────────────────────────────

export const coachRouter = router({
  notes: router({
    list: coachProcedure
      .input(
        z.object({
          clientId: z.string().uuid(),
          limit: z.number().min(1).max(50).default(20),
          offset: z.number().min(0).default(0),
        }),
      )
      .query(async ({ ctx, input }) => {
        await assertCanAccessClient(ctx.db, ctx.user!.id, ctx.profile!.role, input.clientId);

        const rows = await ctx.db
          .select()
          .from(coachNotes)
          .where(eq(coachNotes.clientId, input.clientId))
          .orderBy(desc(coachNotes.createdAt))
          .limit(input.limit)
          .offset(input.offset);

        return rows;
      }),

    create: coachProcedure
      .input(
        z.object({
          clientId: z.string().uuid(),
          content: z.string().min(1).max(5000),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await assertCanAccessClient(ctx.db, ctx.user!.id, ctx.profile!.role, input.clientId);

        const [note] = await ctx.db
          .insert(coachNotes)
          .values({
            clientId: input.clientId,
            coachId: ctx.user!.id,
            note: input.content,
          })
          .returning();

        return note;
      }),
  }),

  blocks: router({
    list: coachProcedure
      .input(z.object({ clientId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        await assertCanAccessClient(ctx.db, ctx.user!.id, ctx.profile!.role, input.clientId);

        const rows = await ctx.db
          .select()
          .from(coachBlocks)
          .where(
            and(
              eq(coachBlocks.clientId, input.clientId),
              eq(coachBlocks.active, true),
            ),
          )
          .orderBy(coachBlocks.blockLabel);

        return rows;
      }),

    upsert: coachProcedure
      .input(
        z.object({
          clientId: z.string().uuid(),
          blockLabel: z.string().min(1).max(100),
          content: z.string().max(10000),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await assertCanAccessClient(ctx.db, ctx.user!.id, ctx.profile!.role, input.clientId);

        const existing = await ctx.db
          .select({ id: coachBlocks.id, version: coachBlocks.version })
          .from(coachBlocks)
          .where(
            and(
              eq(coachBlocks.clientId, input.clientId),
              eq(coachBlocks.blockLabel, input.blockLabel),
            ),
          )
          .limit(1);

        if (existing[0]) {
          const [updated] = await ctx.db
            .update(coachBlocks)
            .set({
              content: input.content,
              version: existing[0].version + 1,
              editedBy: ctx.user!.id,
              updatedAt: new Date(),
            })
            .where(eq(coachBlocks.id, existing[0].id))
            .returning();
          return updated;
        }

        const [created] = await ctx.db
          .insert(coachBlocks)
          .values({
            clientId: input.clientId,
            coachId: ctx.user!.id,
            blockLabel: input.blockLabel,
            content: input.content,
            version: 1,
            editedBy: ctx.user!.id,
            active: true,
            visibleToClient: false,
          })
          .returning();

        return created;
      }),

    setVisibility: coachProcedure
      .input(
        z.object({
          clientId: z.string().uuid(),
          blockLabel: z.string(),
          visible: z.boolean(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await assertCanAccessClient(ctx.db, ctx.user!.id, ctx.profile!.role, input.clientId);

        await ctx.db
          .update(coachBlocks)
          .set({ visibleToClient: input.visible, updatedAt: new Date() })
          .where(
            and(
              eq(coachBlocks.clientId, input.clientId),
              eq(coachBlocks.blockLabel, input.blockLabel),
            ),
          );

        return { ok: true };
      }),
  }),
});
