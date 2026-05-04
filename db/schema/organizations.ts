import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  foreignKey,
  pgPolicy,
  unique,
  check,
  jsonb,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { userRoleEnum } from './enums';
import { profiles } from './profiles';

/**
 * Multi-tenancy tables (Phase 1 additions).
 *
 * `organizations` — one org per coach (auto-created on coach signup).
 *   Every coach's clients inherit coach.org_id. Phase 2+ will allow admins to
 *   manage multiple coaches within one org.
 *
 * `organization_members` — join table linking users to orgs with a per-member role.
 *   Enforces that a user belongs to at most one org (UNIQUE on user_id).
 *
 * RLS: org members can SELECT their own org row; org admins can UPDATE.
 * Super admins bypass RLS via the `is_super_admin()` PG helper in policies/helpers.sql.
 */

export const organizations = pgTable('organizations', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  name: text().notNull(),
  /** URL-safe slug for subdomain routing (Phase 8+). */
  slug: text().notNull(),
  ownerId: uuid('owner_id'),
  plan: text().default('free').notNull(),
  billingEmail: text('billing_email'),
  stripeCustomerId: text('stripe_customer_id'),
  stripeConnectAccountId: text('stripe_connect_account_id'),
  subscriptionStatus: text('subscription_status').default('not_configured').notNull(),
  planLimits: jsonb('plan_limits').default({ coaches: 1, clients: 25 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
  unique('organizations_slug_key').on(table.slug),
  foreignKey({
    columns: [table.ownerId],
    foreignColumns: [profiles.id],
    name: 'organizations_owner_id_fkey',
  }).onDelete('set null'),
  pgPolicy('Org members can view own org', { as: 'permissive', for: 'select', to: ['public'],
    using: sql`(id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()))` }),
  pgPolicy('Org admins can update org', { as: 'permissive', for: 'update', to: ['public'] }),
  pgPolicy('Super admins full org access', { as: 'permissive', for: 'all', to: ['public'] }),
  check('organizations_plan_check', sql`plan = ANY (ARRAY['free'::text, 'pro'::text, 'enterprise'::text])`),
  check('organizations_subscription_status_check', sql`subscription_status = ANY (ARRAY['not_configured'::text, 'trialing'::text, 'active'::text, 'past_due'::text, 'canceled'::text])`),
]);

export const organizationMembers = pgTable('organization_members', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  orgId: uuid('org_id').notNull(),
  userId: uuid('user_id').notNull(),
  role: userRoleEnum('role').default('client').notNull(),
  invitedBy: uuid('invited_by'),
  joinedAt: timestamp('joined_at', { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
  index('idx_org_members_org').using('btree', table.orgId.asc().nullsLast().op('uuid_ops')),
  index('idx_org_members_user').using('btree', table.userId.asc().nullsLast().op('uuid_ops')),
  foreignKey({
    columns: [table.orgId],
    foreignColumns: [organizations.id],
    name: 'organization_members_org_id_fkey',
  }).onDelete('cascade'),
  foreignKey({
    columns: [table.userId],
    foreignColumns: [profiles.id],
    name: 'organization_members_user_id_fkey',
  }).onDelete('cascade'),
  foreignKey({
    columns: [table.invitedBy],
    foreignColumns: [profiles.id],
    name: 'organization_members_invited_by_fkey',
  }).onDelete('set null'),
  unique('organization_members_org_user_key').on(table.orgId, table.userId),
  pgPolicy('Members view own membership', { as: 'permissive', for: 'select', to: ['public'],
    using: sql`(user_id = auth.uid())` }),
  pgPolicy('Org admins manage members', { as: 'permissive', for: 'all', to: ['public'] }),
]);
