import { sql } from 'drizzle-orm';
import { bigint, boolean, check, date, integer, pgSchema, text, unique, uuid } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

const privateSchema = pgSchema('private');

/** Private, server-owned configuration for the single Ask Trophē pilot ledger. */
export const coachPilotBudgets = privateSchema.table('coach_pilot_budgets', {
  id: uuid('id').primaryKey(),
  scopeKey: text('scope_key').notNull(),
  organizationId: uuid('organization_id').notNull()
    .references(() => organizations.id, { onDelete: 'restrict' }),
  allowedActorIds: uuid('allowed_actor_ids').array().notNull(),
  capNanoUsd: bigint('cap_nano_usd', { mode: 'number' }).notNull().default(0),
  operatingTargetNanoUsd: bigint('operating_target_nano_usd', { mode: 'number' }).notNull().default(0),
  budgetDay: date('budget_day').notNull().default(sql`((statement_timestamp() AT TIME ZONE 'America/Bogota')::date)`),
  chargedNanoUsd: bigint('charged_nano_usd', { mode: 'number' }).notNull().default(0),
  attemptCount: integer('attempt_count').notNull().default(0),
  accountingBlocked: boolean('accounting_blocked').notNull().default(false),
}, (table) => [
  unique('coach_pilot_budgets_scope_key_key').on(table.scopeKey),
  check('coach_pilot_budgets_scope_key_check', sql`${table.scopeKey} = 'ask-trophe-shared'`),
  check('coach_pilot_budgets_allowed_actor_ids_check', sql`cardinality(${table.allowedActorIds}) BETWEEN 1 AND 16`),
  check('coach_pilot_budgets_cap_nano_usd_check', sql`${table.capNanoUsd} BETWEEN 0 AND 3000000000`),
  check('coach_pilot_budgets_operating_target_nano_usd_check', sql`${table.operatingTargetNanoUsd} BETWEEN 0 AND ${table.capNanoUsd}`),
  check('coach_pilot_budgets_charged_nano_usd_check', sql`${table.chargedNanoUsd} BETWEEN 0 AND 9007199254740991`),
  check('coach_pilot_budgets_attempt_count_check', sql`${table.attemptCount} BETWEEN 0 AND 4096`),
]);
