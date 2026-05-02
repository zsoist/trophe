/**
 * Trophē v0.3 — memory_chunks table.
 *
 * Phase 5: Persistent client memory using the Mem0/Letta hybrid pattern,
 * ported from OpenBrain's memory_store.memory_chunks architecture.
 *
 * Each row is one extracted fact about a user (preference, allergy, goal, etc.).
 * Facts can be superseded when new information contradicts them — the old row
 * is not deleted; it's linked via `superseded_by` so history is traceable.
 *
 * Scopes:
 *   user    — persists indefinitely (365d TTL, auto-renewed on retrieval)
 *   session — per-chat context, expires in 30 days
 *   agent   — agent-specific memory (food-parse, habit-coach), indefinite
 *
 * Fact types:
 *   preference   — "prefers olive oil over butter"
 *   allergy      — "lactose intolerant" (high salience, always included)
 *   goal         — "wants to lose 5kg before summer"
 *   event        — "completed 14-day streak Apr 25" (historical)
 *   observation  — "eats late dinners consistently" (behavioral pattern)
 *
 * Embedding: Voyage v4 1024-dim vector — same model as Phase 4.
 * Added via raw SQL in migration (Drizzle lacks native pgvector support).
 * HNSW index built post-ingest.
 *
 * RLS: clients can only read their own memories.
 *      coaches can read memories of their assigned clients.
 *      Agents run as the DB owner (bypass RLS) — scoped by user_id in WHERE.
 */

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  real,
  boolean,
  smallint,
  timestamp,
  index,
  foreignKey,
} from 'drizzle-orm/pg-core';
import { profiles } from './profiles';

// ── Enums ──────────────────────────────────────────────────────────────────────
export const memoryScopeEnum = pgEnum('memory_scope', [
  'user',
  'session',
  'agent',
]);

export const memoryFactTypeEnum = pgEnum('memory_fact_type', [
  'preference',
  'allergy',
  'goal',
  'event',
  'observation',
]);

export const memorySourceEnum = pgEnum('memory_source', [
  'user_input',
  'agent_inference',
  'coach',
  'wearable',
]);

// ── Table ──────────────────────────────────────────────────────────────────────
export const memoryChunks = pgTable(
  'memory_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** Owner of this memory. RLS enforces read isolation. */
    userId: uuid('user_id').notNull(),

    /** Scope determines retention policy and retrieval context. */
    scope: memoryScopeEnum('scope').notNull().default('user'),

    /**
     * For scope='agent': which agent this memory belongs to.
     * e.g. 'food-parse', 'habit-coach', 'recipe-analyze'
     * NULL for user/session scope.
     */
    agentName: text('agent_name'),

    /**
     * For scope='session': conversation session ID.
     * Links all memories extracted in one chat session.
     */
    sessionId: text('session_id'),

    /** The distilled fact as a human-readable sentence. */
    factText: text('fact_text').notNull(),

    factType: memoryFactTypeEnum('fact_type').notNull().default('observation'),

    // embedding vector(1024) — added via raw SQL in migration.
    // Not in Drizzle schema (no native pgvector support).

    /**
     * LLM confidence in this fact (0–1).
     * Allergies inferred from single mention get lower confidence than
     * coach-confirmed ones.
     */
    confidence: real('confidence').notNull().default(0.8),

    source: memorySourceEnum('source').notNull().default('agent_inference'),

    /**
     * Letta-style supersedence: if a newer memory contradicts this one,
     * set superseded_by to the new memory's ID.
     * This row remains active = false but is not deleted (audit trail).
     */
    supersededBy: uuid('superseded_by'),
    active: boolean('active').notNull().default(true),

    /**
     * Priority for prompt packing. Higher = included first when token budget is tight.
     * Allergies: 1.0, goals: 0.8, observations: 0.5, events: 0.3
     * Auto-boosted on each retrieval (last_retrieved_at recency bonus).
     */
    salience: real('salience').notNull().default(0.5),

    /**
     * Expiry per scope:
     *   user scope:    NOW() + 365 days (auto-renewed on retrieval)
     *   session scope: NOW() + 30 days
     *   agent scope:   NULL (indefinite)
     * NULL = indefinite.
     */
    expiresAt: timestamp('expires_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastRetrievedAt: timestamp('last_retrieved_at', { withTimezone: true }),

    /** Incremented fire-and-forget on each retrieval (popularity signal for salience). */
    retrievalCount: smallint('retrieval_count').notNull().default(0),
  },
  (t) => [
    // Primary query pattern: user memories by scope + active, ordered by salience desc
    index('idx_mc_user_scope_active').on(t.userId, t.scope, t.active),
    // Agent-scoped memory lookup
    index('idx_mc_user_agent').on(t.userId, t.agentName),
    // Session memory lookup (short-lived context window)
    index('idx_mc_session').on(t.sessionId),
    // Supersedence chain traversal
    index('idx_mc_superseded_by').on(t.supersededBy),
    // Expiry sweep (nightly cron deletes/archives expired rows)
    index('idx_mc_expires_at').on(t.expiresAt),
    // FK: memory belongs to a user profile
    foreignKey({
      columns: [t.userId],
      foreignColumns: [profiles.id],
      name: 'memory_chunks_user_id_fkey',
    }).onDelete('cascade'),
    // Self-referential FK for supersedence chain
    // Note: omitted here to avoid circular ref at creation time;
    // enforced at application layer. Added as raw SQL in migration.
  ],
);

export type InsertMemoryChunk = typeof memoryChunks.$inferInsert;
export type SelectMemoryChunk = typeof memoryChunks.$inferSelect;
