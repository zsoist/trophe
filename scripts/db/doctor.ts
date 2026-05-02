import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { writeArtifact } from './_shared';

type Check = {
  name: string;
  ok: boolean;
  detail: string;
};

function run(command: string): string {
  return execSync(command, { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function tryRun(command: string): string | null {
  try {
    return run(command);
  } catch {
    return null;
  }
}

const dockerSocket = join(homedir(), '.orbstack', 'run', 'docker.sock');
const checks: Check[] = [];

const orbctlPath = tryRun('command -v orbctl');
checks.push({
  name: 'orbctl',
  ok: Boolean(orbctlPath),
  detail: orbctlPath ? orbctlPath : 'Install OrbStack and ensure orbctl is on PATH.',
});

const orbStatus = orbctlPath ? tryRun('orbctl status') : null;
checks.push({
  name: 'OrbStack status',
  ok: orbStatus === 'Running',
  detail: orbStatus ?? 'OrbStack did not respond. Start OrbStack from the app or run `orbctl start`.',
});

checks.push({
  name: 'OrbStack docker socket',
  ok: existsSync(dockerSocket),
  detail: existsSync(dockerSocket)
    ? dockerSocket
    : `Expected Docker socket at ${dockerSocket}. Run \`orbctl start\`.`,
});

const dockerPs = tryRun('docker ps --format "{{.Names}}"');
checks.push({
  name: 'Docker API',
  ok: dockerPs !== null,
  detail: dockerPs ?? 'Docker client cannot reach the OrbStack daemon. Run `orbctl start`.',
});

const supabaseVersion = tryRun('npx supabase --version');
checks.push({
  name: 'Supabase CLI',
  ok: supabaseVersion !== null,
  detail: supabaseVersion ?? 'Install the local CLI dependency with `npm install`.',
});

const configPath = join(process.cwd(), 'supabase', 'config.toml');
checks.push({
  name: 'supabase/config.toml',
  ok: existsSync(configPath),
  detail: existsSync(configPath) ? configPath : 'Run `npx supabase init` in the repo root.',
});

const supabaseStatus = existsSync(configPath) ? tryRun('npx supabase status -o pretty') : null;
checks.push({
  name: 'Supabase local stack',
  ok: supabaseStatus !== null,
  detail:
    supabaseStatus ??
    'Local Supabase services are not running. Start them with `npm run db:local:start` after OrbStack is healthy.',
});

const summary = checks.map((check) => `${check.ok ? 'OK' : 'FAIL'} ${check.name}: ${check.detail}`).join('\n');
writeArtifact('doctor.txt', `${summary}\n`);

for (const check of checks) {
  console.log(`${check.ok ? 'OK' : 'FAIL'} ${check.name}: ${check.detail}`);
}

if (checks.some((check) => !check.ok)) {
  console.error('\nCanonical remediation path:');
  console.error('1. `orbctl start`');
  console.error('2. `docker ps`');
  console.error('3. `npm install`');
  console.error('4. `npm run db:local:start`');
  console.error('5. `npm run db:bootstrap`');
  process.exit(1);
}
