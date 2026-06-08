import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const range = z.object({ min: z.number().finite(), max: z.number().finite() })
  .refine((value) => value.min <= value.max);
const datasetSchema = z.object({
  version: z.string().min(1),
  pass_criteria: z.object({
    item_count_match: z.boolean(),
    portion_tolerance_pct: z.number().positive(),
    macro_tolerance_pct: z.number().positive(),
    latency_p95_ms: z.number().positive(),
  }),
  cases: z.array(z.object({
    id: z.string().min(1),
    input: z.string(),
    language: z.enum(['en', 'es', 'el', 'mixed']),
    category: z.string().min(1),
    expect_item_count: z.number().int().nonnegative(),
    expect_total: z.object({
      calories: range.optional(),
      protein_g: range.optional(),
      carbs_g: range.optional(),
      fat_g: range.optional(),
    }).nullable().optional(),
    expect_safety: z.boolean(),
  })).min(200),
});

describe('enterprise nutrition eval dataset', () => {
  const raw = JSON.parse(readFileSync(
    join(process.cwd(), 'agents/evals/datasets/nutrition-enterprise-v2.json'),
    'utf8',
  ));

  it('contains 200+ uniquely identified, schema-valid reviewed cases', () => {
    const dataset = datasetSchema.parse(raw);
    expect(dataset.cases).toHaveLength(210);
    expect(new Set(dataset.cases.map((item) => item.id)).size).toBe(dataset.cases.length);
  });

  it('covers critical enterprise categories and languages', () => {
    const dataset = datasetSchema.parse(raw);
    const categories = new Set(dataset.cases.map((item) => item.category));
    for (const category of ['base_food', 'composite', 'clarification', 'adversarial', 'code_switch', 'multi_item']) {
      expect(categories.has(category), category).toBe(true);
    }
    expect(new Set(dataset.cases.map((item) => item.language))).toEqual(new Set(['en', 'es', 'el', 'mixed']));
    expect(dataset.cases.filter((item) => item.expect_safety)).not.toHaveLength(0);
    expect(dataset.cases.filter((item) => item.language === 'mixed')).not.toHaveLength(0);
    expect(dataset.cases.filter((item) => item.category !== 'adversarial' && item.input.trim() === '')).toHaveLength(0);
  });
});
