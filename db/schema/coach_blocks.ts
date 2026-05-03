/**
 * Trophē v0.3 — coach_blocks table.
 *
 * Phase 5: Letta-style editable coach blocks.
 *
 * A coach block is a named, human-editable text block that gets injected
 * into agent system prompts for a specific client. Coaches write/edit these
 * in the /coach/[clientId]/memory UI.
 *
 * Examples:
 *   block_label = "persona"
 *   content = "Nikos is a 32-year-old CrossFit athlete cutting for summer.
 *              He's lactose intolerant, dislikes fish, trains at 7am.
 *              Current target: 2,100 kcal / 160g protein / deficit phase."
 *
 *   block_label = "current_protocol"
 *   content = "Kavdas Phase 3 (weeks 9-12). Habit: protein every meal.
 *              Macro targets: 2,100 kcal, 160g P, 210g C, 70g F."
 *
 *   block_label = "flags"
 *   content = "Plateau detected since Apr 20. Review calories at next check-in."
 *
 * Versioning:
 *   Each edit increments `version`. Old versions are NOT stored (single row
 *   per client+label). For full history, use audit_log.
 *
 * Agent injection:
 *   agents/memory/coach-blocks.ts loads active blocks for a client
 *   and renders them as a `<coach_context>` XML section in the system prompt.
 *
 * RLS:
 *   Coaches can CRUD their own client blocks.
 *   Clients can read blocks the coach has marked visible (visible=true).
 */

import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  index,
  foreignKey,
  unique,
} from 'drizzle-orm/pg-core';
import { profiles } from './profiles';

export const coachBlocks = pgTable(
  'coach_blocks',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** The client this block is about. */
    clientId: uuid('client_id').notNull(),

    /** The coach who owns this block. */
    coachId: uuid('coach_id').notNull(),

    /**
     * Semantic label for the block. Free-form but conventionally:
     *   'persona'           — who the client is + goals
     *   'current_protocol'  — active coaching plan + targets
     *   'flags'             — open issues for the coach to address
     *   'nutrition_notes'   — dietary restrictions, preferences
     *   'workout_notes'     — training history, injuries, capacity
     */
    blockLabel: text('block_label').notNull(),

    /** The block content — markdown supported. */
    content: text('content').notNull().default(''),

    /** Monotonic version counter. Incremented on each save. */
    version: integer('version').notNull().default(1),

    /** UUID of the coach or agent who last edited this block. */
    editedBy: uuid('edited_by'),

    /**
     * Whether this block is injected into agent prompts.
     * Coaches can temporarily disable a block without deleting it.
     */
    active: boolean('active').notNull().default(true),

    /**
     * Whether the client can see this block (e.g. in their profile summary).
     * Sensitive coach notes (flags) default to invisible to clients.
     */
    visibleToClient: boolean('visible_to_client').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One block per label per client (coach can only have one active persona block per client)
    unique('coach_blocks_client_label_key').on(t.clientId, t.blockLabel),
    // Primary lookup: all active blocks for a client
    index('idx_cb_client_active').on(t.clientId, t.active),
    // Coach's view: all blocks they manage
    index('idx_cb_coach_client').on(t.coachId, t.clientId),
    foreignKey({
      columns: [t.clientId],
      foreignColumns: [profiles.id],
      name: 'coach_blocks_client_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.coachId],
      foreignColumns: [profiles.id],
      name: 'coach_blocks_coach_id_fkey',
    }).onDelete('cascade'),
  ],
);

export type InsertCoachBlock = typeof coachBlocks.$inferInsert;
export type SelectCoachBlock = typeof coachBlocks.$inferSelect;
