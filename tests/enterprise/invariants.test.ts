import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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

function extractPgPolicyCalls(source: string): string[] {
  const calls: string[] = [];
  let index = 0;

  while ((index = source.indexOf('pgPolicy(', index)) !== -1) {
    const start = index;
    let depth = 0;
    let quote: '"' | "'" | null = null;
    let inTemplate = false;
    let escaped = false;

    for (; index < source.length; index += 1) {
      const char = source[index];
      const previous = source[index - 1];

      if (quote) {
        if (!escaped && char === quote) quote = null;
        escaped = !escaped && char === '\\';
        continue;
      }

      if (inTemplate) {
        if (char === '`' && previous !== '\\') inTemplate = false;
        continue;
      }

      if (char === '"' || char === "'") {
        quote = char;
        escaped = false;
        continue;
      }

      if (char === '`') {
        inTemplate = true;
        continue;
      }

      if (char === '(') depth += 1;
      if (char === ')') {
        depth -= 1;
        if (depth === 0) {
          calls.push(source.slice(start, index + 1));
          index += 1;
          break;
        }
      }
    }
  }

  return calls;
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
    expect(evalRunner).not.toContain('ALLOW_SKIPPED_EVALS');
    expect(evalRunner).toContain('process.exit(1)');
    expect(evalRunner).toContain('Required eval suite skipped');
    expect(evalRunner).not.toContain('GATE: inconclusive — no active suites`));\n    process.exit(0)');
  });

  it('rejects implausible nutrition values (per-item barrier, post-processing)', () => {
    const foodParse = readFileSync(join(root, 'agents/food-parse/index.v4.ts'), 'utf8');
    // The barrier still exists with the same physical bounds …
    expect(foodParse).toContain('Nutrition result failed plausibility validation');
    expect(foodParse).toContain('item.grams <= 15_000');
    expect(foodParse).toContain('item.calories <= 15_000');
    expect(foodParse).toContain('item.protein_g + item.carbs_g + item.fat_g <= item.grams * 1.15');
    // … but drops ONLY the bad item and keeps the rest (was all-or-nothing),
    // failing wholesale only when every item is implausible.
    expect(foodParse).toContain('finalItems = finalItems.filter(isPlausibleItem)');
    expect(foodParse).toContain('finalItems.length === 0');
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

  it('keeps coach-module RLS fail-closed (messages, meal plans, intake)', () => {
    const messages = readFileSync(join(root, 'drizzle/0026_messages.sql'), 'utf8');
    // Clients may only insert as themselves, with the client role baked into policy
    expect(messages).toContain("WITH CHECK (client_id = (SELECT auth.uid()) AND sender_role = 'client')");
    // Coach access always scoped through assignment, never blanket role checks
    expect(messages).toContain('private.is_coach_of(client_id)');

    const mealPlans = readFileSync(join(root, 'drizzle/0025_coach_phase0_michael.sql'), 'utf8');
    expect(mealPlans).toContain('private.is_coach_of(client_id)');
    expect(mealPlans).toContain('meal_plan_client_select');

    const intake = readFileSync(join(root, 'drizzle/0027_intake_daily_checkins.sql'), 'utf8');
    expect(intake).toContain('qr_coach_select');
    expect(intake).toContain('private.is_coach_of(client_id)');
    // GDPR gate: lifestyle answers only, no document upload in Phase 2
    expect(intake.toLowerCase()).not.toContain('storage');
  });

  it('derives meal-plan calories from macros instead of free-typing them', () => {
    const plan = readFileSync(join(root, 'app/coach/client/[id]/plan/page.tsx'), 'utf8');
    expect(plan).toContain('kcalFromMacros');
    expect(plan).toContain('t.protein * 4 + t.carbs * 4 + t.fat * 9');
    // The calories stepper must not come back
    expect(plan).not.toContain("{ key: 'calories', label: 'Calories'");
  });

  it('hardens the client quick-message endpoint (zod + durable rate limit)', () => {
    const route = readFileSync(join(root, 'app/api/client/message/route.ts'), 'utf8');
    expect(route).toContain('consumeRateLimit');
    expect(route).toContain('max(2000)');
    expect(route).not.toContain('coach_notes');
  });

  it('requires users to resolve inferred portions before logging nutrition', () => {
    const quickInput = readFileSync(join(root, 'components/food/QuickFoodInput.tsx'), 'utf8');
    const parsedList = readFileSync(join(root, 'components/food/ParsedFoodList.tsx'), 'utf8');
    expect(quickInput).toContain('data.needs_clarification');
    expect(parsedList).toContain('unresolvedPortions > 0');
    expect(parsedList).toContain('estimated portion');
  });

  it('uses constrained decoding and a durable queue for conversation memory', () => {
    const memoryWrite = readFileSync(join(root, 'agents/memory/write.ts'), 'utf8');
    const conversation = readFileSync(join(root, 'app/api/ai/conversation/route.ts'), 'utf8');
    const queue = readFileSync(join(root, 'agents/memory/queue.ts'), 'utf8');
    expect(memoryWrite).toContain('invokeStructuredProvider');
    expect(memoryWrite).not.toContain('llmText.match');
    expect(conversation).toContain('enqueueConversationMemory');
    expect(queue).toContain('FOR UPDATE SKIP LOCKED');
    expect(conversation).not.toContain('after(async');
  });

  it('enforces deterministic eval contracts in required CI without paid provider calls', () => {
    const workflow = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
    expect(workflow).toContain('Agent routing and eval contracts (no paid calls)');
    expect(workflow).toContain('tests/agents/phase3-routing-policy.test.ts');
    expect(workflow).toContain('tests/agents/golden-tolerance-guard.test.ts');
    expect(workflow).toContain('tests/agents/food-parse-watchlist.test.ts');
    expect(workflow).not.toContain('npm run evals');
    expect(workflow).not.toContain('EVAL_REQUIRED_SUITES');
    expect(workflow).not.toContain('EVAL_ENFORCE_GATE');
    expect(workflow).toContain('Nutrition safety and release-gate tests');
    expect(workflow).toContain('RAG safety and release-gate tests');
  });

  it('uses constrained provider output for recipe analysis', () => {
    const recipe = readFileSync(join(root, 'agents/recipe-analyze/index.ts'), 'utf8');
    // Structured output goes through the provider-dispatched tool-calling
    // path (DeepSeek strict tools / Anthropic tool_use / Gemini constrained).
    expect(recipe).toContain('invokeStructuredProvider');
    expect(recipe).toContain("toolName: RECIPE_ANALYZE_TOOL.name");
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
    const trackedTextFiles = execFileSync('git', ['ls-files', '-z'], {
      cwd: root,
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean)
      .map((file) => join(root, file))
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

  it('keeps Drizzle RLS policy mirrors fail-closed', () => {
    const offenders = sourceFiles('db/schema')
      .flatMap((file) => {
        const rel = relative(root, file);
        return extractPgPolicyCalls(readFileSync(file, 'utf8')).flatMap((policy) => {
          const name = policy.match(/pgPolicy\(['"]([^'"]+)/)?.[1] ?? '<unknown>';
          const operation = policy.match(/for:\s*['"](\w+)['"]/)?.[1] ?? 'all';
          const policyOffenders: string[] = [];

          if (/to:\s*\[\s*['"]public['"]\s*\]/.test(policy)) {
            policyOffenders.push(`${rel}: ${name}: must not target TO public`);
          }

          if (operation !== 'insert' && !/\busing\s*:/.test(policy)) {
            policyOffenders.push(`${rel}: ${name}: ${operation} policy missing USING`);
          }

          if (['insert', 'update', 'all'].includes(operation) && !/\bwithCheck\s*:/.test(policy)) {
            policyOffenders.push(`${rel}: ${name}: ${operation} policy missing WITH CHECK`);
          }

          return policyOffenders;
        });
      });

    expect(offenders).toEqual([]);
  });

  it('does not reveal server secret names from public health routes', () => {
    const healthRoutes = sourceFiles('app/api')
      .filter((file) => file.endsWith('/health/route.ts'));
    const offenders = healthRoutes
      .filter((file) => /missing\s*:/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(root, file));

    expect(offenders).toEqual([]);
  });

  it('signup compensates (deletes a proven-orphaned auth user) when finalization fails', () => {
    // WP1 part 2: the route delegates to the recovery-safe reservation flow, which writes
    // profile/consent atomically via finalize_* and, on failure, deletes a proven-orphaned
    // Auth user + cancels via the tombstoned route RPC (replaces the old manual cleanup).
    const route = readFileSync(join(root, 'app/api/auth/signup/route.ts'), 'utf8');
    const flow = readFileSync(join(root, 'lib/auth/signup-flow.ts'), 'utf8');

    expect(route).toContain('runReservedSignup');
    expect(flow).toContain('auth.deleteUser');
    expect(flow).toContain('cancelForRoute');
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
