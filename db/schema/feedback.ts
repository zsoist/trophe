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
 * Beta feedback capture (Daily Nutrafit Step 4 — Closed Professional Beta).
 *
 * The roadmap's three questions ("What saves you time? / What's missing? /
 * What would you pay for?") need a place to land. Each submission is one row;
 * `category` tags which question it answers so we can slice responses later.
 *
 * `would_pay` is the free-text willingness-to-pay answer (kept separate from the
 * message so we can read pricing signal without NLP). `role` snapshots the
 * submitter's role at submit time (a coach who later becomes admin still counts
 * as coach feedback).
 *
 * RLS: a user manages their own rows; admins/super_admins read everything (so
 * the beta cohort's answers are visible in an admin view without exposing them
 * between users).
 */
export const feedback = pgTable('feedback', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  userId: uuid('user_id'),
  role: text(),
  category: text().notNull(),
  message: text().notNull(),
  wouldPay: text('would_pay'),
  pageContext: text('page_context'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
  index('idx_feedback_created').using('btree', table.createdAt.desc().nullsLast()),
  index('idx_feedback_user').using('btree', table.userId.asc().nullsLast().op('uuid_ops')),
  foreignKey({ columns: [table.userId], foreignColumns: [profiles.id], name: 'feedback_user_id_fkey' }),
  // Users insert/read/manage only their own feedback.
  pgPolicy('Users manage own feedback', {
    as: 'permissive', for: 'all', to: ['authenticated'],
    using: sql`(user_id = (SELECT auth.uid()))`,
    withCheck: sql`(user_id = (SELECT auth.uid()))`,
  }),
  // Admins/super_admins can read all feedback (beta review).
  pgPolicy('Admins read all feedback', {
    as: 'permissive', for: 'select', to: ['authenticated'],
    using: sql`(EXISTS (SELECT 1 FROM profiles p WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin','super_admin')))`,
  }),
  check('feedback_category_check', sql`category = ANY (ARRAY['saves_time'::text, 'missing'::text, 'would_pay'::text, 'general'::text])`),
]);
