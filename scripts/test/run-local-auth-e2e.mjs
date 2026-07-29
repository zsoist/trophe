#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import {
  assertLoopbackDatabaseUrl,
  assertLoopbackSupabaseUrl,
  buildLocalPlaywrightEnv,
  parseSupabaseStatusEnv,
  withDisposableUsers,
} from './local-auth-e2e-core.mjs';

const TEST_SPECS = [
  'e2e/food-error-states.spec.ts',
  'e2e/settings-flows.spec.ts',
  'e2e/authenticated-role-flows.spec.ts',
];

function localStatus() {
  const supabaseBin = path.resolve('node_modules/.bin/supabase');
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

function adminAdapter(service) {
  return {
    async createUser(user) {
      const { data, error } = await service.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true,
        user_metadata: {
          full_name: `Codex E2E ${user.role}`,
          local_e2e: true,
        },
      });
      if (error || !data.user) throw new Error('local auth user creation failed');
      return { id: data.user.id };
    },

    async provisionProfile(id, user) {
      const { error: profileError } = await service.from('profiles').upsert({
        id,
        full_name: `Codex E2E ${user.role}`,
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
      const { error } = await service.auth.admin.deleteUser(id);
      if (error) throw new Error('local E2E user cleanup failed');
    },
  };
}

export async function runLocalAuthenticatedE2E() {
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
  const childEnv = buildLocalPlaywrightEnv(process.env, status, credentials);

  return withDisposableUsers({
    admin: adminAdapter(service),
    users,
    execute: async () => {
      const playwrightBin = path.resolve('node_modules/@playwright/test/cli.js');
      const result = spawnSync(
        process.execPath,
        [playwrightBin, 'test', '--workers=1', ...TEST_SPECS],
        { stdio: 'inherit', env: childEnv },
      );
      if (result.error || result.status !== 0) {
        throw new Error(`authenticated E2E failed with status ${result.status ?? 1}`);
      }
    },
  });
}

const entrypoint = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : '';
if (import.meta.url === entrypoint) {
  runLocalAuthenticatedE2E()
    .then(() => {
      process.stdout.write('Authenticated local E2E passed; disposable users removed.\n');
    })
    .catch(() => {
      process.stderr.write('Authenticated local E2E failed; cleanup attempted.\n');
      process.exitCode = 1;
    });
}
