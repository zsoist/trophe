import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

function assert(name: string, ok: boolean, detail: string): void {
  if (!ok) {
    throw new Error(`${name}: ${detail}`);
  }
  console.log(`✓ ${name}`);
}

const workflow = read('.github/workflows/ci.yml');
const packageJson = JSON.parse(read('package.json')) as { scripts?: Record<string, string> };
const nextConfig = read('next.config.ts');
const proxy = read('proxy.ts');
const routerPolicies = read('agents/router/policies.ts');
const supabaseConfig = read('supabase/config.toml');

assert(
  'CI runs on main',
  workflow.includes('branches: [main]') && !workflow.includes('v0.3-overhaul'),
  'workflow must protect main as the production branch and not reference archived branches',
);

assert(
  'CI has Postgres service',
  workflow.includes('pgvector/pgvector') &&
    workflow.includes('npm run db:bootstrap') &&
    workflow.includes('npm run db:verify') &&
    workflow.includes('npm run db:explain'),
  'workflow must run the DB bootstrap and verification scripts against a pgvector-capable Postgres service',
);

assert(
  'CI does not deploy production',
  !workflow.includes('vercel --yes --prod') && !workflow.includes('--prod'),
  'production deploys must remain operator-approved only',
);

assert(
  'E2E script exists',
  packageJson.scripts?.['test:e2e'] === 'playwright test',
  'package.json must expose the Playwright smoke suite',
);

assert(
  'DB scripts exist',
  Boolean(packageJson.scripts?.['db:doctor']) &&
    Boolean(packageJson.scripts?.['db:verify']) &&
    Boolean(packageJson.scripts?.['db:explain']) &&
    Boolean(packageJson.scripts?.['db:local:start']),
  'package.json must expose the canonical local DB tooling',
);

assert(
  'Security headers configured',
  nextConfig.includes('Content-Security-Policy') &&
    nextConfig.includes('X-Frame-Options') &&
    nextConfig.includes('X-Content-Type-Options'),
  'next.config.ts must define core browser security headers',
);

assert(
  'Router owns AI task policies',
  ['food_parse', 'recipe_analyze', 'photo_analyze', 'meal_suggest', 'coach_insight', 'memory_extract', 'memory_embed']
    .every((task) => routerPolicies.includes(task)),
  'all live AI tasks must be represented in agents/router/policies.ts',
);

assert(
  'Privileged API prefixes are proxy-protected',
  proxy.includes("pathname.startsWith('/api/admin')") &&
    proxy.includes("pathname.startsWith('/api/seed')"),
  'proxy.ts must require authentication before privileged API route handlers run',
);

assert(
  'Supabase local config uses canonical host/ports',
  supabaseConfig.includes('project_id = "trophe"') &&
    supabaseConfig.includes('port = 54322') &&
    supabaseConfig.includes('site_url = "http://127.0.0.1:3000"'),
  'supabase/config.toml must pin the local stack to the committed ports and host',
);
