/**
 * Trophē v0.3 — agent_conversation table.
 *
 * Phase 5: Immutable conversation history for all agent interactions.
 *
 * Unlike agent_runs (which tracks cost/telemetry per LLM call),
 * agent_conversation stores the full message content — enabling:
 *   1. Memory extraction (memory_write.ts reads recent turns for context)
 *   2. Coach auditability ("what did the AI tell this client?")
 *   3. Regression testing (replay historical inputs to measure accuracy drift)
 *   4. Conversation resumption (restore context across sessions)
 *
 * Design choices:
 *   - Immutable: rows are never updated, only appended.
 *   - session_id groups messages into one logical conversation.
 *   - tool_calls jsonb stores structured tool use for auditability.
 *   - Retention: purged after 90 days by nightly cron (configurable).
 *
 * RLS:
 *   Clients can only read their own conversation rows.
 *   Coaches can read conversations of assigned clients.
 */

import {
  pgTable,
  uuid,
  text,
  real,
  integer,
  jsonb,
  timestamp,
  index,
  check,
  foreignKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { profiles } from './profiles';

export const agentConversation = pgTable(
  'agent_conversation',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** User this conversation belongs to. */
    userId: uuid('user_id').notNull(),

    /**
     * Agent that generated this turn.
     * Matches agents/router/policies.ts TaskName values:
     *   'food_parse', 'recipe_analyze', 'coach_insight', 'habit_coach', etc.
     */
    agentName: text('agent_name').notNull(),

    /**
     * Groups messages into one logical conversation.
     * Client generates a session_id at the start of each chat.
     * Same session_id = same conversation thread.
     */
    sessionId: text('session_id').notNull(),

    /**
     * Message role: 'user' | 'assistant' | 'system' | 'tool'
     * Follows the OpenAI/Anthropic message role convention.
     */
    role: text('role').notNull(),

    /** The full message content. */
    content: text('content').notNull(),

    /**
     * Structured tool call data (if role='tool' or assistant called tools).
     * Shape: [{ name, input, output, error? }]
     */
    toolCalls: jsonb('tool_calls'),

    /** Input tokens for this turn (assistant turns only). */
    tokensIn: integer('tokens_in'),

    /** Output tokens for this turn (assistant turns only). */
    tokensOut: integer('tokens_out'),

    /** Estimated USD cost (assistant turns only). */
    costUsd: real('cost_usd'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Session timeline: all messages in a session, ordered
    index('idx_ac_session_created').on(t.sessionId, t.createdAt),
    // User history lookup
    index('idx_ac_user_agent_created').on(t.userId, t.agentName, t.createdAt),
    // Memory extraction: recent assistant turns for a user
    index('idx_ac_user_created').on(t.userId, t.createdAt),
    check(
      'agent_conversation_role_check',
      sql`role IN ('user', 'assistant', 'system', 'tool')`,
    ),
    foreignKey({
      columns: [t.userId],
      foreignColumns: [profiles.id],
      name: 'agent_conversation_user_id_fkey',
    }).onDelete('cascade'),
  ],
);

export type InsertAgentConversation = typeof agentConversation.$inferInsert;
export type SelectAgentConversation = typeof agentConversation.$inferSelect;
