/**
 * Coach <-> client messaging. Thread = (coach_id, client_id) pair.
 * Phase 1 of coach module (Michael Kavdas call, 2026-06-12).
 */
import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  foreignKey,
  check,
  pgPolicy,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { profiles } from './profiles';

export const messages = pgTable('messages', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  coachId: uuid('coach_id').notNull(),
  clientId: uuid('client_id').notNull(),
  senderRole: text('sender_role').notNull(),
  body: text().notNull(),
  readAt: timestamp('read_at', { withTimezone: true, mode: 'string' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  index('idx_messages_thread').using('btree', table.coachId.asc().nullsLast().op('uuid_ops'), table.clientId.asc().nullsLast().op('uuid_ops'), table.createdAt.desc().nullsFirst()),
  index('idx_messages_client').using('btree', table.clientId.asc().nullsLast().op('uuid_ops'), table.createdAt.desc().nullsFirst()),
  foreignKey({ columns: [table.coachId], foreignColumns: [profiles.id], name: 'messages_coach_id_fkey' }).onDelete('cascade'),
  foreignKey({ columns: [table.clientId], foreignColumns: [profiles.id], name: 'messages_client_id_fkey' }).onDelete('cascade'),
  check('messages_sender_role_check', sql`sender_role = ANY (ARRAY['coach'::text, 'client'::text])`),
  pgPolicy('messages_coach_all', { as: 'permissive', for: 'all', to: ['authenticated'],
    using: sql`coach_id = (SELECT auth.uid()) AND private.is_coach_of(client_id)`,
    withCheck: sql`coach_id = (SELECT auth.uid()) AND private.is_coach_of(client_id) AND sender_role = 'coach'` }),
  pgPolicy('messages_client_select', { as: 'permissive', for: 'select', to: ['authenticated'], using: sql`client_id = (SELECT auth.uid())` }),
  // withCheck mirrors SQL migration 0026: a client may only insert its own
  // messages as sender_role 'client' — blocks coach-impersonation at the RLS layer.
  pgPolicy('messages_client_insert', { as: 'permissive', for: 'insert', to: ['authenticated'],
    withCheck: sql`client_id = (SELECT auth.uid()) AND sender_role = 'client'` }),
  pgPolicy('messages_client_mark_read', { as: 'permissive', for: 'update', to: ['authenticated'],
    using: sql`client_id = (SELECT auth.uid())`, withCheck: sql`client_id = (SELECT auth.uid())` }),
]);

export type SelectMessage = typeof messages.$inferSelect;
