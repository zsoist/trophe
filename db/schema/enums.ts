import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * 4-tier role hierarchy for Trophē v0.3.
 *
 * Privilege ladder (highest → lowest):
 *   super_admin  — Daniel R; full platform access, can promote/demote any role
 *   admin        — org-level administrators; manage coaches + clients within an org
 *   coach        — assign habits, view client data, write notes
 *   client       — default signup role; own-data access only
 *
 * "both" (legacy v0.2 role) is no longer a valid value. Migration 0001 coerces
 * existing 'both' rows to 'coach' before altering the column type.
 */
export const userRoleEnum = pgEnum('user_role', [
  'super_admin',
  'admin',
  'coach',
  'client',
]);
