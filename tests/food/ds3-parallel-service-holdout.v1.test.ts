import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  PARALLEL_SEARCH_MODEL, PARALLEL_SEARCH_QUERY_RESERVATION_NANO_USD,
  decidePilotBudgetCommand, pilotRecordActiveCharge,
  type PilotAttemptRecord, type PilotBudgetCommand,
} from '@/agents/coach-assistant/pilot-budget';
import {
  buildNutritionSearchQuery, createNutritionSearchCache, createNutritionSearchRuntime, runNutritionSearch,
  nutritionSearchCacheKey, PARALLEL_API_KEY_ENV,
} from '@/lib/food/nutrition-search';
import {
  NutritionSearchTransportError,
  type NutritionSearchPage, type ParallelNutritionSearchRequest,
} from '@/lib/food/nutrition-search-transport';

const DAY = '2026-09-13';
const page = {
  searchId: 'srch_1',
  results: [{
    title: 'Big Mac', url: 'https://fdc.nal.usda.gov/food/1', host: 'fdc.nal.usda.gov',
    snippet: 'Per 100 g: 257 kcal', publishDate: '2024-01-02', position: 1, officialSource: true,
  }],
};

function memoryStore(options: { cap?: number; seed?: PilotAttemptRecord[] } = {}) {
  const records = new Map<string, PilotAttemptRecord>();
  for (const record of options.seed ?? []) records.set(record.binding.attemptId, record);
  const cap = options.cap ?? 3_000_000_000;
  const execute = vi.fn(async (command: PilotBudgetCommand) => {
    const binding = command.binding;
    let existing: PilotAttemptRecord | undefined, turnAttemptCount = 0, searchTurnCount = 0, total = 0, accountingBlocked = false;
    for (const record of records.values()) {
      if (record.binding.pilotId !== binding.pilotId) continue;
      total += pilotRecordActiveCharge(record, DAY);
      accountingBlocked ||= record.accountingAlert;
      if (record.binding.turnId === binding.turnId) {
        if (record.binding.model === PARALLEL_SEARCH_MODEL) searchTurnCount++;
        else turnAttemptCount++;
      }
      if (record.binding.attemptId === binding.attemptId || record.binding.agentRunId === binding.agentRunId) existing = record;
    }
    const decision = decidePilotBudgetCommand({
      pilotId: binding.pilotId, budgetDay: DAY, capNanoUsd: cap, chargedNanoUsd: total,
      turnAttemptCount, searchTurnCount, accountingBlocked, existing,
    }, command);
    if (decision.ok && decision.write !== 'none') records.set(decision.record.binding.attemptId, decision.record);
    return { storage: 'database', ...decision };
  });
  return { execute, records };
}

const identity = () => ({ pilotId: randomUUID(), actorId: randomUUID(), turnId: randomUUID() });
const transportOf = (impl: (request: ParallelNutritionSearchRequest) => Promise<NutritionSearchPage> = async () => page) =>
  ({ search: vi.fn(impl) });
const okEvidence = (result: Awaited<ReturnType<typeof runNutritionSearch>>) => {
  if (result.status !== 'ok') throw new Error(`expected ok, got ${result.reason}`);
  return result.evidence;
};

describe('one governed Parallel nutrition search per stable turn', () => {
  it('settles exactly one request and returns provenance for the governed model', async () => {
    const store = memoryStore(), ids = identity();
    const transport = transportOf();
    const result = await runNutritionSearch(
      { product: 'Big Mac', brand: null, locale: 'es-CO' },
      { transport, store, ...ids, signal: new AbortController().signal },
    );
    expect(result).toMatchObject({ status: 'ok', cached: false, creditConsumed: true });
    const evidence = okEvidence(result);
    expect(evidence.provider).toBe('parallel');
    expect(evidence.endpoint).toBe('https://api.parallel.ai/v1/search');
    expect(evidence.market).toBe('Colombia');
    expect(evidence.location).toBeNull();
    expect(evidence.query).toContain('Colombia');
    expect(evidence.objective).toContain('Colombia');
    expect(evidence.results[0]).toMatchObject({ host: 'fdc.nal.usda.gov', officialSource: true });
    const [record] = [...store.records.values()];
    expect(record).toMatchObject({ state: 'settled', chargedNanoUsd: PARALLEL_SEARCH_QUERY_RESERVATION_NANO_USD });
    expect(record.usage).toEqual({ requests: 1 });
    expect(transport.search).toHaveBeenCalledTimes(1);
    const request = transport.search.mock.calls[0][0];
    expect(request.location).toBeNull();
    expect(request.query).toBe(evidence.query);
  });

  it('blocks the third search for one stable turn and never weakens the model ceiling', async () => {
    const store = memoryStore(), ids = identity();
    const transport = transportOf();
    const run = (product: string) => runNutritionSearch(
      { product, brand: null, locale: 'es-CO' },
      { transport, store, ...ids, signal: new AbortController().signal },
    );
    expect((await run('Big Mac')).status).toBe('ok');
    expect((await run('Double Big Mac')).status).toBe('ok');
    expect(await run('McNuggets')).toMatchObject({ status: 'unavailable', reason: 'budget_blocked', creditConsumed: false });
    expect(transport.search).toHaveBeenCalledTimes(2);
  });

  it('keeps the model and search per-turn ceilings independent', () => {
    const ids = identity();
    const charged = 2 * PARALLEL_SEARCH_QUERY_RESERVATION_NANO_USD;
    // Two settled searches on the turn: the model counter stays at zero.
    const luna = {
      pilotId: ids.pilotId, actorId: ids.actorId, attemptId: randomUUID(), agentRunId: randomUUID(), turnId: ids.turnId,
      model: 'gpt-5.6-luna' as const, pricingVersion: 'gpt-5.6-luna-standard-2026-09-08',
      reservedNanoUsd: 4_400_000, requestHash: 'b'.repeat(64),
    };
    expect(decidePilotBudgetCommand({
      pilotId: luna.pilotId, budgetDay: DAY, capNanoUsd: 3_000_000_000, chargedNanoUsd: charged,
      turnAttemptCount: 0, searchTurnCount: 2, accountingBlocked: false,
    }, { operation: 'reserve', binding: luna })).toMatchObject({ ok: true, record: { state: 'reserved' } });

    // Two model attempts already on the turn do not block a search.
    const search = {
      pilotId: ids.pilotId, actorId: ids.actorId, attemptId: randomUUID(), agentRunId: randomUUID(), turnId: ids.turnId,
      model: PARALLEL_SEARCH_MODEL, pricingVersion: 'parallel-search-fast-2026-09-13',
      reservedNanoUsd: PARALLEL_SEARCH_QUERY_RESERVATION_NANO_USD, requestHash: 'c'.repeat(64),
    };
    expect(decidePilotBudgetCommand({
      pilotId: search.pilotId, budgetDay: DAY, capNanoUsd: 3_000_000_000, chargedNanoUsd: charged,
      turnAttemptCount: 2, searchTurnCount: 0, accountingBlocked: false,
    }, { operation: 'reserve', binding: search })).toMatchObject({ ok: true, record: { state: 'reserved' } });

    // The third search on the same turn is blocked even with an empty model count.
    expect(decidePilotBudgetCommand({
      pilotId: search.pilotId, budgetDay: DAY, capNanoUsd: 3_000_000_000, chargedNanoUsd: charged,
      turnAttemptCount: 0, searchTurnCount: 2, accountingBlocked: false,
    }, { operation: 'reserve', binding: search })).toMatchObject({ ok: false, error: 'budget_blocked' });
  });

  it('never calls the provider twice for a duplicate or a concurrent replay', async () => {
    const ids = identity();
    const input = { product: 'Big Mac', brand: null, locale: 'es-CO' };
    const store = memoryStore();
    const transport = transportOf();
    const deps = { transport, store, ...ids, signal: new AbortController().signal };
    const first = await runNutritionSearch(input, deps);
    expect(first.status).toBe('ok');
    const replay = await runNutritionSearch(input, deps);
    expect(replay).toMatchObject({ status: 'unavailable', reason: 'duplicate', creditConsumed: true });
    expect(transport.search).toHaveBeenCalledTimes(1);

    const ids2 = identity();
    const store2 = memoryStore();
    const transport2 = transportOf();
    const deps2 = { transport: transport2, store: store2, ...ids2, signal: new AbortController().signal };
    const [a, b] = await Promise.all([runNutritionSearch(input, deps2), runNutritionSearch(input, deps2)]);
    const statuses = [a.status === 'ok' ? 'ok' : a.reason, b.status === 'ok' ? 'ok' : b.reason].sort();
    expect(statuses).toEqual(['duplicate', 'ok']);
    expect(transport2.search).toHaveBeenCalledTimes(1);
  });

  it('retains an ambiguous post-dispatch reservation as unknown, never as a false free search', async () => {
    const ids = identity(), store = memoryStore();
    const transport = { search: vi.fn(async () => { throw new NutritionSearchTransportError('network'); }) };
    const result = await runNutritionSearch(
      { product: 'Big Mac', brand: null, locale: 'es-CO' },
      { transport, store, ...ids, signal: new AbortController().signal },
    );
    expect(result).toMatchObject({ status: 'unavailable', reason: 'provider_unavailable', dispatched: true, creditConsumed: true });
    const [record] = [...store.records.values()];
    expect(record).toMatchObject({ state: 'unknown', chargedNanoUsd: PARALLEL_SEARCH_QUERY_RESERVATION_NANO_USD });
  });

  it('bounds a hung accounting write instead of awaiting forever', async () => {
    vi.useFakeTimers();
    try {
      const ids = identity(), store = memoryStore();
      const hangingStore = {
        execute: vi.fn(async (command: PilotBudgetCommand) =>
          command.operation === 'settle' ? new Promise<never>(() => undefined) : store.execute(command)),
      };
      const promise = runNutritionSearch(
        { product: 'Big Mac', brand: null, locale: 'es-CO' },
        { transport: transportOf(), store: hangingStore, ...ids, signal: new AbortController().signal },
      );
      await vi.advanceTimersByTimeAsync(5_000);
      await expect(promise).resolves.toMatchObject({ status: 'unavailable', reason: 'accounting_uncertain', creditConsumed: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects smuggled profile/chat fields before any dispatch', async () => {
    const ids = identity(), store = memoryStore(), transport = transportOf();
    const result = await runNutritionSearch(
      { product: 'Big Mac', brand: null, locale: 'es-CO', conversation: 'private meal log' },
      { transport, store, ...ids, signal: new AbortController().signal },
    );
    expect(result).toMatchObject({ status: 'unavailable', reason: 'invalid_input' });
    expect(transport.search).not.toHaveBeenCalled();
  });

  it('shares one canonical daily cap with the other paid modalities', async () => {
    const ids = identity(), store = memoryStore({ cap: 1_500_000 });
    store.records.set('seed', {
      binding: {
        pilotId: ids.pilotId, actorId: ids.actorId, attemptId: randomUUID(), agentRunId: randomUUID(), turnId: randomUUID(),
        model: PARALLEL_SEARCH_MODEL, pricingVersion: 'parallel-search-fast-2026-09-13',
        reservedNanoUsd: PARALLEL_SEARCH_QUERY_RESERVATION_NANO_USD, requestHash: 'd'.repeat(64),
      },
      admissionDay: DAY, state: 'settled', chargedNanoUsd: PARALLEL_SEARCH_QUERY_RESERVATION_NANO_USD,
      usage: { requests: 1 }, accountingAlert: false,
    });
    const transport = transportOf();
    const result = await runNutritionSearch(
      { product: 'Big Mac', brand: null, locale: 'es-CO' },
      { transport, store, ...ids, signal: new AbortController().signal },
    );
    expect(result).toMatchObject({ status: 'unavailable', reason: 'budget_blocked', creditConsumed: false });
    expect(transport.search).not.toHaveBeenCalled();
  });
});

describe('cache and provenance boundaries', () => {
  it('serves a bounded nonprivate cache hit without spending a query credit', async () => {
    const ids = identity(), store = memoryStore(), transport = transportOf();
    const cache = createNutritionSearchCache({ now: () => 0 });
    const deps = { transport, store, cache, ...ids, signal: new AbortController().signal };
    const input = { product: 'Big Mac', brand: null, locale: 'es-CO' };
    expect((await runNutritionSearch(input, deps)).status).toBe('ok');
    const second = await runNutritionSearch(input, deps);
    expect(second).toMatchObject({ status: 'ok', cached: true, creditConsumed: false });
    expect(transport.search).toHaveBeenCalledTimes(1);
  });

  it('keeps a Big Mac and a Double Big Mac apart in query, provenance and cache key', async () => {
    const plain = buildNutritionSearchQuery({ product: 'Big Mac', brand: null, locale: 'es-CO' });
    const double = buildNutritionSearchQuery({ product: 'Double Big Mac', brand: null, locale: 'es-CO' });
    expect(plain.query).not.toBe(double.query);
    expect(nutritionSearchCacheKey({ product: 'Big Mac', brand: null, locale: 'es-CO' }))
      .not.toBe(nutritionSearchCacheKey({ product: 'Double Big Mac', brand: null, locale: 'es-CO' }));

    const ids = identity(), store = memoryStore(), transport = transportOf();
    const cache = createNutritionSearchCache({ now: () => 0 });
    const deps = { transport, store, cache, ...ids, signal: new AbortController().signal };
    const first = okEvidence(await runNutritionSearch({ product: 'Big Mac', brand: null, locale: 'es-CO' }, deps));
    const second = okEvidence(await runNutritionSearch({ product: 'Double Big Mac', brand: null, locale: 'es-CO' }, deps));
    expect(first.product).toBe('Big Mac');
    expect(second.product).toBe('Double Big Mac');
    expect(transport.search).toHaveBeenCalledTimes(2);
  });
});

describe('server composition root', () => {
  it('returns a typed unavailable callable (zero dispatch) when the key is absent', async () => {
    const ids = identity(), store = memoryStore();
    const fetchImpl = vi.fn();
    const runtime = createNutritionSearchRuntime({}, { store, ...ids, fetch: fetchImpl as unknown as typeof globalThis.fetch });
    expect(runtime.ok).toBe(false);
    await expect(runtime.search({ product: 'Big Mac', brand: null, locale: 'es-CO' }, new AbortController().signal))
      .resolves.toMatchObject({ status: 'unavailable', reason: 'missing_credentials' });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(PARALLEL_API_KEY_ENV).toBe('PARALLEL_API_KEY');
  });

  it('uses the private Parallel key when present', () => {
    const ids = identity(), store = memoryStore();
    const runtime = createNutritionSearchRuntime(
      { [PARALLEL_API_KEY_ENV]: 'test-key' },
      { store, ...ids, fetch: vi.fn() as unknown as typeof globalThis.fetch },
    );
    expect(runtime.ok).toBe(true);
  });
});

it('AG4 cache cannot reuse evidence for a different valid brand/product tuple',async()=>{
 const cache=createNutritionSearchCache(),store=memoryStore(),ids=identity(),transport=transportOf();
 const deps={cache,store,...ids,transport,signal:new AbortController().signal};
 const first=await runNutritionSearch({product:'B|C',brand:'A',locale:'en-US'},deps);
 expect(first.status).toBe('ok');
 const second=await runNutritionSearch({product:'C',brand:'A|B',locale:'en-US'},deps);
 expect(second.status).toBe('ok');
 if(second.status==='ok') {expect(second.evidence.product).toBe('C');expect(second.evidence.brand).toBe('A|B');}
 expect(transport.search).toHaveBeenCalledTimes(2);
});
