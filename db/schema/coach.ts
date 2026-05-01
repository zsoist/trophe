import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  foreignKey,
  pgPolicy,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { profiles } from './profiles';

/**
 * Coach-written session notes per client.
 * Client has SELECT-only access (they can read notes about themselves).
 */
export const coachNotes = pgTable('coach_notes', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  coachId: uuid('coach_id'),
  clientId: uuid('client_id'),
  note: text().notNull(),
  sessionType: text('session_type'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
  index('idx_coach_notes_client').using('btree', table.clientId.asc().nullsLast().op('uuid_ops')),
  foreignKey({ columns: [table.clientId], foreignColumns: [profiles.id], name: 'coach_notes_client_id_fkey' }),
  foreignKey({ columns: [table.coachId], foreignColumns: [profiles.id], name: 'coach_notes_coach_id_fkey' }),
  pgPolicy('Coaches manage own notes', { as: 'permissive', for: 'all', to: ['public'], using: sql`(coach_id = auth.uid())` }),
  pgPolicy('Clients view notes about them', { as: 'permissive', for: 'select', to: ['public'] }),
  check('coach_notes_session_type_check', sql`session_type = ANY (ARRAY['check_in'::text, 'progression'::text, 'concern'::text, 'general'::text])`),
]);
