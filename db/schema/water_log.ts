import {
  pgTable,
  uuid,
  timestamp,
  integer,
  date,
  index,
  foreignKey,
  pgPolicy,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { profiles } from './profiles';

/** Daily water intake entries (in millilitres). */
export const waterLog = pgTable('water_log', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  userId: uuid('user_id'),
  loggedDate: date('logged_date').default(sql`CURRENT_DATE`).notNull(),
  amountMl: integer('amount_ml').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
  index('idx_water_log_user_date').using('btree', table.userId.asc().nullsLast().op('uuid_ops'), table.loggedDate.asc().nullsLast().op('date_ops')),
  foreignKey({ columns: [table.userId], foreignColumns: [profiles.id], name: 'water_log_user_id_fkey' }).onDelete('cascade'),
  pgPolicy('Clients manage own water log', { as: 'permissive', for: 'all', to: ['public'], using: sql`(user_id = auth.uid())` }),
  pgPolicy('Coaches view client water log', { as: 'permissive', for: 'select', to: ['public'] }),
]);
