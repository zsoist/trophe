import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { writeArtifact } from './_shared';

type Check = {
  name: string;
  ok: boolean;
  detail: string;
};

function run(command: string, args: string[] = []): string {
  return execFileSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10_000,
  }).trim();
}

function tryRun(command: string, args: string[] = []): string | null {
  try {
    return run(command, args);
  } catch {
    return null;
  }
}

function succeeds(command: string, args: string[] = []): boolean {
  try {
    execFileSync(command, args, {
      cwd: process.cwd(),
      stdio: 'ignore',
      timeout: 10_000,
    });
    return true;
  } catch {
    return false;
  }
}

const dockerSocket = join(homedir(), '.orbstack', 'run', 'docker.sock');
const checks: Check[] = [];

const orbctlPath = tryRun('which', ['orbctl']);
checks.push({
  name: 'orbctl',
  ok: Boolean(orbctlPath),
  detail: orbctlPath ? orbctlPath : 'Install OrbStack and ensure orbctl is on PATH.',
});

const orbStatus = orbctlPath ? tryRun(orbctlPath, ['status']) : null;
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

const dockerPs = tryRun('docker', ['ps', '--format', '{{.Names}}']);
checks.push({
  name: 'Docker API',
  ok: dockerPs !== null,
  detail: dockerPs ?? 'Docker client cannot reach the OrbStack daemon. Run `orbctl start`.',
});

const supabaseBin = join(process.cwd(), 'node_modules', '.bin', 'supabase');
const supabaseVersion = existsSync(supabaseBin)
  ? tryRun(supabaseBin, ['--version'])
  : null;
checks.push({
  name: 'Supabase CLI',
  ok: supabaseVersion !== null,
  detail: supabaseVersion ?? 'Install the local CLI dependency with `npm install`.',
});

const configPath = join(process.cwd(), 'supabase', 'config.toml');
checks.push({
  name: 'supabase/config.toml',
  ok: existsSync(configPath),
  detail: existsSync(configPath) ? configPath : 'Restore `supabase/config.toml` from the repository.',
});

const supabaseRunning =
  existsSync(configPath) &&
  existsSync(supabaseBin) &&
  succeeds(supabaseBin, ['status']);
checks.push({
  name: 'Supabase local stack',
  ok: supabaseRunning,
  detail: supabaseRunning
    ? 'Local services responded successfully (credentials intentionally omitted).'
    : 'Local Supabase services are not running. Start them with `npm run db:local:start` after OrbStack is healthy.',
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
