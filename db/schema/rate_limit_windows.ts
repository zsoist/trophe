import { integer, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';

export const rateLimitWindows = pgTable('rate_limit_windows', {
  key: text().notNull(),
  windowStartedAt: timestamp('window_started_at', { withTimezone: true }).notNull(),
  requestCount: integer('request_count').notNull().default(1),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (table) => [
  unique('rate_limit_windows_key_window_key').on(table.key, table.windowStartedAt),
]);
