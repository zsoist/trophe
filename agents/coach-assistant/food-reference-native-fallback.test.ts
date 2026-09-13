import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParsedFoodItem } from '@/agents/schemas/food-parse';

// ── Drive the REAL Food pipeline with only the DB, the provider transport and the
//    composite decomposer stubbed. No network, no DB, no credentials.
const h = vi.hoisted(() => ({ items: [] as unknown[], fail: false }));
const runtimeMocks = vi.hoisted(() => ({ calls: 0 }));

const lookupMocks = vi.hoisted(() => ({
  lookupFoodBatch: vi.fn(async (items: unknown[]) => items.map(() => null)),
}));

vi.mock('@/agents/food-parse/lookup', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/agents/food-parse/lookup')>(),
  lookupFoodBatch: lookupMocks.lookupFoodBatch,
  ragPreSearch: async () => [],
  formatRagContext: () => '',
}));
vi.mock('@/agents/food-parse/decompose', () => ({
  decomposeAndLookup: async () => null,
  lookupCachedRecipeAsItem: async () => null,
}));
vi.mock('@/agents/runtime', () => ({
  executeAiTask: async (cfg: { invoke: (args: unknown) => Promise<unknown> }) => {
    runtimeMocks.calls += 1;
    const result = await cfg.invoke({
      policy: { provider: 'openai', model: 'gpt-5.6-luna', reasoningEffort: 'low' },
      signal: new AbortController().signal,
    }) as { output: unknown; usage?: { inputTokens: number; outputTokens: number }; rawStatus?: number };
    return {
      output: result.output, generationId: 'gen_test', latencyMs: 1, rawStatus: result.rawStatus ?? 200,
      usage: result.usage ?? { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0 },
      selectedPolicy: { model: 'gpt-5.6-luna', provider: 'openai' },
    };
  },
}));
vi.mock('@/agents/runtime/providers/structured', () => ({
  invokeStructuredProvider: async () => { throw new Error('direct provider must not run'); },
}));
vi.mock('@/agents/runtime/provider-access', () => ({ assertPaidProviderAccess: () => {}, isPaidAiAllowed: () => false }));
vi.mock('@/agents/clients/google', () => ({ default: {} }));

import {
  createCatalogueFirstFoodReference,
  createNativeFoodReferenceFallback,
  lookupNativeFoodReference,
  projectNativeFoodReference,
  rescaleNativeFoodReference,
  type NativeFoodReferenceOutcome,
  type NativeFoodReferenceScope,
} from './food-reference-native-fallback';
import { createGovernedCoachTransport, type GovernedCoachTransport } from './governed-transport';
import { decidePilotBudgetCommand, TEXT_FOOD_MAX_PHASES, type PilotAttemptRecord, type PilotBudgetStore } from './pilot-budget';
import { TEXT_FOOD_PROMPT_VERSION } from './text-food-parser';
import { foodReferenceSchema, type FoodReference } from './food-reference';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function item(over: Partial<ParsedFoodItem> = {}): ParsedFoodItem {
  return {
    raw_text: 'chicken', food_name: 'Chicken breast, cooked', name_localized: 'Pechuga de pollo cocida',
    quantity: 150, unit: 'g', grams: 150, calories: 247.5, protein_g: 46.5, carbs_g: 0, fat_g: 5.4,
    fiber_g: 0, sugar_g: 0, confidence: 0.7, source: 'llm_cot', food_state: 'cooked', portion_explicit: true,
    ...over,
  };
}

/** Real V4 LLM output shape for "150 g cooked chicken breast" (DB miss → llm_cot). */
function chickenCandidate() {
  return {
    raw_text: '150g cooked chicken breast', food_name: 'Chicken breast, cooked', name_localized: 'Pechuga de pollo cocida',
    quantity: 150, unit: 'g', qualifier: null, food_state: 'cooked', portion_explicit: true, confidence: 0.9,
    recognized: true, estimated_grams: 150, estimation_confidence: 0.85,
    estimated_calories: 248, estimated_protein_g: 46.5, estimated_carbs_g: 0, estimated_fat_g: 5.4,
    per_100g_kcal: 165, per_100g_protein: 31, per_100g_carbs: 0, per_100g_fat: 3.6,
    nutrition_reasoning: 'Cooked chicken breast is ~165 kcal and ~31 g protein per 100 g.',
  };
}

/** A governed Food `food_parse` transport with an injected fake provider. */
function makeGoverned(blocked = false) {
  const records = new Map<string, PilotAttemptRecord>();
  const events: string[] = [];
  const store: PilotBudgetStore = {
    async execute(command) {
      events.push(command.operation);
      const result = decidePilotBudgetCommand({
        pilotId: id(1), budgetDay: '2026-09-12', capNanoUsd: 3_000_000_000, chargedNanoUsd: 0,
        turnAttemptCount: records.size, accountingBlocked: blocked, existing: records.get(command.binding.attemptId),
      }, command);
      if (result.ok && result.write !== 'none') records.set(command.binding.attemptId, result.record);
      return { storage: 'database', ...result };
    },
  };
  const provider = vi.fn<GovernedCoachTransport>(async () => {
    if (h.fail) throw new Error('offline_failure');
    return {
      output: { items: h.items, needs_clarification: false, clarification_question: null },
      responseModel: 'gpt-5.6-luna', requestId: 'req_test', rawStatus: 200, latencyMs: 1,
      usage: { inputTokens: 100, outputTokens: 20 },
    };
  });
  const signal = new AbortController().signal;
  const governed = createGovernedCoachTransport({
    pilotId: id(1), actorId: id(2), turnId: id(3), identityParts: ['native-reference-fixture'],
    mode: 'injected', reservationProfile: 'food_parse', store, signal, transport: provider,
    allowedPromptVersions: [TEXT_FOOD_PROMPT_VERSION],
  });
  return { governed, provider, events, signal };
}

function scopeOf(fixture: ReturnType<typeof makeGoverned>): NativeFoodReferenceScope {
  return { actorId: id(2), requestId: id(3), signal: fixture.signal, transport: fixture.governed.transport };
}

beforeEach(() => {
  h.items = [];
  h.fail = false;
  runtimeMocks.calls = 0;
  lookupMocks.lookupFoodBatch.mockClear();
});

// ── Real injected parser route (chicken 150 g, catalogue miss) ────────────────
describe('native reference fallback over the real Food pipeline', () => {
  it('projects a same-Food reference for 150 g chicken breast from one pipeline run', async () => {
    h.items = [chickenCandidate()];
    const fixture = makeGoverned();

    const outcome = await lookupNativeFoodReference(
      { text: 'How many calories and grams of protein are in 150g cooked chicken breast?', language: 'en' },
      scopeOf(fixture),
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok || outcome.outcome !== 'reference') throw new Error('expected reference');
    const [reference] = outcome.references;
    expect(reference.name).toBe('Chicken breast, cooked');
    expect(reference.identity).toBe('model');
    expect(reference.estimate).toBe(true);
    expect(reference.source).toBeNull();
    expect(reference.brand).toBeNull();
    expect(reference.preparation).toBe('cooked');
    expect(reference.portionBasis).toBe('measured_mass');
    expect(reference.portion).toMatchObject({ quantity: 150, unit: 'g', grams: 150, explicit: true });
    expect(reference.nutrients).toEqual({ kcal: 247.5, proteinG: 46.5, carbsG: 0, fatG: 5.4, fiberG: null, sugarG: null });
    expect(reference.per100g).toEqual({ kcal: 165, proteinG: 31, carbsG: 0, fatG: 3.6 });

    // Exactly one model pipeline run, one admitted provider phase, no retry.
    expect(runtimeMocks.calls).toBe(1);
    expect(fixture.provider).toHaveBeenCalledTimes(1);
    expect(fixture.events).toEqual(['reserve', 'claim_dispatch', 'settle']);
  });

  it('rescales a portion-only follow-up deterministically from the immutable basis', async () => {
    h.items = [chickenCandidate()];
    const fixture = makeGoverned();
    const outcome = await lookupNativeFoodReference({ text: '150g cooked chicken breast', language: 'en' }, scopeOf(fixture));
    if (!outcome.ok || outcome.outcome !== 'reference') throw new Error('expected reference');

    const scaled = rescaleNativeFoodReference(outcome.references[0], 200);
    expect(scaled?.nutrients).toEqual({ kcal: 330, proteinG: 62, carbsG: 0, fatG: 7.2, fiberG: null, sugarG: null });
    expect(scaled?.portion).toMatchObject({ quantity: 200, unit: 'g', grams: 200 });
    expect(scaled?.estimate).toBe(true);
    // No new provider phase for the arithmetic.
    expect(runtimeMocks.calls).toBe(1);
    expect(fixture.provider).toHaveBeenCalledTimes(1);
    expect(rescaleNativeFoodReference(outcome.references[0], 0)).toBeNull();
    expect(rescaleNativeFoodReference(outcome.references[0], 99_999)).toBeNull();
    expect(rescaleNativeFoodReference(outcome.references[0], Number.NaN)).toBeNull();
  });

  it('keeps a decimal-gram portion honest and derives its per-100 g basis', () => {
    // Valid mass regression: the typed amount and grams agree, so the portion is
    // an honest measured mass (not refused). AG4 refused the inconsistent 0.5 kg /
    // 87.5 g case separately.
    const reference = projectNativeFoodReference(item({ quantity: 87.5, unit: 'g', grams: 87.5, calories: 144.375, protein_g: 27.125, carbs_g: 0, fat_g: 3.15 }));
    expect(reference).toMatchObject({ portion: { quantity: 87.5, unit: 'g', grams: 87.5, explicit: true }, portionBasis: 'measured_mass' });
    expect(reference?.per100g).toEqual({ kcal: 165, proteinG: 31, carbsG: 0, fatG: 3.6 });
  });

  it('fails closed on provider failure without a second attempt and without a match', async () => {
    h.fail = true;
    const fixture = makeGoverned();
    const outcome = await lookupNativeFoodReference({ text: '150g cooked chicken breast', language: 'en' }, scopeOf(fixture));

    expect(outcome.ok).toBe(false);
    expect(outcome.outcome).not.toBe('no_match');
    expect(fixture.provider).toHaveBeenCalledTimes(1);
    expect(runtimeMocks.calls).toBe(1);
  });

  it('honors a blocked budget with no provider dispatch and no match', async () => {
    h.items = [chickenCandidate()];
    const fixture = makeGoverned(true);
    const outcome = await lookupNativeFoodReference({ text: '150g cooked chicken breast', language: 'en' }, scopeOf(fixture));

    expect(outcome.ok).toBe(false);
    expect(outcome.outcome).not.toBe('no_match');
    expect(fixture.provider).not.toHaveBeenCalled();
    expect(fixture.events).toEqual(['reserve']);
  });

  it('re-throws cancellation and dispatches nothing', async () => {
    h.items = [chickenCandidate()];
    const fixture = makeGoverned();
    const controller = new AbortController();
    controller.abort();
    const scope: NativeFoodReferenceScope = { actorId: id(2), requestId: id(3), signal: controller.signal, transport: fixture.governed.transport };

    await expect(lookupNativeFoodReference({ text: '150g cooked chicken breast' }, scope)).rejects.toThrow();
    expect(fixture.provider).not.toHaveBeenCalled();
    expect(fixture.events).toEqual([]);
  });

  it('refuses a transport without the Food food_parse admission marker', async () => {
    const fake = vi.fn().mockResolvedValue({ items: [] });
    const fallback = createNativeFoodReferenceFallback(fake as never);
    await expect(fallback({ text: '150g chicken' }, { actorId: id(2), requestId: id(3), signal: new AbortController().signal, transport: vi.fn() as never }))
      .rejects.toThrow('budget_blocked');
    expect(fake).not.toHaveBeenCalled();
  });
});

// ── Input / output edge cases via the typed injected parser port ─────────────
describe('native reference fallback truthful outcomes', () => {
  const stub = (output: unknown) => createNativeFoodReferenceFallback(async () => output as never);

  it('refuses empty and oversized text before any transport use', async () => {
    const fixture = makeGoverned();
    const scope = scopeOf(fixture);
    expect(await lookupNativeFoodReference({ text: '   ' }, scope)).toEqual({ ok: false, outcome: 'invalid_input', detail: 'empty' });
    expect(await lookupNativeFoodReference({ text: 'x'.repeat(501) }, scope)).toEqual({ ok: false, outcome: 'invalid_input', detail: 'too_long' });
    expect(fixture.provider).not.toHaveBeenCalled();
  });

  it('returns every item as a separate reference and never merges them', async () => {
    const fixture = makeGoverned();
    const fallback = stub({ items: [item(), item({ raw_text: 'rice', food_name: 'Rice, white, cooked', calories: 195, protein_g: 4 })] });
    const outcome = await fallback({ text: '150 g chicken and 150 g rice' }, scopeOf(fixture));
    if (!outcome.ok || outcome.outcome !== 'reference') throw new Error('expected reference');
    expect(outcome.references).toHaveLength(2);
    expect(outcome.references.map(r => r.name)).toEqual(['Chicken breast, cooked', 'Rice, white, cooked']);
  });

  it('reports a partial parse as clarification with the honest partial references', async () => {
    const fixture = makeGoverned();
    const fallback = stub({ items: [item()], needs_clarification: true, clarification_question: 'Which cut?' });
    const outcome: NativeFoodReferenceOutcome = await fallback({ text: '150 g chicken breast' }, scopeOf(fixture));
    expect(outcome).toEqual({ ok: true, outcome: 'clarification_required', question: 'Which cut?', partial: [expect.objectContaining({ name: 'Chicken breast, cooked' })] });
  });

  it('reports an honest no-match with no references and no fabricated macros', async () => {
    const fixture = makeGoverned();
    const fallback = stub({ items: [], needs_clarification: false, clarification_question: null });
    expect(await fallback({ text: 'some food' }, scopeOf(fixture))).toEqual({ ok: true, outcome: 'no_match' });
  });

  it('refuses a malformed parser item whole instead of dropping or trusting it', async () => {
    const fixture = makeGoverned();
    const fallback = stub({ items: [{ food_name: 'mystery', grams: 'lots' }], needs_clarification: false });
    expect(await fallback({ text: 'mystery food' }, scopeOf(fixture))).toEqual({ ok: false, outcome: 'incomplete' });
  });
});

// ── Provenance honesty ───────────────────────────────────────────────────────
describe('native reference provenance', () => {
  it('distinguishes a branded official row from a generic model estimate', () => {
    // Branded row + explicit MASS: the typed grams ARE the portion, so the row's own
    // macros stand — not an estimate; brand/source/quality propagate verbatim.
    const brandedMass = projectNativeFoodReference(item({
      food_name: 'FAGE Total 2% Greek Yogurt', source: 'local_db', brand: 'FAGE', db_source: 'off',
      data_quality: 'label', db_food_id: 'food-1', food_state: 'prepared', quantity: 227, unit: 'g', grams: 227,
      calories: 190, protein_g: 20, carbs_g: 8, fat_g: 5, sugar_g: 8,
    }));
    // Branded row + explicit NON-mass unit with no conversion provenance: the identity
    // is catalogue but the portion is a model guess, so the totals are an estimate.
    const brandedCup = projectNativeFoodReference(item({
      food_name: 'FAGE Total 2% Greek Yogurt', source: 'local_db', brand: 'FAGE', db_source: 'off',
      data_quality: 'label', db_food_id: 'food-1', food_state: 'prepared', quantity: 1, unit: 'cup', grams: 227,
      calories: 190, protein_g: 20, carbs_g: 8, fat_g: 5, sugar_g: 8,
    }));
    const generic = projectNativeFoodReference(item());

    expect(brandedMass).toMatchObject({ identity: 'catalogue', estimate: false, portionBasis: 'measured_mass', source: 'off', quality: 'label', brand: 'FAGE' });
    expect(brandedCup).toMatchObject({ identity: 'catalogue', estimate: true, portionBasis: 'model_estimate', source: 'off', quality: 'label', brand: 'FAGE' });
    expect(generic).toMatchObject({ identity: 'model', estimate: true, source: null, quality: null, brand: null });
    // A category-default row carries a real identity but never an official estimate claim.
    const categoryDefault = projectNativeFoodReference(item({ source: 'local_db+category_default', db_food_id: 'food-2', db_source: 'usda' }));
    expect(categoryDefault).toMatchObject({ identity: 'catalogue', estimate: true });
  });

  it('surfaces a user-stated preparation that conflicts with the matched row', async () => {
    const fixture = makeGoverned();
    const fallback = createNativeFoodReferenceFallback(async () => ({
      items: [item({ raw_text: 'chicken', food_name: 'Chicken breast, cooked', source: 'local_db', db_food_id: 'food-9', db_source: 'usda', data_quality: 'lab_verified' })],
      needs_clarification: false,
    }) as never);
    const mismatch = await fallback({ text: '150 g raw chicken breast' }, scopeOf(fixture));
    expect(mismatch).toEqual({ ok: true, outcome: 'preparation_mismatch', stated: 'raw', matched: 'cooked', references: [expect.objectContaining({ name: 'Chicken breast, cooked' })] });

    const matching = await fallback({ text: '150 g cooked chicken breast' }, scopeOf(fixture));
    expect(matching.ok && matching.outcome).toBe('reference');
  });

  it('keeps the original portion basis and grams instead of a 100 g masquerade', () => {
    // AG4 provenance gap: a non-mass unit has NO proven conversion. A `local_db` row
    // + `db_food_id` proves the FOOD identity, not the cup→grams conversion, and
    // `ParsedFoodItem` emits no `conversionId` — so the portion stays an honest model
    // estimate (never `validated_conversion`) and the overall estimate flag is truthful.
    const projected = projectNativeFoodReference(item({ quantity: 1, unit: 'cup', grams: 140, portion_explicit: true, source: 'local_db', db_food_id: 'food-3', db_source: 'usda', data_quality: 'label' }));
    expect(projected?.portion).toMatchObject({ quantity: 1, unit: 'cup', grams: 140, explicit: true });
    expect(projected?.portionBasis).toBe('model_estimate');
    expect(projected?.estimate).toBe(true);
    expect(projected?.per100g?.proteinG).toBe(33.214286);
  });

  it('never certifies a local_db cup without real unit-conversion provenance', () => {
    // AG4 provenance gap (required regression): `local_db` + `db_food_id` proves FOOD
    // identity, NOT that the cup/piece grams came from a persisted `food_unit_conversions`
    // row — and `ParsedFoodItem` emits no `conversionId`. The portion must stay an
    // estimate, and the overall estimate flag must be truthful even though the nutrient
    // basis is the row itself. Identity/source/quality are still propagated verbatim.
    const reference = projectNativeFoodReference(item({
      food_name: 'Greek yogurt', source: 'local_db', db_food_id: 'food-42', db_source: 'usda',
      data_quality: 'label', quantity: 1, unit: 'cup', grams: 227, portion_explicit: true,
      calories: 190, protein_g: 20, carbs_g: 8, fat_g: 5, fiber_g: 0, sugar_g: 8,
    }));
    expect(reference?.identity).toBe('catalogue');
    expect(reference?.source).toBe('usda');
    expect(reference?.quality).toBe('label');
    expect(reference?.portionBasis).toBe('model_estimate');
    expect(reference?.portionBasis).not.toBe('validated_conversion');
    expect(reference?.estimate).toBe(true);
  });

  it('keeps an explicit mass consistent with grams as a non-estimated measured portion', () => {
    // Real-mass regression: a `local_db` row with a user-stated mass equal to the
    // parser's own grams stays `measured_mass`; the row's macros stand (not an
    // estimate) and source/quality/identity propagate verbatim.
    const reference = projectNativeFoodReference(item({
      food_name: 'Chicken breast, cooked', source: 'local_db', db_food_id: 'food-7', db_source: 'usda',
      data_quality: 'lab_verified', quantity: 150, unit: 'g', grams: 150, portion_explicit: true,
    }));
    expect(reference).toMatchObject({ identity: 'catalogue', estimate: false, portionBasis: 'measured_mass', source: 'usda', quality: 'lab_verified' });
    expect(reference?.portion).toMatchObject({ quantity: 150, unit: 'g', grams: 150, explicit: true });
  });

  it('refuses an inconsistent explicit mass user-visibly instead of fabricating a measured reference', async () => {
    // Mass regression (user-visible): "0.5 kg" next to 87.5 g is not a
    // measurement. The lookup reports a failure — never a reference and never a
    // no-match — and dispatches no provider phase. No number is invented.
    const fixture = makeGoverned();
    const fallback = createNativeFoodReferenceFallback(async () => ({
      items: [item({ quantity: 0.5, unit: 'kg', grams: 87.5, calories: 144.375, protein_g: 27.125, carbs_g: 0, fat_g: 3.15 })],
      needs_clarification: false,
    }) as never);
    const outcome = await fallback({ text: '0.5 kg cooked chicken breast' }, scopeOf(fixture));
    expect(outcome).toEqual({ ok: false, outcome: 'incomplete' });
    expect(outcome.outcome).not.toBe('no_match');
    expect(fixture.provider).not.toHaveBeenCalled();
    expect(runtimeMocks.calls).toBe(0);
  });
});

// ── Catalogue-first orchestration ────────────────────────────────────────────
describe('catalogue-first reference resolution', () => {
  const catalogueReference: FoodReference = foodReferenceSchema.parse({
    referenceId: 'rice|usda|cooked', name: 'Rice, white, cooked', source: 'usda', quality: 'lab_verified',
    preparation: 'cooked', kcalPer100g: 130, proteinPer100g: 2.7, conversions: [],
  });

  const nativeOutcome: NativeFoodReferenceOutcome = { ok: true, outcome: 'reference', references: [projectNativeFoodReference(item())!] };

  it('prefers a catalogue hit and never charges the fallback', async () => {
    const catalogue = vi.fn().mockResolvedValue(catalogueReference);
    const native = vi.fn().mockResolvedValue(nativeOutcome);
    const resolve = createCatalogueFirstFoodReference({ catalogue, native });
    const fixture = makeGoverned();

    const result = await resolve({ name: 'rice', text: '100 g rice' }, scopeOf(fixture));
    expect(result).toEqual({ ok: true, kind: 'catalogue', reference: catalogueReference });
    expect(native).not.toHaveBeenCalled();
  });

  it('runs the fallback only for a genuine catalogue miss', async () => {
    const catalogue = vi.fn().mockResolvedValue(null);
    const native = vi.fn().mockResolvedValue(nativeOutcome);
    const resolve = createCatalogueFirstFoodReference({ catalogue, native });
    const fixture = makeGoverned();

    const result = await resolve({ name: 'chicken breast', text: '150 g cooked chicken breast' }, scopeOf(fixture));
    expect(result).toEqual({ ok: true, kind: 'native', references: nativeOutcome.ok && nativeOutcome.outcome === 'reference' ? nativeOutcome.references : [] });
    expect(native).toHaveBeenCalledTimes(1);
  });

  it('treats a catalogue failure as a failure, not a miss, and never falls back', async () => {
    const catalogue = vi.fn().mockRejectedValue(new Error('lookup unavailable'));
    const native = vi.fn().mockResolvedValue(nativeOutcome);
    const resolve = createCatalogueFirstFoodReference({ catalogue, native });
    const fixture = makeGoverned();

    expect(await resolve({ name: 'chicken', text: '150 g chicken' }, scopeOf(fixture))).toEqual({ ok: false, error: 'catalogue_failed' });
    expect(native).not.toHaveBeenCalled();
  });

  it('propagates a missing native match rather than inventing one', async () => {
    const catalogue = vi.fn().mockResolvedValue(null);
    const native = vi.fn().mockResolvedValue({ ok: true, outcome: 'no_match' });
    const resolve = createCatalogueFirstFoodReference({ catalogue, native });
    const fixture = makeGoverned();
    expect(await resolve({ name: 'chicken', text: '150 g chicken' }, scopeOf(fixture))).toEqual({ ok: true, kind: 'no_match' });
  });
});

// ── Structural guard: the adapter stays read-only ────────────────────────────
describe('read-only adapter surface', () => {
  it('imports no writer, database or receipt path', () => {
    const source = readFileSync(new URL('./food-reference-native-fallback.ts', import.meta.url), 'utf-8');
    expect(source).not.toMatch(/text-food-service|log-create-service|food-actions|db\/client|coach_action_proposals|insertReviewed|FoodLogRow/);
  });

  it('bounds native phases to the shared algorithm ceiling, never a per-call cap', () => {
    expect(TEXT_FOOD_MAX_PHASES).toBe(2 + 2 * 12);
  });
});
