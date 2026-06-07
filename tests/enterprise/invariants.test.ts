import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    const rel = relative(root, full);
    if (
      entry === 'node_modules' ||
      entry === '.next' ||
      entry === '.git' ||
      entry === 'coverage' ||
      rel.startsWith('agents/evals/reports/')
    ) {
      return [];
    }
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function sourceFiles(scope: string): string[] {
  return walk(join(root, scope)).filter((file) => /\.(ts|tsx)$/.test(file));
}

describe('enterprise hardening invariants', () => {
  it('does not use Supabase .single() in application source', () => {
    const offenders = [...sourceFiles('app'), ...sourceFiles('components'), ...sourceFiles('lib')]
      .filter((file) => readFileSync(file, 'utf8').includes('.single('))
      .map((file) => relative(root, file));

    expect(offenders).toEqual([]);
  });

  it('keeps live model identifiers out of routes and agents outside the router/client boundary', () => {
    const allowed = [
      'agents/router/',
      'agents/clients/',
      'agents/evals/',
      'agents/observability/',
      'agents/prompts/',
    ];
    const modelPattern = /(claude-[a-z0-9-]+|gemini-[0-9][a-z0-9.-]*|voyage-[a-z0-9-]+)/i;
    const offenders = [...sourceFiles('agents'), ...sourceFiles('app/api'), ...sourceFiles('lib')]
      .map((file) => relative(root, file))
      .filter((rel) => !allowed.some((prefix) => rel.startsWith(prefix)))
      .filter((rel) => modelPattern.test(readFileSync(join(root, rel), 'utf8')));

    expect(offenders).toEqual([]);
  });

  it('routes every production model call through the governed runtime provider boundary', () => {
    const allowed = [
      'agents/runtime/providers/',
      'agents/clients/',
      'agents/evals/',
      'agents/observability/',
    ];
    const directCallPattern = /callAnthropicMessages|callGeminiMessages|api\.anthropic\.com|api\.voyageai\.com|generateContent\(/;
    const offenders = [...sourceFiles('agents'), ...sourceFiles('app/api'), ...sourceFiles('lib')]
      .map((file) => relative(root, file))
      .filter((rel) => !allowed.some((prefix) => rel.startsWith(prefix)))
      .filter((rel) => directCallPattern.test(readFileSync(join(root, rel), 'utf8')));

    expect(offenders).toEqual([]);
  });

  it('fails the aggregate eval release gate when every suite is skipped', () => {
    const evalRunner = readFileSync(join(root, 'agents/evals/run-all.ts'), 'utf8');
    expect(evalRunner).toContain("process.exit(process.env.ALLOW_SKIPPED_EVALS === '1' ? 0 : 1)");
    expect(evalRunner).not.toContain('GATE: inconclusive — no active suites`));\n    process.exit(0)');
  });

  it('keeps agent run persistence inside the governed runtime boundary', () => {
    const offenders = [...sourceFiles('agents'), ...sourceFiles('app/api'), ...sourceFiles('lib')]
      .map((file) => relative(root, file))
      .filter((rel) => !rel.startsWith('agents/runtime/'))
      .filter((rel) => /insert\(agentRuns\)|update\(agentRuns\)/.test(readFileSync(join(root, rel), 'utf8')));

    expect(offenders).toEqual([]);
  });

  it('only uses dangerouslySetInnerHTML for the layout pre-paint theme script', () => {
    const offenders = [...sourceFiles('app'), ...sourceFiles('components')]
      .filter((file) => readFileSync(file, 'utf8').includes('dangerouslySetInnerHTML'))
      .map((file) => relative(root, file))
      .filter((rel) => rel !== 'app/layout.tsx');

    expect(offenders).toEqual([]);
  });

  it('does not use email allowlists for production authorization', () => {
    const offenders = [
      ...sourceFiles('app'),
      ...sourceFiles('components'),
      ...sourceFiles('lib'),
      ...sourceFiles('agents'),
    ]
      .filter((file) => /ADMIN_EMAILS|TROPHE_ADMIN_EMAILS/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(root, file));

    expect(offenders).toEqual([]);
  });

  it('does not expose service-role credentials directly from route handlers', () => {
    const offenders = sourceFiles('app/api')
      .filter((file) => readFileSync(file, 'utf8').includes('SUPABASE_SERVICE_ROLE_KEY'))
      .map((file) => relative(root, file));

    expect(offenders).toEqual([]);
  });

  it('does not run arbitrary SQL from HTTP route handlers', () => {
    const offenders = sourceFiles('app/api')
      .filter((file) => /run_sql|rpc\(['"]run_sql['"]/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(root, file));

    expect(offenders).toEqual([]);
  });

  it('keeps the legacy both role out of application code', () => {
    const offenders = [
      ...sourceFiles('app'),
      ...sourceFiles('components'),
      ...sourceFiles('lib'),
      ...sourceFiles('agents'),
    ]
      .filter((file) => /\brole[_-]?both\b|['"]both['"]|\|\s*['"]both['"]/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(root, file));

    expect(offenders).toEqual([]);
  });

  it('keeps deprecated root Supabase schema dumps out of the repo root', () => {
    const offenders = ['supabase-schema.sql', 'supabase-workout-schema.sql']
      .filter((file) => {
        try {
          statSync(join(root, file));
          return true;
        } catch {
          return false;
        }
      });

    expect(offenders).toEqual([]);
  });

  it('guards cross-user food log reads with tenant access checks', () => {
    const foodRouter = readFileSync(join(root, 'lib/trpc/routers/food.ts'), 'utf8');

    expect(foodRouter).toContain('assertCanAccessClient');
    expect(foodRouter).toContain('resolveFoodLogTargetUser');
  });

  it('does not commit shared tester passwords or live API keys', () => {
    const trackedTextFiles = walk(root)
      .filter((file) => !file.includes('/tests/_guard_fixtures/'))
      .filter((file) => file !== __filename)
      .filter((file) => /\.(ts|tsx|js|md|sql|json|yml|yaml)$/.test(file));
    const forbidden = /(trophe2026!|TestDaniel#2026|USDA_API_KEY=[A-Za-z0-9_-]{20,})/;
    const offenders = trackedTextFiles
      .filter((file) => forbidden.test(readFileSync(file, 'utf8')))
      .map((file) => relative(root, file));

    expect(offenders).toEqual([]);
  });

  it('exports every domain schema file from the canonical schema barrel', () => {
    const schemaDir = join(root, 'db/schema');
    const barrel = readFileSync(join(schemaDir, 'index.ts'), 'utf8');
    const missing = readdirSync(schemaDir)
      .filter((file) => file.endsWith('.ts') && file !== 'index.ts')
      .map((file) => file.replace(/\.ts$/, ''))
      .filter((name) => !barrel.includes(`export * from './${name}'`));

    expect(missing).toEqual([]);
  });

  it('does not reveal server secret names from public health routes', () => {
    const healthRoutes = sourceFiles('app/api')
      .filter((file) => file.endsWith('/health/route.ts'));
    const offenders = healthRoutes
      .filter((file) => /missing\s*:/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(root, file));

    expect(offenders).toEqual([]);
  });

  it('cleans up auth users when public signup profile creation fails', () => {
    const signupRoute = readFileSync(join(root, 'app/api/auth/signup/route.ts'), 'utf8');

    expect(signupRoute).toContain('profileError');
    expect(signupRoute).toContain('clientProfileError');
    expect(signupRoute.match(/auth\.admin\.deleteUser/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps OpenBrain database references out of runtime code and active scripts', () => {
    const offenders = [
      ...sourceFiles('app'),
      ...sourceFiles('components'),
      ...sourceFiles('lib'),
      ...sourceFiles('agents'),
      ...sourceFiles('db'),
      ...sourceFiles('scripts'),
    ]
      .filter((file) => /open_brain|brain_user|localhost:5433|127\.0\.0\.1:5433/i.test(readFileSync(file, 'utf8')))
      .map((file) => relative(root, file));

    expect(offenders).toEqual([]);
  });
});
