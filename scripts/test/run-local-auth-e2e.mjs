#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import {
  assertLoopbackDatabaseUrl,
  assertLoopbackSupabaseUrl,
  assertAuthUserAbsent,
  assertSupabaseAffectedRow,
  buildLocalPlaywrightEnv,
  buildLocalThemePerformanceEnv,
  cleanupFixtureResources,
  formatLocalE2EError,
  localE2ECachePath,
  localE2EDisplayName,
  localE2EDateKey,
  parseSupabaseStatusEnv,
  retryLocalE2EOperation,
  resolveLocalPlaywrightArgs,
  resolveSupabaseCli,
  withFixtureCleanup,
  withDisposableUsers,
} from './local-auth-e2e-core.mjs';

const TEST_SPECS = [
  'e2e/food-error-states.spec.ts',
  'e2e/microphone-flows.spec.ts',
  'e2e/settings-flows.spec.ts',
  'e2e/authenticated-role-flows.spec.ts',
  'e2e/theme-accessibility.spec.ts',
];

function localStatus() {
  const supabaseBin = resolveSupabaseCli();
  const result = spawnSync(supabaseBin, ['status', '-o', 'env'], {
    encoding: 'utf8',
    env: process.env,
  });
  if (result.status !== 0) throw new Error('local Supabase status is unavailable');
  const status = parseSupabaseStatusEnv(result.stdout);
  assertLoopbackSupabaseUrl(status.API_URL);
  assertLoopbackDatabaseUrl(status.DB_URL);
  return status;
}

function credential(role) {
  const token = randomUUID();
  return {
    email: `codex-e2e-${role}-${token}@local.invalid`,
    password: `${randomUUID()}Aa1!`,
    role,
  };
}

/** Deletes fixture-owned rows whose legacy foreign keys intentionally do not cascade. */
export async function cleanupUserOwnedRows(service, userId) {
  const { error } = await service.from('workout_templates').delete().eq('created_by', userId);
  if (error) throw new Error('local E2E owned rows cleanup failed');
}

function adminAdapter(service) {
  return {
    async createUser(user) {
      const { data, error } = await service.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true,
        user_metadata: {
          full_name: localE2EDisplayName(user.role),
          local_e2e: true,
        },
      });
      if (error || !data.user) throw new Error('local auth user creation failed');
      return { id: data.user.id };
    },

    async provisionProfile(id, user) {
      const { error: profileError } = await service.from('profiles').upsert({
        id,
        full_name: localE2EDisplayName(user.role),
        email: user.email,
        role: user.role,
        language: 'en',
        timezone: 'UTC',
      });
      if (profileError) throw new Error('local E2E profile provisioning failed');

      if (user.role === 'client') {
        const { error: clientError } = await service.from('client_profiles').upsert({
          user_id: id,
          age: 30,
          sex: 'male',
          height_cm: 178,
          weight_kg: 75,
          activity_level: 'moderate',
          goal: 'health',
          target_calories: 2_200,
          target_protein_g: 140,
          target_carbs_g: 240,
          target_fat_g: 70,
          coaching_phase: 'active',
        }, { onConflict: 'user_id' });
        if (clientError) throw new Error('local E2E client profile provisioning failed');
      }
    },

    async deleteUser(id) {
      await cleanupUserOwnedRows(service, id);
      const { error } = await service.auth.admin.deleteUser(id);
      if (error) throw new Error('local E2E user cleanup failed');
      assertAuthUserAbsent(
        await service.auth.admin.getUserById(id),
        'user cleanup',
        id,
      );
    },
  };
}

/**
 * Runs a zero-paid local role fixture. The default remains the authenticated
 * Playwright suite; callers may provide a disposable-role callback instead.
 */
export async function runLocalAuthenticatedE2E({ executeWithDisposableRoles, playwrightArgs = TEST_SPECS } = {}) {
  const status = localStatus();
  const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const users = [
    credential('client'),
    credential('coach'),
    credential('super_admin'),
  ];
  const credentials = {
    client: users[0],
    coach: users[1],
    admin: users[2],
  };
  const userIds = new Map();
  const disposableAdmin = adminAdapter(service);
  const childEnv = buildLocalPlaywrightEnv(process.env, status, credentials);
  const nextDistDir = localE2ECachePath(process.cwd());
  if (existsSync(nextDistDir)) {
    throw new Error(`refusing to replace existing local E2E Next cache path: ${nextDistDir}`);
  }
  mkdirSync(nextDistDir);
  childEnv.NEXT_DIST_DIR = 'local-e2e';

  return withDisposableUsers({
    admin: {
      ...disposableAdmin,
      async createUser(user) {
        const created = await disposableAdmin.createUser(user);
        userIds.set(user.role, created.id);
        return created;
      },
    },
    users,
    execute: async () => {
      const clientId = userIds.get('client');
      const coachId = userIds.get('coach');
      if (!clientId || !coachId) throw new Error('local E2E relationship users are unavailable');
      childEnv.E2E_CLIENT_ID = clientId;
      const { error: linkError } = await service
        .from('client_profiles')
        .update({ coach_id: coachId })
        .eq('user_id', clientId);
      if (linkError) throw new Error('local E2E coach relationship provisioning failed');

      const now = new Date();
      const jsDay = now.getDay();
      const dayOfWeek = jsDay === 0 ? 6 : jsDay - 1;
      const loggedDate = localE2EDateKey(now);
      const { error: nutritionFixtureError } = await service.from('food_log').insert({
        user_id: clientId,
        logged_date: loggedDate,
        meal_type: 'lunch',
        food_name: 'Beans',
        quantity: 1,
        unit: 'serving',
        calories: 230,
        protein_g: 14,
        carbs_g: 40,
        fat_g: 1,
        fiber_g: 13,
        sugar_g: null,
        source: 'natural_language',
      });
      if (nutritionFixtureError) throw new Error('local E2E nutrition fixture provisioning failed');

      const { error: mealPlanFixtureError } = await service.from('meal_plan_entries').insert({
        client_id: clientId,
        coach_id: coachId,
        day_of_week: dayOfWeek,
        meal_slot: 'lunch',
        description: 'Beans, rice, avocado, and grilled beef',
      });
      if (mealPlanFixtureError) throw new Error('local E2E meal-plan fixture provisioning failed');

      const organizationSlug = `codex-local-matrix-${randomUUID()}`;
      const { data: organization, error: organizationError } = await service
        .from('organizations')
        .insert({
          name: 'Codex local matrix organization',
          slug: organizationSlug,
          owner_id: coachId,
          plan: 'free',
          subscription_status: 'not_configured',
        })
        .select('id')
        .maybeSingle();
      if (organizationError || !organization) throw new Error('local E2E organization provisioning failed');
      childEnv.E2E_TEST_ORG_ID = organization.id;
      childEnv.E2E_TEST_ORG_SLUG = organizationSlug;
      childEnv.E2E_CLIENT_FIRST_NAME = localE2EDisplayName('client');

      return withFixtureCleanup({
        execute: async () => {
          if (executeWithDisposableRoles) {
            return executeWithDisposableRoles({
              status,
              env: buildLocalThemePerformanceEnv(childEnv, credentials),
            });
          }
          const playwrightBin = path.resolve('node_modules/@playwright/test/cli.js');
          const result = spawnSync(
            process.execPath,
            [playwrightBin, 'test', '--workers=1', ...playwrightArgs],
          { stdio: 'inherit', env: childEnv },
        );
          if (result.error || result.status !== 0) {
            throw new Error(`authenticated E2E failed with status ${result.status ?? 1}`);
          }
        },
        cleanup: async () => {
          await cleanupFixtureResources({
            relationshipCleanup: () => retryLocalE2EOperation(
              () => service.from('client_profiles').update({ coach_id: null }).eq('user_id', clientId).select('user_id'),
              'client relationship cleanup',
              { validateResult: (result, operation) => assertSupabaseAffectedRow(result, operation, clientId, 'user_id') },
            ),
            organizationCleanup: () => retryLocalE2EOperation(
              () => service.from('organizations').delete().eq('id', organization.id).select('id'),
              'organization cleanup',
              { validateResult: (result, operation) => assertSupabaseAffectedRow(result, operation, organization.id) },
            ),
          });
        },
      });
    },
  }).finally(() => {
    rmSync(nextDistDir, { recursive: true, force: true });
  });
}

const entrypoint = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : '';
if (import.meta.url === entrypoint) {
  runLocalAuthenticatedE2E({
    playwrightArgs: resolveLocalPlaywrightArgs(process.argv.slice(2), TEST_SPECS),
  })
    .then(() => {
      process.stdout.write('Authenticated local E2E passed; disposable users removed.\n');
    })
    .catch((error) => {
      process.stderr.write(`Authenticated local E2E failed; cleanup attempted: ${formatLocalE2EError(error)}\n`);
      process.exitCode = 1;
    });
}
