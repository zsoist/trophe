import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { invokeDeepSeekStructured, invokeDeepSeekText } from '../../agents/runtime/providers/deepseek';
import { estimateModelCostUsd } from '../../agents/router/pricing';
import { requirePaidAiToolApproval } from '../safety/require-paid-ai-approval';

const paidAiApproval = requirePaidAiToolApproval({
  operation: 'eval-deepseek-stress',
  argv: process.argv.slice(2),
  env: process.env,
});

type Model = 'deepseek-v4-flash' | 'deepseek-v4-pro';
type Result = {
  model: Model;
  concurrency: number;
  kind: 'text' | 'structured';
  ok: boolean;
  latencyMs: number;
  cacheReadTokens: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  error?: string;
};

const schema = z.object({
  foods: z.array(z.object({
    name: z.string().min(1),
    quantity: z.number().positive(),
    unit: z.string().min(1),
  })).length(3),
});
const jsonSchema = {
  type: 'object',
  properties: {
    foods: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          quantity: { type: 'number' },
          unit: { type: 'string' },
        },
        required: ['name', 'quantity', 'unit'],
        additionalProperties: false,
      },
    },
  },
  required: ['foods'],
  additionalProperties: false,
};

function percentile(values: number[], fraction: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

async function runOne(model: Model, concurrency: number, index: number): Promise<Result> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  const startedAt = Date.now();
  const kind = index % 2 === 0 ? 'text' : 'structured';
  const maxTokens = Number(process.env.DEEPSEEK_STRESS_MAX_TOKENS ?? 500);
  try {
    paidAiApproval.consumeAttempt();
    const result = kind === 'text'
      ? await invokeDeepSeekText({
          model,
          system: 'You are Trophē. Give concise, safe nutrition guidance and state uncertainty.',
          prompt: `Request ${index}: I ate a restaurant bowl of rice and chicken. How should I log it?`,
          maxTokens,
          signal: controller.signal,
          userId: `stress-user-${index % 5}`,
        })
      : await invokeDeepSeekStructured({
          model,
          system: 'Extract foods only.',
          prompt: 'I ate 2 eggs, 100g feta, and 1 cup rice.',
          maxTokens,
          signal: controller.signal,
          userId: `stress-user-${index % 5}`,
          toolName: 'submit_foods',
          description: 'Submit foods',
          schema: jsonSchema,
          validator: schema,
          strict: true,
        });
    return {
      model,
      concurrency,
      kind,
      ok: true,
      latencyMs: result.latencyMs,
      cacheReadTokens: result.usage.cacheReadTokens ?? 0,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      costUsd: estimateModelCostUsd(
        model,
        result.usage.inputTokens,
        result.usage.outputTokens,
        result.usage.cacheReadTokens,
      ),
    };
  } catch (error) {
    return {
      model,
      concurrency,
      kind,
      ok: false,
      latencyMs: Date.now() - startedAt,
      cacheReadTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  if (!process.env.DEEPSEEK_API_KEY) throw new Error('DEEPSEEK_API_KEY is required');
  const levels = (process.env.DEEPSEEK_STRESS_LEVELS ?? '1,5,10,25')
    .split(',').map(Number).filter((value) => Number.isInteger(value) && value > 0);
  const models = (process.env.DEEPSEEK_STRESS_MODELS ?? 'deepseek-v4-flash,deepseek-v4-pro')
    .split(',') as Model[];
  const jobs = models.flatMap((model) => levels.flatMap((concurrency) =>
    Array.from({ length: concurrency }, (_, index) => ({ model, concurrency, index })),
  ));
  const approvedJobs = paidAiApproval.boundCases(jobs);
  const results = await Promise.all(
    approvedJobs.map((job) => runOne(job.model, job.concurrency, job.index)),
  );

  const evaluatedGroups = [...new Map(results.map((result) => [
    `${result.model}:${result.concurrency}`,
    { model: result.model, concurrency: result.concurrency },
  ])).values()];
  const summary = evaluatedGroups.map(({ model, concurrency }) => {
    const selected = results.filter((result) => result.model === model && result.concurrency === concurrency);
    const latencies = selected.map((result) => result.latencyMs);
    return {
      model,
      concurrency,
      requests: selected.length,
      successes: selected.filter((result) => result.ok).length,
      failureRate: selected.filter((result) => !result.ok).length / selected.length,
      structuredSuccessRate: selected.some((result) => result.kind === 'structured')
        ? selected.filter((result) => result.kind === 'structured' && result.ok).length
          / selected.filter((result) => result.kind === 'structured').length
        : null,
      p50LatencyMs: percentile(latencies, 0.5),
      p95LatencyMs: percentile(latencies, 0.95),
      p99LatencyMs: percentile(latencies, 0.99),
      cacheReadTokens: selected.reduce((sum, result) => sum + result.cacheReadTokens, 0),
      totalCostUsd: selected.reduce((sum, result) => sum + result.costUsd, 0),
    };
  });

  mkdirSync(join(process.cwd(), 'artifacts', 'evals'), { recursive: true });
  writeFileSync(
    join(process.cwd(), 'artifacts', 'evals', 'deepseek-stress.json'),
    JSON.stringify({ createdAt: new Date().toISOString(), summary, results }, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
  if (summary.some((row) => row.failureRate > 0 || (row.structuredSuccessRate !== null && row.structuredSuccessRate < 1))) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
