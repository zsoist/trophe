import {
  pgTable,
  uuid,
  text,
  timestamp,
  real,
  date,
  index,
  foreignKey,
  pgPolicy,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { profiles } from './profiles';

/** Body composition snapshots logged by the client. */
export const measurements = pgTable('measurements', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  userId: uuid('user_id'),
  measuredDate: date('measured_date').default(sql`CURRENT_DATE`).notNull(),
  weightKg: real('weight_kg'),
  bodyFatPct: real('body_fat_pct'),
  waistCm: real('waist_cm'),
  notes: text(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
  index('idx_measurements_user_date').using('btree', table.userId.asc().nullsLast().op('date_ops'), table.measuredDate.asc().nullsLast().op('date_ops')),
  foreignKey({ columns: [table.userId], foreignColumns: [profiles.id], name: 'measurements_user_id_fkey' }).onDelete('cascade'),
  pgPolicy('Clients manage own measurements', { as: 'permissive', for: 'all', to: ['public'], using: sql`(user_id = auth.uid())` }),
  pgPolicy('Coaches view client measurements', { as: 'permissive', for: 'select', to: ['public'] }),
]);
