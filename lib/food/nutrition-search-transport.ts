import { z } from 'zod';

/** Official Parallel Search API. Verified 2026-09-13 UTC from:
 * - https://docs.parallel.ai/search/search-quickstart
 * - https://docs.parallel.ai/api-reference/search/search
 * - https://docs.parallel.ai/search/advanced-search-settings
 * - https://docs.parallel.ai/search/modes
 * - https://docs.parallel.ai/getting-started/pricing
 *
 * POST https://api.parallel.ai/v1/search with an `x-api-key` header and a JSON
 * body carrying an `objective` string plus a `search_queries` string array. The
 * `mode` must be explicit: omitting it silently selects the advanced mode at 5x
 * the price, so this transport always sends `mode:'fast'`. One query per request,
 * no batch fan-out, no pagination, no retries, and no Extract/Responses/Task
 * surface. Response shape: { search_id, results:[{ url, title, publish_date,
 * excerpts:string[] }], warnings? }. */
export const PARALLEL_SEARCH_ENDPOINT = 'https://api.parallel.ai/v1/search';
export const PARALLEL_SEARCH_MODE = 'fast';

/** Bounds. They cap the real await, the downloaded bytes, the work done on the
 * payload, and everything that reaches the governed model. */
export const NUTRITION_SEARCH_TIMEOUT_MS = 8_000;
/** Fast pricing ($0.001/request) includes 10 results. Request a bounded subset
 * and never ask for more than the included allowance. */
export const NUTRITION_SEARCH_MAX_RESULTS = 5;
export const NUTRITION_SEARCH_MAX_PROVIDER_RESULTS = 10;
export const NUTRITION_SEARCH_MAX_SCANNED_RESULTS = 10;
export const NUTRITION_SEARCH_MAX_RESPONSE_BYTES = 262_144;
export const NUTRITION_SEARCH_MAX_OBJECTIVE_CHARS = 500;
export const NUTRITION_SEARCH_MAX_QUERY_CHARS = 300;
export const NUTRITION_SEARCH_MAX_TITLE_CHARS = 200;
export const NUTRITION_SEARCH_MAX_SNIPPET_CHARS = 600;
export const NUTRITION_SEARCH_MAX_EXCERPT_CHARS = 600;
export const NUTRITION_SEARCH_MAX_EXCERPTS_PER_RESULT = 4;
export const NUTRITION_SEARCH_MAX_URL_CHARS = 300;
export const NUTRITION_SEARCH_MAX_PUBLISH_DATE_CHARS = 40;
export const NUTRITION_SEARCH_MAX_SEARCH_ID_CHARS = 200;

/** Official Parallel `advanced_settings.location` allowlist (2026-09-13 UTC).
 * Colombia ('co') is deliberately absent: an unsupported market must be
 * preserved in the objective/query, never silently defaulted to the US. */
export const PARALLEL_SUPPORTED_LOCATIONS: ReadonlySet<string> = new Set([
  'ar', 'au', 'at', 'be', 'br', 'ca', 'cl', 'cn', 'dk', 'fi', 'fr', 'de', 'gr', 'hk',
  'in', 'id', 'it', 'jp', 'my', 'mx', 'nl', 'nz', 'no', 'ph', 'pl', 'pt', 'ru', 'sa',
  'za', 'kr', 'es', 'se', 'ch', 'tw', 'tr', 'gb', 'us',
]);

export function isSupportedParallelLocation(code: string): boolean {
  return PARALLEL_SUPPORTED_LOCATIONS.has(code.toLowerCase());
}

/** Documented official nutrition sources. Membership only marks provenance for
 * the reader; it never turns an excerpt into a measured macro value. */
const OFFICIAL_NUTRITION_HOSTS = new Set([
  'fdc.nal.usda.gov', // USDA FoodData Central
  'ndb.nal.usda.gov', // USDA legacy nutrient database
  'nutrition.gov', // USDA nutrition portal
  'efsa.europa.eu', // EFSA
  'efet.gr', // Hellenic Food Authority
  'icbf.gov.co', // Colombian ICBF food composition tables
  'minsalud.gov.co', // Colombian Ministry of Health
  'who.int',
]);

export function isOfficialNutritionHost(host: string): boolean {
  return OFFICIAL_NUTRITION_HOSTS.has(host.toLowerCase());
}

/** One bounded, sanitised source reference. All strings are untrusted data. */
export const nutritionSearchSourceSchema = z.object({
  title: z.string().max(NUTRITION_SEARCH_MAX_TITLE_CHARS),
  url: z.string().max(NUTRITION_SEARCH_MAX_URL_CHARS),
  host: z.string().min(1).max(120),
  snippet: z.string().max(NUTRITION_SEARCH_MAX_SNIPPET_CHARS),
  publishDate: z.string().max(NUTRITION_SEARCH_MAX_PUBLISH_DATE_CHARS).nullable(),
  position: z.number().int().min(1).max(100),
  officialSource: z.boolean(),
}).strict();
export type NutritionSearchSource = z.infer<typeof nutritionSearchSourceSchema>;

export const nutritionSearchPageSchema = z.object({
  searchId: z.string().min(1).max(NUTRITION_SEARCH_MAX_SEARCH_ID_CHARS).nullable(),
  results: z.array(nutritionSearchSourceSchema).max(NUTRITION_SEARCH_MAX_RESULTS),
}).strict();
export type NutritionSearchPage = z.infer<typeof nutritionSearchPageSchema>;

export interface ParallelNutritionSearchRequest {
  objective: string;
  query: string;
  /** Allowlisted country code, or null when the market is not supported. */
  location: string | null;
  maxResults: number;
  signal: AbortSignal;
}

export interface NutritionSearchTransport {
  /** Exactly one request. A thrown error means the caller must not retry blindly. */
  search(request: ParallelNutritionSearchRequest): Promise<NutritionSearchPage>;
}

/** Builds the exact `POST /v1/search` body. Exported so the wire contract is
 * testable without a network call: fast mode is always explicit, exactly one
 * query is sent, and an unsupported market omits `location` rather than
 * substituting a default. */
export function buildParallelSearchRequestBody(request: {
  objective: string;
  query: string;
  location: string | null;
  maxResults: number;
}): Record<string, unknown> {
  const advancedSettings: Record<string, unknown> = {
    max_results: Math.min(Math.max(request.maxResults, 1), NUTRITION_SEARCH_MAX_PROVIDER_RESULTS),
    excerpt_settings: { max_chars_per_result: NUTRITION_SEARCH_MAX_EXCERPT_CHARS },
  };
  if (request.location && isSupportedParallelLocation(request.location)) {
    advancedSettings.location = request.location.toLowerCase();
  }
  return {
    objective: request.objective,
    search_queries: [request.query],
    mode: PARALLEL_SEARCH_MODE,
    advanced_settings: advancedSettings,
  };
}

export type NutritionSearchTransportErrorKind =
  | 'cancelled'
  | 'timeout'
  | 'network'
  | 'http_status'
  | 'malformed_body'
  | 'oversize';

/** Redacted transport failure. The message never carries a key, URL query,
 * response body or excerpt; only the bounded classification is exposed. */
export class NutritionSearchTransportError extends Error {
  readonly kind: NutritionSearchTransportErrorKind;
  readonly rawStatus: number | null;

  constructor(kind: NutritionSearchTransportErrorKind, rawStatus: number | null = null) {
    super(`nutrition_search_${kind}`);
    this.name = 'NutritionSearchTransportError';
    this.kind = kind;
    this.rawStatus = rawStatus;
  }
}

const resultSchema = z.object({
  url: z.unknown().optional(),
  title: z.unknown().optional(),
  publish_date: z.unknown().optional(),
  excerpts: z.unknown().optional(),
}).passthrough();
const pageSchema = z.object({
  search_id: z.unknown().optional(),
  results: z.array(resultSchema),
}).passthrough();

/** Strips control characters, collapses whitespace and clamps the length. The
 * text stays inert data: no markup, instruction or number inside it is parsed. */
export function sanitizeUntrustedText(value: unknown, maxChars: number): string {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFC')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars);
}

/** Accepts only a credential-free, fragment-free https link of bounded length so
 * a provider payload cannot inject a javascript:, data: or userinfo URL. */
export function safeSourceUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || raw.length > 2_048) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;
  if (!/^[a-z0-9.-]+$/i.test(url.hostname)) return null;
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|gclid$|fbclid$)/i.test(key)) url.searchParams.delete(key);
  }
  const normalized = url.toString();
  return normalized.length <= NUTRITION_SEARCH_MAX_URL_CHARS ? normalized : null;
}

async function readBoundedText(response: Response, limit: number): Promise<string> {
  const declared = Number(response.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > limit) throw new NutritionSearchTransportError('oversize', response.status);
  const body = response.body;
  if (!body) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > limit) throw new NutritionSearchTransportError('oversize', response.status);
    return text;
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => undefined);
        throw new NutritionSearchTransportError('oversize', response.status);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

/** Keep provider order for equal provenance, but read official nutrition
 * sources first. Ordering is presentation only and never invents a value. */
function preferOfficial(results: NutritionSearchSource[]): NutritionSearchSource[] {
  return results
    .map((source, index) => ({ source, index }))
    .sort((a, b) => Number(b.source.officialSource) - Number(a.source.officialSource) || a.index - b.index)
    .map(entry => entry.source);
}

/** Joins the provider's bounded `excerpts` into one inert snippet. */
function excerptText(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value
    .slice(0, NUTRITION_SEARCH_MAX_EXCERPTS_PER_RESULT)
    .map(entry => sanitizeUntrustedText(entry, NUTRITION_SEARCH_MAX_EXCERPT_CHARS))
    .filter(Boolean)
    .join(' ')
    .slice(0, NUTRITION_SEARCH_MAX_SNIPPET_CHARS);
}

export interface ParallelNutritionSearchTransportOptions {
  /** Private server credential. Never logged, never accepted over the wire. */
  apiKey: string;
  fetch?: typeof globalThis.fetch;
  endpoint?: string;
  timeoutMs?: number;
}

/** Injected HTTP transport for the single verified Parallel /v1/search contract.
 * The timeout aborts the request *and* races the promise, so a misbehaving
 * injected fetch cannot leave the caller awaiting forever on a signal alone. */
export function createParallelNutritionSearchTransport(
  options: ParallelNutritionSearchTransportOptions,
): NutritionSearchTransport {
  const apiKey = options.apiKey.trim();
  if (!apiKey) throw new Error('missing_parallel_api_key');
  const doFetch = options.fetch ?? globalThis.fetch;
  const endpoint = options.endpoint ?? PARALLEL_SEARCH_ENDPOINT;
  const timeoutMs = options.timeoutMs ?? NUTRITION_SEARCH_TIMEOUT_MS;

  return {
    async search(request) {
      if (request.signal.aborted) throw new NutritionSearchTransportError('cancelled');
      const body = buildParallelSearchRequestBody({
        objective: request.objective,
        query: request.query,
        location: request.location,
        maxResults: request.maxResults,
      });

      const controller = new AbortController();
      const onAbort = () => controller.abort(request.signal.reason);
      request.signal.addEventListener('abort', onAbort, { once: true });
      let timedOut = false;
      let abortWithTimeout: () => void = () => undefined;
      const timeoutRace = new Promise<never>((_, reject) => {
        abortWithTimeout = () => reject(new NutritionSearchTransportError('timeout'));
      });
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        abortWithTimeout();
      }, timeoutMs);

      let response: Response;
      let text: string;
      try {
        const sent = doFetch(endpoint, {
          method: 'POST',
          headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        // A late failure/resolution after the race is already handled and inert.
        response = await Promise.race([sent, timeoutRace]);
        if (!response.ok) throw new NutritionSearchTransportError('http_status', response.status);
        text = await Promise.race([readBoundedText(response, NUTRITION_SEARCH_MAX_RESPONSE_BYTES), timeoutRace]);
      } catch (error) {
        if (timedOut) throw new NutritionSearchTransportError('timeout');
        if (request.signal.aborted) throw new NutritionSearchTransportError('cancelled');
        if (error instanceof NutritionSearchTransportError) throw error;
        throw new NutritionSearchTransportError('network');
      } finally {
        clearTimeout(timer);
        request.signal.removeEventListener('abort', onAbort);
      }

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(text);
      } catch {
        throw new NutritionSearchTransportError('malformed_body', response.status);
      }
      const page = pageSchema.safeParse(parsedJson);
      if (!page.success) throw new NutritionSearchTransportError('malformed_body', response.status);

      const results: NutritionSearchSource[] = [];
      for (const item of page.data.results.slice(0, NUTRITION_SEARCH_MAX_SCANNED_RESULTS)) {
        if (results.length >= NUTRITION_SEARCH_MAX_RESULTS) break;
        const url = safeSourceUrl(item.url);
        if (!url) continue;
        let host: string;
        try {
          host = new URL(url).hostname.toLowerCase();
        } catch {
          continue;
        }
        results.push({
          title: sanitizeUntrustedText(item.title, NUTRITION_SEARCH_MAX_TITLE_CHARS),
          url,
          host,
          snippet: excerptText(item.excerpts),
          publishDate: sanitizeUntrustedText(item.publish_date, NUTRITION_SEARCH_MAX_PUBLISH_DATE_CHARS) || null,
          position: results.length + 1,
          officialSource: isOfficialNutritionHost(host),
        });
      }
      const searchId = sanitizeUntrustedText(page.data.search_id, NUTRITION_SEARCH_MAX_SEARCH_ID_CHARS) || null;
      // `warnings` is presentational provider guidance and is deliberately
      // ignored: it is never promoted to evidence or to a nutrient value.
      return { searchId, results: preferOfficial(results) };
    },
  };
}
