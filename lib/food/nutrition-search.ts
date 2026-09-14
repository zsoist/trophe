import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  executePilotBudgetCommand, providerFailureDiagnosticSchema, PARALLEL_SEARCH_MODEL, PARALLEL_SEARCH_PRICING_VERSION,
  PARALLEL_SEARCH_QUERY_RESERVATION_NANO_USD,
  type PilotAttemptBinding, type PilotBudgetCommand, type PilotBudgetError, type PilotBudgetResult, type PilotBudgetStore,
  type ProviderFailureDiagnostic,
} from '@/agents/coach-assistant/pilot-budget';
import {
  createParallelNutritionSearchTransport, isSupportedParallelLocation, NutritionSearchTransportError,
  NUTRITION_SEARCH_MAX_OBJECTIVE_CHARS, NUTRITION_SEARCH_MAX_QUERY_CHARS, NUTRITION_SEARCH_MAX_RESULTS,
  NUTRITION_SEARCH_MAX_SEARCH_ID_CHARS, nutritionSearchPageSchema, nutritionSearchSourceSchema, PARALLEL_SEARCH_ENDPOINT,
  type NutritionSearchTransport,
} from './nutrition-search-transport';

export { PARALLEL_SEARCH_ENDPOINT, PARALLEL_SEARCH_MODE, PARALLEL_SUPPORTED_LOCATIONS } from './nutrition-search-transport';
export type { NutritionSearchSource, NutritionSearchTransport, ParallelNutritionSearchRequest } from './nutrition-search-transport';

/** Private server-only environment name. Never a client value, never logged. */
export const PARALLEL_API_KEY_ENV = 'PARALLEL_API_KEY';
/** Accounting deadline for the post-dispatch ledger write. Bounds the real await. */
export const NUTRITION_SEARCH_ACCOUNTING_TIMEOUT_MS = 5_000;
/** A cached product/market/reference fact is public web evidence, not user data. */
export const NUTRITION_SEARCH_CACHE_TTL_MS = 6 * 60 * 60 * 1_000;
export const NUTRITION_SEARCH_CACHE_MAX_ENTRIES = 64;

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

/** Product/brand/locale only. Chat history, profile and meal logs can never be
 * smuggled in: the strict schema rejects every extra key, including turn ids. */
export const nutritionSearchInputSchema = z.object({
  product: z.string().trim().min(1).max(80).refine(value => !CONTROL_CHARS.test(value)),
  brand: z.string().trim().max(60).refine(value => !CONTROL_CHARS.test(value)).nullable().optional(),
  locale: z.string().trim().regex(/^[a-z]{2}(-[A-Z]{2})?$/),
}).strict();
export type NutritionSearchInput = z.infer<typeof nutritionSearchInputSchema>;

/** Documented query terms per language keep the brand identity and the serving
 * basis explicit. An undocumented language falls back to the English term; no
 * language is silently treated as having a special (e.g. "turbo") mode. */
const QUERY_TERMS: Record<string, string> = {
  en: 'nutrition facts per 100 g',
  es: 'información nutricional por 100 g',
  el: 'διατροφικά στοιχεία ανά 100 g',
};

const regionDisplay = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    return null;
  }
})();
const languageDisplay = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' });
  } catch {
    return null;
  }
})();

function marketLabel(region: string): string {
  const name = regionDisplay?.of(region);
  return typeof name === 'string' && name && name !== region ? name : region;
}

function languageLabel(language: string): string {
  const name = languageDisplay?.of(language);
  return typeof name === 'string' && name && name !== language ? name : language;
}

export interface NutritionSearchQueryPlan {
  /** Natural-language research objective sent to Parallel. */
  objective: string;
  /** The single `search_queries[0]` value: product + brand + market + language. */
  query: string;
  language: string;
  hl: string;
  region: string | null;
  /** Human-readable market preserved even when the provider location is unsupported. */
  market: string | null;
  /** Allowlisted provider location code, or null when unsupported (never a US default). */
  location: string | null;
}

/** Builds the product + brand + market + language query plan. The market is kept
 * in both the objective and the query text. A country that Parallel does not
 * support (e.g. Colombia, 'CO') omits `location` but never drops the market. */
export function buildNutritionSearchQuery(input: {
  product: string; brand?: string | null; locale: string;
}): NutritionSearchQueryPlan {
  const product = input.product.trim();
  const brand = input.brand?.trim() || null;
  const [language, rawRegion] = input.locale.split('-');
  const region = rawRegion ? rawRegion.toUpperCase() : null;
  const terms = QUERY_TERMS[language] ?? QUERY_TERMS.en;
  const market = region ? marketLabel(region) : null;
  const location = region && isSupportedParallelLocation(region) ? region.toLowerCase() : null;
  const query = [brand, product, market, terms]
    .filter((part): part is string => Boolean(part))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NUTRITION_SEARCH_MAX_QUERY_CHARS);
  const objective = [
    `Publicly documented nutrition facts per 100 g for ${brand ? `${brand} ` : ''}${product}`,
    market ? `in ${market}` : null,
    `(language: ${languageLabel(language)}).`,
    'Return source pages with provenance; do not invent nutrient values.',
  ].filter((part): part is string => Boolean(part)).join(' ').replace(/\s+/g, ' ').trim().slice(0, NUTRITION_SEARCH_MAX_OBJECTIVE_CHARS);
  return { objective, query, language, hl: language, region, market, location };
}

/** Bounded evidence for the existing governed model. It carries source text and
 * provenance only: no macro value is derived from an excerpt, and the market is
 * kept so a regional variant is never silently treated as identical. */
export const nutritionSearchEvidenceSchema = z.object({
  provider: z.literal('parallel'),
  endpoint: z.string().min(1).max(120),
  product: z.string().min(1).max(80),
  brand: z.string().min(1).max(60).nullable(),
  locale: z.string().min(2).max(5),
  market: z.string().min(1).max(80).nullable(),
  location: z.string().min(2).max(2).nullable(),
  hl: z.string().min(2).max(2),
  objective: z.string().min(1).max(NUTRITION_SEARCH_MAX_OBJECTIVE_CHARS),
  query: z.string().min(1).max(NUTRITION_SEARCH_MAX_QUERY_CHARS),
  searchId: z.string().min(1).max(NUTRITION_SEARCH_MAX_SEARCH_ID_CHARS).nullable(),
  fetchedAt: z.string().datetime(),
  results: z.array(nutritionSearchSourceSchema).max(NUTRITION_SEARCH_MAX_RESULTS),
}).strict();
export type NutritionSearchEvidence = z.infer<typeof nutritionSearchEvidenceSchema>;

export type NutritionSearchUnavailableReason =
  | 'invalid_input'
  | 'missing_credentials'
  | 'budget_blocked'
  | 'cancelled'
  | 'accounting_uncertain'
  | 'duplicate'
  | 'provider_unavailable'
  | 'invalid_result';

export type NutritionSearchResult =
  | { status: 'ok'; cached: boolean; creditConsumed: boolean; evidence: NutritionSearchEvidence }
  | { status: 'unavailable'; reason: NutritionSearchUnavailableReason; dispatched: boolean; creditConsumed: boolean };

/** A successful search is cached only as nonprivate product/market facts. A cache
 * hit consumes no query credit because it never reaches the provider. */
export interface NutritionSearchCache {
  get(key: string): NutritionSearchEvidence | null;
  set(key: string, evidence: NutritionSearchEvidence): void;
}

/** Case/whitespace-normalized cache identity. Locale, brand and product are
 * lowercased; a missing brand normalizes to the empty string. */
function normalizeCacheIdentity(input: { product: string; brand: string | null; locale: string }): [string, string, string] {
  return [input.locale.toLowerCase(), (input.brand ?? '').toLowerCase(), input.product.toLowerCase()];
}

/** Unambiguous key: a JSON tuple escapes delimiters inside any component, so a
 * `|`-bearing brand or product can never collide with a different normalized
 * (brand, product) pair (e.g. brandA/productB|C vs brandA|B/productC). */
export function nutritionSearchCacheKey(input: { product: string; brand: string | null; locale: string }): string {
  return JSON.stringify(normalizeCacheIdentity(input));
}

/** A cache hit is served only when its stored provenance still matches the
 * requested normalized product/brand/locale identity and the request's market.
 * A mismatched or invalid payload is never treated as success. */
function cacheMatchesRequest(
  evidence: NutritionSearchEvidence,
  request: { product: string; brand: string | null; locale: string; market: string | null },
): boolean {
  const [locale, brand, product] = normalizeCacheIdentity(request);
  return evidence.product.toLowerCase() === product
    && (evidence.brand ?? '').toLowerCase() === brand
    && evidence.locale.toLowerCase() === locale
    && evidence.market === request.market;
}

export function createNutritionSearchCache(options: {
  ttlMs?: number; maxEntries?: number; now?: () => number;
} = {}): NutritionSearchCache {
  const ttlMs = options.ttlMs ?? NUTRITION_SEARCH_CACHE_TTL_MS;
  const maxEntries = options.maxEntries ?? NUTRITION_SEARCH_CACHE_MAX_ENTRIES;
  const now = options.now ?? Date.now;
  const entries = new Map<string, { expiresAt: number; evidence: NutritionSearchEvidence }>();
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= now()) {
        entries.delete(key);
        return null;
      }
      const validated = nutritionSearchEvidenceSchema.safeParse(entry.evidence);
      if (!validated.success) {
        entries.delete(key);
        return null;
      }
      entries.delete(key);
      entries.set(key, entry);
      return structuredClone(validated.data);
    },
    set(key, evidence) {
      const validated = nutritionSearchEvidenceSchema.safeParse(evidence);
      if (!validated.success) return;
      entries.delete(key);
      entries.set(key, { expiresAt: now() + ttlMs, evidence: structuredClone(validated.data) });
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
    },
  };
}

export interface NutritionSearchDeps {
  transport: NutritionSearchTransport;
  store: PilotBudgetStore;
  /** Server-derived identity supplied by the owning runtime. Never request JSON. */
  pilotId: string;
  actorId: string;
  turnId: string;
  signal: AbortSignal;
  endpoint?: string;
  cache?: NutritionSearchCache | null;
  now?: () => number;
}

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Deterministic UUID-shaped id, mirroring the governed-modality naming so the
 * ledger stays a single canonical store. */
function stableId(parts: readonly string[]): string {
  const bytes = Buffer.from(digest(parts).slice(0, 32), 'hex');
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const unavailable = (
  reason: NutritionSearchUnavailableReason,
  dispatched: boolean,
  creditConsumed: boolean,
): NutritionSearchResult => ({ status: 'unavailable', reason, dispatched, creditConsumed });

/** A missing or ambiguous ledger answer never permits dispatch. An ambiguous
 * answer keeps the reservation counted rather than pretending it was free. */
function ledgerFailure(error: PilotBudgetError): NutritionSearchResult {
  if (error === 'budget_blocked') return unavailable('budget_blocked', false, false);
  if (error === 'cancelled') return unavailable('cancelled', false, false);
  if (error === 'invalid_input') return unavailable('invalid_input', false, false);
  return unavailable('accounting_uncertain', false, true);
}

function diagnosticOf(error: unknown): ProviderFailureDiagnostic {
  const fallback: ProviderFailureDiagnostic = { category: 'unknown', rawStatus: 0, hasUsage: false };
  if (!(error instanceof NutritionSearchTransportError)) return fallback;
  const status = error.rawStatus;
  const rawStatus = typeof status === 'number' && Number.isInteger(status) && status >= 0 && status <= 599 ? status : 0;
  const candidate: ProviderFailureDiagnostic =
    error.kind === 'timeout' ? { category: 'timeout', phase: 'provider_pending', rawStatus, hasUsage: false }
    : error.kind === 'http_status'
      ? {
          category: rawStatus === 401 ? 'auth' : rawStatus === 403 ? 'access' : rawStatus === 429 ? 'rate_limit' : rawStatus >= 500 ? 'provider' : 'unknown',
          rawStatus, hasUsage: false,
        }
    : error.kind === 'network' ? { category: 'network', rawStatus, hasUsage: false }
    : error.kind === 'cancelled' ? fallback
    : { category: 'schema', rawStatus, hasUsage: false };
  const parsed = providerFailureDiagnosticSchema.safeParse(candidate);
  return parsed.success ? parsed.data : fallback;
}

/** Post-dispatch accounting must complete even when the caller was cancelled, so
 * it runs on its own bounded controller and races a hard deadline. */
async function persistAfterDispatch(command: PilotBudgetCommand, store: PilotBudgetStore): Promise<PilotBudgetResult | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('accounting_deadline')), NUTRITION_SEARCH_ACCOUNTING_TIMEOUT_MS);
  const deadline = new Promise<null>(resolve => setTimeout(() => resolve(null), NUTRITION_SEARCH_ACCOUNTING_TIMEOUT_MS));
  try {
    return await Promise.race([executePilotBudgetCommand(command, store, controller.signal), deadline]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One bounded Parallel nutrition search for one stable server-derived user turn,
 * admitted by the existing shared persistent pilot ledger.
 *
 * Ordering: parse product/brand/locale -> cache -> persistent admission ->
 * single dispatch -> truthfully settle or retain unknown. It never retries, and
 * a refusal (budget or missing credential) never dispatches.
 *
 * The caller must resolve the local Food reference first and only search on a
 * miss; see INTEGRATION.md.
 */
export async function runNutritionSearch(rawInput: unknown, deps: NutritionSearchDeps): Promise<NutritionSearchResult> {
  if (!deps?.transport || !deps?.store) return unavailable('missing_credentials', false, false);
  if (deps.signal.aborted) return unavailable('cancelled', false, false);

  const parsed = nutritionSearchInputSchema.safeParse(rawInput);
  if (!parsed.success) return unavailable('invalid_input', false, false);
  if (![deps.pilotId, deps.actorId, deps.turnId].every(value => z.string().uuid().safeParse(value).success)) {
    return unavailable('invalid_input', false, false);
  }

  const product = parsed.data.product;
  const brand = parsed.data.brand?.trim() || null;
  const locale = parsed.data.locale;
  const plan = buildNutritionSearchQuery({ product, brand, locale });
  const cacheKey = nutritionSearchCacheKey({ product, brand, locale });
  const cached = deps.cache?.get(cacheKey) ?? null;
  if (cached && cacheMatchesRequest(cached, { product, brand, locale, market: plan.market })) {
    return { status: 'ok', cached: true, creditConsumed: false, evidence: cached };
  }

  const identity = [deps.pilotId, deps.actorId, deps.turnId, plan.query, plan.location ?? '', plan.hl, 'nutrition-search-v1'];
  const binding: PilotAttemptBinding = {
    pilotId: deps.pilotId,
    actorId: deps.actorId,
    attemptId: stableId([...identity, 'attempt']),
    agentRunId: stableId([...identity, 'budget-run']),
    turnId: deps.turnId,
    model: PARALLEL_SEARCH_MODEL,
    pricingVersion: PARALLEL_SEARCH_PRICING_VERSION,
    reservedNanoUsd: PARALLEL_SEARCH_QUERY_RESERVATION_NANO_USD,
    requestHash: digest({ task: 'nutrition_search', identity }),
  };

  const reserve = await executePilotBudgetCommand({ operation: 'reserve', binding }, deps.store, deps.signal);
  if (!reserve.ok) return ledgerFailure(reserve.error);
  const claim = await executePilotBudgetCommand({ operation: 'claim_dispatch', binding }, deps.store, deps.signal);
  if (!claim.ok) return ledgerFailure(claim.error);
  // A replay, a concurrent duplicate, or an already-open attempt never grants a
  // second transport call.
  if (!claim.dispatchGranted) return unavailable('duplicate', false, claim.record.chargedNanoUsd > 0);

  let page;
  try {
    page = await deps.transport.search({
      objective: plan.objective,
      query: plan.query,
      location: plan.location,
      maxResults: NUTRITION_SEARCH_MAX_RESULTS,
      signal: deps.signal,
    });
  } catch (error) {
    await persistAfterDispatch({ operation: 'mark_unknown', binding, failure: diagnosticOf(error) }, deps.store);
    const cancelled = deps.signal.aborted || (error instanceof NutritionSearchTransportError && error.kind === 'cancelled');
    return unavailable(cancelled ? 'cancelled' : 'provider_unavailable', true, true);
  }

  const validated = nutritionSearchPageSchema.safeParse(page);
  if (!validated.success) {
    await persistAfterDispatch({ operation: 'mark_unknown', binding, failure: { category: 'schema', rawStatus: 0, hasUsage: false } }, deps.store);
    return unavailable('invalid_result', true, true);
  }

  const settled = await persistAfterDispatch({ operation: 'settle', binding, usage: { requests: 1 } }, deps.store);
  if (!settled?.ok || settled.record.state !== 'settled') return unavailable('accounting_uncertain', true, true);

  const evidence: NutritionSearchEvidence = {
    provider: 'parallel',
    endpoint: deps.endpoint ?? PARALLEL_SEARCH_ENDPOINT,
    product,
    brand,
    locale,
    market: plan.market,
    location: plan.location,
    hl: plan.hl,
    objective: plan.objective,
    query: plan.query,
    searchId: validated.data.searchId,
    fetchedAt: new Date((deps.now ?? Date.now)()).toISOString(),
    results: validated.data.results,
  };
  deps.cache?.set(cacheKey, evidence);
  return { status: 'ok', cached: false, creditConsumed: true, evidence };
}

export interface CreateNutritionSearchRuntimeOptions {
  store: PilotBudgetStore;
  pilotId: string;
  actorId: string;
  turnId: string;
  fetch?: typeof globalThis.fetch;
  endpoint?: string;
  timeoutMs?: number;
  cache?: NutritionSearchCache | null;
  now?: () => number;
}

export type NutritionSearchRuntime =
  | { ok: true; search: (input: unknown, signal: AbortSignal) => Promise<NutritionSearchResult>; transport: NutritionSearchTransport }
  | { ok: false; reason: 'missing_credentials'; search: (input: unknown, signal: AbortSignal) => Promise<NutritionSearchResult> };

/**
 * Server composition root over the real persistent runtime. It reads only the
 * private `PARALLEL_API_KEY` name, never logs it, and returns a typed unavailable
 * callable (zero dispatch) when the credential is absent instead of throwing.
 */
export function createNutritionSearchRuntime(
  env: Record<string, string | undefined>,
  options: CreateNutritionSearchRuntimeOptions,
): NutritionSearchRuntime {
  const apiKey = (env[PARALLEL_API_KEY_ENV] ?? '').trim();
  if (!apiKey) {
    return {
      ok: false,
      reason: 'missing_credentials',
      search: async () => unavailable('missing_credentials', false, false),
    };
  }
  const endpoint = options.endpoint ?? PARALLEL_SEARCH_ENDPOINT;
  const transport = createParallelNutritionSearchTransport({
    apiKey, fetch: options.fetch, endpoint, timeoutMs: options.timeoutMs,
  });
  const deps: Omit<NutritionSearchDeps, 'signal'> = {
    transport,
    store: options.store,
    pilotId: options.pilotId,
    actorId: options.actorId,
    turnId: options.turnId,
    endpoint,
    cache: options.cache ?? null,
    now: options.now,
  };
  return {
    ok: true,
    transport,
    search: (input, signal) => runNutritionSearch(input, { ...deps, signal }),
  };
}
