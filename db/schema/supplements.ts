import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  date,
  jsonb,
  index,
  foreignKey,
  pgPolicy,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { profiles } from './profiles';

/** Coach-created supplement protocol templates. */
export const supplementProtocols = pgTable('supplement_protocols', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  coachId: uuid('coach_id'),
  name: text().notNull(),
  description: text(),
  supplements: jsonb().default([]).notNull(),
  goal: text(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
  foreignKey({ columns: [table.coachId], foreignColumns: [profiles.id], name: 'supplement_protocols_coach_id_fkey' }),
  pgPolicy('Coaches manage own protocols', { as: 'permissive', for: 'all', to: ['public'], using: sql`(coach_id = auth.uid())` }),
  pgPolicy('Clients view assigned protocols', { as: 'permissive', for: 'select', to: ['public'] }),
]);

/** Daily supplement tracking log (client-owned). */
export const supplementLog = pgTable('supplement_log', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  userId: uuid('user_id'),
  supplementName: text('supplement_name').notNull(),
  taken: boolean().default(true),
  loggedDate: date('logged_date').default(sql`CURRENT_DATE`).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
  index('idx_supplement_log_user_date').using('btree', table.userId.asc().nullsLast().op('date_ops'), table.loggedDate.asc().nullsLast().op('date_ops')),
  foreignKey({ columns: [table.userId], foreignColumns: [profiles.id], name: 'supplement_log_user_id_fkey' }).onDelete('cascade'),
  pgPolicy('Clients manage own supplement log2', { as: 'permissive', for: 'all', to: ['public'], using: sql`(user_id = auth.uid())` }),
  pgPolicy('Coaches view supplement log', { as: 'permissive', for: 'select', to: ['public'] }),
]);

/** Assignment of a protocol to a client. */
export const clientSupplements = pgTable('client_supplements', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  userId: uuid('user_id'),
  protocolId: uuid('protocol_id'),
  assignedBy: uuid('assigned_by'),
  active: boolean().default(true),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
  foreignKey({ columns: [table.assignedBy], foreignColumns: [profiles.id], name: 'client_supplements_assigned_by_fkey' }),
  foreignKey({ columns: [table.protocolId], foreignColumns: [supplementProtocols.id], name: 'client_supplements_protocol_id_fkey' }),
  foreignKey({ columns: [table.userId], foreignColumns: [profiles.id], name: 'client_supplements_user_id_fkey' }).onDelete('cascade'),
  pgPolicy('Clients view own supplements', { as: 'permissive', for: 'select', to: ['public'], using: sql`(user_id = auth.uid())` }),
  pgPolicy('Clients manage own supplement log', { as: 'permissive', for: 'all', to: ['public'] }),
  pgPolicy('Coaches manage client supplements', { as: 'permissive', for: 'all', to: ['public'] }),
]);
