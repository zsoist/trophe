import { sql } from 'drizzle-orm';
import { boolean, numeric, pgPolicy, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

export const organizationAiBudgets = pgTable('organization_ai_budgets', {
  organizationId: uuid('organization_id')
    .primaryKey()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  dailyLimitUsd: numeric('daily_limit_usd', { precision: 12, scale: 4 }).notNull().default('5'),
  monthlyLimitUsd: numeric('monthly_limit_usd', { precision: 12, scale: 4 }).notNull().default('100'),
  alertThresholdPct: numeric('alert_threshold_pct', { precision: 5, scale: 2 }).notNull().default('80'),
  killSwitchActive: boolean('kill_switch_active').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, () => [
  pgPolicy('organization_ai_budgets_admin_select', {
    for: 'select',
    to: ['authenticated'],
    using: sql`private.is_admin_of(organization_id) OR private.is_super_admin()`,
  }),
  pgPolicy('organization_ai_budgets_admin_update', {
    for: 'update',
    to: ['authenticated'],
    using: sql`private.is_admin_of(organization_id) OR private.is_super_admin()`,
    withCheck: sql`private.is_admin_of(organization_id) OR private.is_super_admin()`,
  }),
]);
