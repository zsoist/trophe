import { pgSchema, uuid, text, jsonb, timestamp, unique } from 'drizzle-orm/pg-core';

/**
 * Supabase `auth` schema shim.
 *
 * In production this schema is owned by Supabase Auth service. On the local
 * Mac Mini dev stack it's a minimal shim created by `scripts/db/bootstrap-local.sh`
 * so that `profiles.id → auth.users.id` FKs resolve.
 *
 * Drizzle reads this via `schemaFilter: ['public', 'auth']` in drizzle.config.ts
 * so cross-schema relations type-check correctly.
 */
export const authSchema = pgSchema('auth');

export const usersInAuth = authSchema.table('users', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  email: text(),
  rawAppMetaData: jsonb('raw_app_meta_data').default({}),
  rawUserMetaData: jsonb('raw_user_meta_data').default({}),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
  unique('users_email_key').on(table.email),
]);
