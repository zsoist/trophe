import { z } from 'zod';
import { FOOD_PARSE_MAX_ITEMS } from '@/lib/ai/food-parse-limits';

// DeepSeek occasionally emits clarification_question as an array of objects
// ({question: "..."} or {text: "..."}) instead of a string, and omits items
// entirely when asking for clarification. Coerce both instead of 422-ing the
// whole parse (3 benchmark cases failed on this).
//
// 2026-07-03 forensics: two more benchmark 422s came from array entries that
// matched NEITHER {question} nor {text} (nested arrays / other object keys).
// The tolerant final branch extracts the first string-ish value, and the
// outer .catch(null) guarantees a malformed clarification NEVER kills a
// parse that carries valid items — worst case we just lose the question.
function firstStringish(v: unknown, depth = 0): string | null {
  if (depth > 4) return null;
  if (typeof v === 'string' && v.trim().length > 0) return v;
  if (Array.isArray(v)) {
    for (const entry of v) {
      const s = firstStringish(entry, depth + 1);
      if (s) return s;
    }
    return null;
  }
  if (v && typeof v === 'object') {
    for (const value of Object.values(v)) {
      const s = firstStringish(value, depth + 1);
      if (s) return s;
    }
  }
  return null;
}

const clarificationEntry = z.union([
  z.string(),
  z.object({ question: z.string() }).transform(o => o.question),
  z.object({ text: z.string() }).transform(o => o.text),
  z.unknown().transform(v => firstStringish(v) ?? ''),
]);

export const foodParseStructuredSchema = z.object({
  needs_clarification: z.boolean(),
  clarification_question: z.union([
    z.string(),
    z.array(clarificationEntry).transform(a => a.filter(s => s.length > 0).join(' ').trim() || null),
  ]).nullable().catch(null),
  items: z.array(z.object({
    raw_text: z.string(),
    food_name: z.string().min(1),
    name_localized: z.string(),
    quantity: z.number().positive(),
    unit: z.string().min(1),
    qualifier: z.string().nullable().optional(),
    food_state: z.string().transform(s => {
      const valid = ['raw','cooked','fried','grilled','baked','boiled','steamed','roasted','prepared','unknown'] as const;
      const lower = s.toLowerCase().trim();
      if ((valid as readonly string[]).includes(lower)) return lower;
      if (['scrambled','sauteed','sautéed','poached','braised','stewed','blanched','simmered'].includes(lower)) return 'cooked';
      if (['deep-fried','deep fried','pan-fried','pan fried'].includes(lower)) return 'fried';
      if (['toasted','charred','broiled'].includes(lower)) return 'grilled';
      if (['microwaved','reheated','warmed'].includes(lower)) return 'prepared';
      return 'cooked';
    }),
    portion_explicit: z.boolean(),
    confidence: z.number().min(0).max(1),
    recognized: z.boolean(),
    // v5 CoT macro estimation fields (optional for backward compat with v4 prompt)
    estimated_grams: z.number().nonnegative().optional(),
    estimated_calories: z.number().nonnegative().optional(),
    estimated_protein_g: z.number().nonnegative().optional(),
    estimated_carbs_g: z.number().nonnegative().optional(),
    estimated_fat_g: z.number().nonnegative().optional(),
    nutrition_reasoning: z.string().optional(),
    estimation_confidence: z.number().min(0).max(1).optional(),
    // v6 per-100g fields (LLM reports per-100g, code multiplies by grams)
    per_100g_kcal: z.number().nonnegative().optional(),
    per_100g_protein: z.number().nonnegative().optional(),
    per_100g_carbs: z.number().nonnegative().optional(),
    per_100g_fat: z.number().nonnegative().optional(),
  })).max(FOOD_PARSE_MAX_ITEMS).default([]),
});

export type FoodParseStructuredOutput = z.infer<typeof foodParseStructuredSchema>;

export const foodParseGeminiResponseSchema = {
  type: 'object',
  required: ['needs_clarification', 'clarification_question', 'items'],
  properties: {
    needs_clarification: { type: 'boolean' },
    clarification_question: { type: 'string', nullable: true },
    items: {
      type: 'array',
      maxItems: FOOD_PARSE_MAX_ITEMS,
      items: {
        type: 'object',
        required: ['raw_text', 'food_name', 'name_localized', 'quantity', 'unit', 'food_state', 'portion_explicit', 'confidence', 'recognized'],
        properties: {
          raw_text: { type: 'string' },
          food_name: { type: 'string' },
          name_localized: { type: 'string' },
          quantity: { type: 'number' },
          unit: { type: 'string' },
          qualifier: { type: 'string', nullable: true },
          food_state: { type: 'string' },
          portion_explicit: { type: 'boolean' },
          confidence: { type: 'number' },
          recognized: { type: 'boolean' },
          // v5 CoT macro estimation fields
          estimated_grams: { type: 'number' },
          estimated_calories: { type: 'number' },
          estimated_protein_g: { type: 'number' },
          estimated_carbs_g: { type: 'number' },
          estimated_fat_g: { type: 'number' },
          nutrition_reasoning: { type: 'string' },
          estimation_confidence: { type: 'number' },
          // v6 per-100g fields
          per_100g_kcal: { type: 'number' },
          per_100g_protein: { type: 'number' },
          per_100g_carbs: { type: 'number' },
          per_100g_fat: { type: 'number' },
        },
      },
    },
  },
};
