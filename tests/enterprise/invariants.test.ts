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

  it('rejects implausible nutrition values before returning food parse results', () => {
    const foodParse = readFileSync(join(root, 'agents/food-parse/index.v4.ts'), 'utf8');
    expect(foodParse).toContain('Nutrition result failed plausibility validation');
    expect(foodParse).toContain('item.grams > 10_000');
    expect(foodParse).toContain('item.calories > 10_000');
  });

  it('repairs one invalid food parse schema response before failing safely', () => {
    const foodParse = readFileSync(join(root, 'agents/food-parse/index.v4.ts'), 'utf8');
    expect(foodParse).toContain("operation: 'schema-repair'");
    expect(foodParse).toContain('Your previous response was invalid');
  });

  it('runs non-skippable nutrition safety and release-gate tests in CI', () => {
    const workflow = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
    expect(workflow).toContain('Nutrition safety and release-gate tests');
    expect(workflow).toContain('tests/agents/nutrition-release-gate.test.ts');
    expect(workflow).toContain('tests/agents/food-parse-structured-output.test.ts');
  });

  it('does not use regex extraction in the structured food-identification path', () => {
    const foodParse = readFileSync(join(root, 'agents/food-parse/index.v4.ts'), 'utf8');
    expect(foodParse).not.toContain('extractV4JSON');
    expect(foodParse).not.toContain('responseText.match');
  });

  it('requires users to resolve inferred portions before logging nutrition', () => {
    const quickInput = readFileSync(join(root, 'components/QuickFoodInput.tsx'), 'utf8');
    const parsedList = readFileSync(join(root, 'components/ParsedFoodList.tsx'), 'utf8');
    expect(quickInput).toContain('data.needs_clarification');
    expect(parsedList).toContain('unresolvedPortions > 0');
    expect(parsedList).toContain('Review portions to save');
  });

  it('uses constrained decoding and a durable queue for conversation memory', () => {
    const memoryWrite = readFileSync(join(root, 'agents/memory/write.ts'), 'utf8');
    const conversation = readFileSync(join(root, 'app/api/ai/conversation/route.ts'), 'utf8');
    const queue = readFileSync(join(root, 'agents/memory/queue.ts'), 'utf8');
    expect(memoryWrite).toContain('invokeGeminiStructured');
    expect(memoryWrite).not.toContain('llmText.match');
    expect(conversation).toContain('enqueueConversationMemory');
    expect(queue).toContain('FOR UPDATE SKIP LOCKED');
    expect(conversation).not.toContain('after(async');
  });

  it('keeps stochastic provider smoke evals non-blocking in CI', () => {
    const workflow = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
    expect(workflow).toContain('EVAL_ENFORCE_GATE: 0');
    expect(workflow).toContain('Nutrition safety and release-gate tests');
    expect(workflow).toContain('RAG safety and release-gate tests');
  });

  it('uses constrained provider output for recipe analysis', () => {
    const recipe = readFileSync(join(root, 'agents/recipe-analyze/index.ts'), 'utf8');
    expect(recipe).toContain("tool_choice: { type: 'tool', name: 'submit_recipe_analysis' }");
    expect(recipe).not.toContain('extractJSON');
    expect(recipe).not.toContain('text.match');
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
    const forbiddenDbReferences = new RegExp([
      'open' + '_brain',
      'brain' + '_user',
      'localhost:' + '5433',
      '127\\.0\\.0\\.1:' + '5433',
    ].join('|'), 'i');
    const offenders = [
      ...sourceFiles('app'),
      ...sourceFiles('components'),
      ...sourceFiles('lib'),
      ...sourceFiles('agents'),
      ...sourceFiles('db'),
      ...sourceFiles('scripts'),
    ]
      .filter((file) => forbiddenDbReferences.test(readFileSync(file, 'utf8')))
      .map((file) => relative(root, file));

    expect(offenders).toEqual([]);
  });
});
