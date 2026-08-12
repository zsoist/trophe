import { pathToFileURL } from 'node:url';
import {
  DEEPSEEK_STRESS_INPUT_TOKEN_CEILING,
  DEEPSEEK_STRESS_OUTPUT_TOKEN_CEILING,
  DEEPSEEK_STRESS_PRICING_VERSION,
  deepSeekStressPricing,
} from '../../agents/router/pricing';
import {
  FOOD_PARSE_OPAQUE_MAX_PROVIDER_ATTEMPTS,
} from '../../lib/ai/food-parse-limits';
export {
  FOOD_PARSE_OPAQUE_MAX_PROVIDER_ATTEMPTS,
} from '../../lib/ai/food-parse-limits';

const MAX_APPROVED_CALLS = 1_000;
const MAX_APPROVED_USD_MICRODOLLARS = 3_000_000;
const RUN_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,63})$/;
const MAX_USD_PATTERN = /^(?:0|[1-2])\.\d{6}$|^3\.000000$/;
const ESTIMATE_PATTERN = /^(?:0|[1-9]\d{0,2})\.(\d{1,12})$/;

export const PAID_AI_ENDPOINTS = Object.freeze({
  anthropicMessages: 'https://api.anthropic.com/v1/messages',
  deepSeekChat: 'https://api.deepseek.com/chat/completions',
  deepSeekBetaChat: 'https://api.deepseek.com/beta/chat/completions',
  mistralChat: 'https://api.mistral.ai/v1/chat/completions',
  openAiChat: 'https://api.openai.com/v1/chat/completions',
  openAiTranscriptions: 'https://api.openai.com/v1/audio/transcriptions',
  tropheFoodParse: 'https://trophe.app/api/food/parse',
  voyageEmbeddings: 'https://api.voyageai.com/v1/embeddings',
});
export const PAID_AI_ENDPOINT_GROUPS = Object.freeze({
  consumerRuntime: Object.freeze([
    PAID_AI_ENDPOINTS.anthropicMessages,
    PAID_AI_ENDPOINTS.openAiChat,
    PAID_AI_ENDPOINTS.openAiTranscriptions,
  ]),
  deepSeekText: Object.freeze([PAID_AI_ENDPOINTS.deepSeekChat]),
  deepSeekStructured: Object.freeze([
    PAID_AI_ENDPOINTS.deepSeekChat,
    PAID_AI_ENDPOINTS.deepSeekBetaChat,
  ]),
  factoryRuntime: Object.freeze([PAID_AI_ENDPOINTS.deepSeekChat]),
  phase2: Object.freeze([
    PAID_AI_ENDPOINTS.anthropicMessages,
    PAID_AI_ENDPOINTS.deepSeekChat,
    PAID_AI_ENDPOINTS.deepSeekBetaChat,
    PAID_AI_ENDPOINTS.mistralChat,
    PAID_AI_ENDPOINTS.openAiChat,
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent',
  ]),
});

const PROVIDER_ENDPOINTS = new Set<string>([
  PAID_AI_ENDPOINTS.anthropicMessages,
  PAID_AI_ENDPOINTS.deepSeekChat,
  PAID_AI_ENDPOINTS.deepSeekBetaChat,
  PAID_AI_ENDPOINTS.mistralChat,
  PAID_AI_ENDPOINTS.openAiChat,
  PAID_AI_ENDPOINTS.openAiTranscriptions,
  PAID_AI_ENDPOINTS.voyageEmbeddings,
]);

const OPERATION_POLICIES = {
  'canary-production-ai-route': {
    kind: 'route',
    estimatedUsdPerAttempt: '0.020000',
  },
  'debug-parse-roundtrip': {
    kind: 'route',
    estimatedUsdPerAttempt: '0.020000',
  },
  'eval-all': {
    kind: 'provider',
    estimatedUsdPerAttempt: '0.250000',
  },
  'eval-deepseek-candidate': {
    kind: 'deepseek',
    estimatedUsdPerAttempt: '0.050000',
  },
  'eval-deepseek-stress': {
    kind: 'deepseek',
    estimatedUsdPerAttempt: '0.050000',
  },
  'eval-food-parse-fifty': {
    kind: 'provider',
    estimatedUsdPerAttempt: '0.250000',
  },
  'eval-food-parse-route': {
    kind: 'route',
    estimatedUsdPerAttempt: '0.020000',
  },
  'eval-food-parse-watchlist': {
    kind: 'route',
    estimatedUsdPerAttempt: '0.020000',
  },
  'eval-generate-benchmark': {
    kind: 'provider',
    estimatedUsdPerAttempt: '0.250000',
  },
  'eval-generate-french': {
    kind: 'provider',
    estimatedUsdPerAttempt: '0.250000',
  },
  'eval-generate-replacements': {
    kind: 'provider',
    estimatedUsdPerAttempt: '0.250000',
  },
  'eval-greek-colombian-prod': {
    kind: 'route',
    estimatedUsdPerAttempt: '0.020000',
  },
  'eval-meal-suggest': {
    kind: 'provider',
    estimatedUsdPerAttempt: '0.250000',
  },
  'eval-nutrition-enterprise-prod': {
    kind: 'route',
    estimatedUsdPerAttempt: '0.020000',
  },
  'eval-phase2-round1': {
    kind: 'provider',
    estimatedUsdPerAttempt: '0.250000',
  },
  'eval-validate-dataset': {
    kind: 'route',
    estimatedUsdPerAttempt: '0.020000',
  },
  'ingest-food-embeddings': {
    kind: 'voyage',
    estimatedUsdPerAttempt: '0.010000',
  },
  'ingest-rag-document': {
    kind: 'voyage',
    estimatedUsdPerAttempt: '0.000100',
  },
} as const;

export type PaidAiToolOperation = keyof typeof OPERATION_POLICIES;

type ApprovalRule =
  | 'ack-required'
  | 'attempt-limit'
  | 'call-limit-invalid'
  | 'case-limit-invalid'
  | 'dataset-unbounded'
  | 'endpoint-invalid'
  | 'estimate-invalid'
  | 'live-flag-required'
  | 'operation-not-allowlisted'
  | 'run-id-invalid'
  | 'target-mismatch'
  | 'token-limit-invalid'
  | 'tool-opt-in-required'
  | 'transport-capability-invalid'
  | 'usd-limit'
  | 'usd-limit-invalid';

const APPROVAL_RULES = new Set<ApprovalRule>([
  'ack-required',
  'attempt-limit',
  'call-limit-invalid',
  'case-limit-invalid',
  'dataset-unbounded',
  'endpoint-invalid',
  'estimate-invalid',
  'live-flag-required',
  'operation-not-allowlisted',
  'run-id-invalid',
  'target-mismatch',
  'token-limit-invalid',
  'tool-opt-in-required',
  'transport-capability-invalid',
  'usd-limit',
  'usd-limit-invalid',
]);

function allowlistedOperation(operation: string): PaidAiToolOperation | 'unknown' {
  return Object.hasOwn(OPERATION_POLICIES, operation)
    ? operation as PaidAiToolOperation
    : 'unknown';
}

export class PaidAiToolApprovalError extends Error {
  readonly name = 'PaidAiToolApprovalError';
  readonly code = 'PAID_AI_TOOL_APPROVAL_BLOCKED';
  readonly rule: ApprovalRule;
  readonly operation: PaidAiToolOperation | 'unknown';

  constructor(rule: ApprovalRule, operation: string) {
    super('Paid AI tool approval blocked');
    this.rule = APPROVAL_RULES.has(rule) ? rule : 'operation-not-allowlisted';
    this.operation = allowlistedOperation(operation);
    Object.setPrototypeOf(this, PaidAiToolApprovalError.prototype);
  }

  toJSON(): {
    name: 'PaidAiToolApprovalError';
    code: 'PAID_AI_TOOL_APPROVAL_BLOCKED';
    rule: ApprovalRule;
    operation: PaidAiToolOperation | 'unknown';
  } {
    return {
      name: this.name,
      code: this.code,
      rule: this.rule,
      operation: this.operation,
    };
  }
}

function blocked(rule: ApprovalRule, operation: string): never {
  throw new PaidAiToolApprovalError(rule, operation);
}

function exactSingleFlag(
  argv: readonly string[],
  flag: string,
  operation: string,
  rule: ApprovalRule,
): string {
  const prefix = `${flag}=`;
  const matches = argv.filter((arg) => arg.startsWith(prefix));
  if (matches.length !== 1 || matches[0].length === prefix.length) {
    blocked(rule, operation);
  }
  return matches[0].slice(prefix.length);
}

function parseMaxCalls(value: string, operation: string): number {
  if (!/^[1-9]\d*$/.test(value)) blocked('call-limit-invalid', operation);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > MAX_APPROVED_CALLS) {
    blocked('call-limit-invalid', operation);
  }
  return parsed;
}

function parseMaxUsd(value: string, operation: string): number {
  if (!MAX_USD_PATTERN.test(value)) blocked('usd-limit-invalid', operation);
  const [whole, fraction] = value.split('.');
  const microdollars = Number(whole) * 1_000_000 + Number(fraction);
  if (
    !Number.isSafeInteger(microdollars)
    || microdollars <= 0
    || microdollars > MAX_APPROVED_USD_MICRODOLLARS
  ) {
    blocked('usd-limit-invalid', operation);
  }
  return microdollars;
}

function estimateToMicrodollarsCeil(value: string, operation: string): number {
  const match = ESTIMATE_PATTERN.exec(value);
  if (!match) blocked('estimate-invalid', operation);
  const [whole] = value.split('.');
  const fraction = match[1];
  const micros = Number(fraction.slice(0, 6).padEnd(6, '0'));
  const remainder = fraction.slice(6);
  const rounded = Number(whole) * 1_000_000
    + micros
    + (/[1-9]/.test(remainder) ? 1 : 0);
  if (!Number.isSafeInteger(rounded) || rounded <= 0) {
    blocked('estimate-invalid', operation);
  }
  return rounded;
}

function normalizeEndpoint(value: string, allowRouteLoopback: boolean): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    blocked('endpoint-invalid', 'unknown');
  }
  if (
    (url.protocol !== 'https:'
      && !(allowRouteLoopback
        && url.protocol === 'http:'
        && ['localhost', '127.0.0.1'].includes(url.hostname)))
    || url.username !== ''
    || url.password !== ''
    || url.hash !== ''
    || url.search !== ''
  ) {
    blocked('endpoint-invalid', 'unknown');
  }
  const normalizedPath = url.pathname.length > 1
    ? url.pathname.replace(/\/+$/, '')
    : url.pathname;
  url.pathname = normalizedPath;
  return url.toString().replace(/\/$/, normalizedPath === '/' ? '/' : '');
}

export function normalizePaidAiEndpoint(value: string): string {
  return normalizeEndpoint(value, false);
}

export function resolvePaidAiRouteEndpoint(input: {
  baseUrl: string;
  pathname: string;
  operation: string;
}): string {
  const operation = allowlistedOperation(input.operation);
  if (operation === 'unknown') {
    blocked('operation-not-allowlisted', input.operation);
  }
  if (OPERATION_POLICIES[operation].kind !== 'route') {
    blocked('target-mismatch', operation);
  }
  let resolved: string;
  try {
    resolved = new URL(input.pathname, input.baseUrl).toString();
  } catch {
    blocked('endpoint-invalid', operation);
  }
  const normalized = normalizeEndpoint(resolved, true);
  if (!endpointAllowed(operation, normalized)) {
    blocked('target-mismatch', operation);
  }
  return normalized;
}

function endpointAllowed(operation: PaidAiToolOperation, endpoint: string): boolean {
  const kind = OPERATION_POLICIES[operation].kind;
  if (kind === 'route') {
    if (operation === 'canary-production-ai-route') {
      return endpoint === 'https://trophe.app/api/ai/meal-suggest';
    }
    return endpoint === PAID_AI_ENDPOINTS.tropheFoodParse
      || endpoint === 'http://localhost:3333/api/food/parse'
      || endpoint === 'http://127.0.0.1:3333/api/food/parse';
  }
  if (kind === 'deepseek') {
    return endpoint === PAID_AI_ENDPOINTS.deepSeekChat
      || endpoint === PAID_AI_ENDPOINTS.deepSeekBetaChat;
  }
  if (kind === 'voyage') return endpoint === PAID_AI_ENDPOINTS.voyageEmbeddings;
  return PROVIDER_ENDPOINTS.has(endpoint)
    || /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/[A-Za-z0-9._-]+:generateContent$/.test(endpoint);
}

function normalizedEndpointSet(
  endpoints: readonly string[],
  operation: PaidAiToolOperation,
): readonly string[] {
  if (!Array.isArray(endpoints) || endpoints.length === 0) {
    blocked('target-mismatch', operation);
  }
  const normalized = [...new Set(endpoints.map((endpoint) =>
    normalizeEndpoint(endpoint, OPERATION_POLICIES[operation].kind === 'route')))].sort();
  if (normalized.some((endpoint) => !endpointAllowed(operation, endpoint))) {
    blocked('target-mismatch', operation);
  }
  return Object.freeze(normalized);
}

export function paidAiTargetIdentity(endpoints: readonly string[]): string {
  if (!Array.isArray(endpoints) || endpoints.length === 0) {
    blocked('target-mismatch', 'unknown');
  }
  return [...new Set(endpoints.map(normalizePaidAiEndpoint))].sort().join(',');
}

export function googleGenerateContentEndpoint(model: string): string {
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(model)) {
    blocked('endpoint-invalid', 'unknown');
  }
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

export function deriveDeepSeekStressEstimate(input: {
  model: string;
  maxOutputTokens: number;
}): {
  pricingVersion: typeof DEEPSEEK_STRESS_PRICING_VERSION;
  estimatedUsdPerAttempt: string;
} {
  if (
    !Object.hasOwn(deepSeekStressPricing, input.model)
    || !Number.isSafeInteger(input.maxOutputTokens)
    || input.maxOutputTokens <= 0
    || input.maxOutputTokens > DEEPSEEK_STRESS_OUTPUT_TOKEN_CEILING
  ) {
    blocked('token-limit-invalid', 'eval-deepseek-stress');
  }
  const rates = deepSeekStressPricing[
    input.model as keyof typeof deepSeekStressPricing
  ];
  const microdollars = Math.ceil(
    DEEPSEEK_STRESS_INPUT_TOKEN_CEILING * rates.inputPerMillion
      + input.maxOutputTokens * rates.outputPerMillion,
  );
  if (!Number.isSafeInteger(microdollars) || microdollars <= 0) {
    blocked('estimate-invalid', 'eval-deepseek-stress');
  }
  return Object.freeze({
    pricingVersion: DEEPSEEK_STRESS_PRICING_VERSION,
    estimatedUsdPerAttempt: `${Math.floor(microdollars / 1_000_000)}.${String(
      microdollars % 1_000_000,
    ).padStart(6, '0')}`,
  });
}

export interface PaidAiAttemptSnapshot {
  attempts: number;
  reservedAttempts: number;
  consumedUsdMicrodollars: number;
  remainingCalls: number;
  remainingUsdMicrodollars: number;
}

export type BeforePaidTransportAttempt = (endpoint: string) => unknown;

const MINTED_PAID_TRANSPORT_CAPABILITIES =
  new WeakSet<BeforePaidTransportAttempt>();

function mintPaidTransportCapability<T extends BeforePaidTransportAttempt>(
  capability: T,
): T {
  MINTED_PAID_TRANSPORT_CAPABILITIES.add(capability);
  return capability;
}

/**
 * Production request paths normally omit this callback. Task6-paid tools pass
 * one, and every owned transport validates its module-private provenance before
 * the request so a structurally similar no-op cannot bypass accounting.
 */
export function debitPaidTransportAttempt(
  capability: BeforePaidTransportAttempt | undefined,
  endpoint: string,
): unknown {
  if (capability == null) return undefined;
  if (!MINTED_PAID_TRANSPORT_CAPABILITIES.has(capability)) {
    blocked('transport-capability-invalid', 'unknown');
  }
  return capability(endpoint);
}

export interface PaidAiTransportCapability {
  beforeTransportAttempt: BeforePaidTransportAttempt;
}

export interface PaidAiAttemptCounter extends PaidAiTransportCapability {
  readonly operation: PaidAiToolOperation;
  readonly maxCalls: number;
  readonly maxUsdMicrodollars: number;
  consumeAttempt(endpoint?: string): PaidAiAttemptSnapshot;
  reserveAttemptEnvelope(input: {
    endpoint: string;
    maxProviderAttempts: number;
  }): PaidAiTransportCapability;
  reserveOpaqueEnvelope(input: {
    endpoint: string;
    maxProviderAttempts: number;
  }): PaidAiAttemptSnapshot;
  snapshot(): PaidAiAttemptSnapshot;
}

export function createPaidAiAttemptCounter(input: {
  operation: string;
  maxCalls: number;
  maxUsdMicrodollars: number;
  estimatedUsdPerAttempt: string;
  endpoints?: readonly string[];
}): PaidAiAttemptCounter {
  const operation = allowlistedOperation(input.operation);
  if (operation === 'unknown') blocked('operation-not-allowlisted', input.operation);
  if (
    !Number.isSafeInteger(input.maxCalls)
    || input.maxCalls <= 0
    || input.maxCalls > MAX_APPROVED_CALLS
  ) {
    blocked('call-limit-invalid', operation);
  }
  if (
    !Number.isSafeInteger(input.maxUsdMicrodollars)
    || input.maxUsdMicrodollars <= 0
    || input.maxUsdMicrodollars > MAX_APPROVED_USD_MICRODOLLARS
  ) {
    blocked('usd-limit-invalid', operation);
  }
  const endpoints = normalizedEndpointSet(
    input.endpoints ?? [OPERATION_POLICIES[operation].kind === 'route'
      ? PAID_AI_ENDPOINTS.tropheFoodParse
      : OPERATION_POLICIES[operation].kind === 'voyage'
        ? PAID_AI_ENDPOINTS.voyageEmbeddings
        : PAID_AI_ENDPOINTS.deepSeekChat],
    operation,
  );
  const approvedEndpoints = new Set(endpoints);
  const estimateMicrodollars = estimateToMicrodollarsCeil(
    input.estimatedUsdPerAttempt,
    operation,
  );
  if (estimateMicrodollars > input.maxUsdMicrodollars) {
    blocked('usd-limit', operation);
  }
  let attempts = 0;
  let reservedAttempts = 0;
  let consumedUsdMicrodollars = 0;
  let reservedUsdMicrodollars = 0;

  const validateEndpoint = (endpoint: string): string => {
    const normalized = normalizeEndpoint(
      endpoint,
      OPERATION_POLICIES[operation].kind === 'route',
    );
    if (!approvedEndpoints.has(normalized)) blocked('target-mismatch', operation);
    return normalized;
  };
  const snapshot = (): PaidAiAttemptSnapshot => Object.freeze({
    attempts,
    reservedAttempts,
    consumedUsdMicrodollars: consumedUsdMicrodollars + reservedUsdMicrodollars,
    remainingCalls: input.maxCalls - attempts - reservedAttempts,
    remainingUsdMicrodollars:
      input.maxUsdMicrodollars - consumedUsdMicrodollars - reservedUsdMicrodollars,
  });
  const assertCapacity = (count: number): void => {
    if (
      !Number.isSafeInteger(count)
      || count <= 0
      || attempts + reservedAttempts + count > input.maxCalls
    ) {
      blocked('attempt-limit', operation);
    }
    const cost = estimateMicrodollars * count;
    if (
      !Number.isSafeInteger(cost)
      || consumedUsdMicrodollars + reservedUsdMicrodollars + cost
        > input.maxUsdMicrodollars
    ) {
      blocked('usd-limit', operation);
    }
  };
  const directAttempt = mintPaidTransportCapability((endpoint: string) => {
    validateEndpoint(endpoint);
    assertCapacity(1);
    attempts += 1;
    consumedUsdMicrodollars += estimateMicrodollars;
    return snapshot();
  });
  const reserve = (endpoint: string, count: number): PaidAiTransportCapability => {
    validateEndpoint(endpoint);
    assertCapacity(count);
    reservedAttempts += count;
    reservedUsdMicrodollars += estimateMicrodollars * count;
    let reservationRemaining = count;
    const beforeTransportAttempt = mintPaidTransportCapability(
      (actualEndpoint: string): PaidAiAttemptSnapshot => {
        validateEndpoint(actualEndpoint);
        if (reservationRemaining <= 0) blocked('attempt-limit', operation);
        reservationRemaining -= 1;
        reservedAttempts -= 1;
        reservedUsdMicrodollars -= estimateMicrodollars;
        attempts += 1;
        consumedUsdMicrodollars += estimateMicrodollars;
        return snapshot();
      },
    );
    return Object.freeze({ beforeTransportAttempt });
  };

  const counter: PaidAiAttemptCounter = Object.freeze({
    operation,
    maxCalls: input.maxCalls,
    maxUsdMicrodollars: input.maxUsdMicrodollars,
    beforeTransportAttempt: directAttempt,
    consumeAttempt(endpoint = endpoints[0]): PaidAiAttemptSnapshot {
      return directAttempt(endpoint);
    },
    reserveAttemptEnvelope({
      endpoint,
      maxProviderAttempts,
    }: {
      endpoint: string;
      maxProviderAttempts: number;
    }) {
      return reserve(endpoint, maxProviderAttempts);
    },
    reserveOpaqueEnvelope({
      endpoint,
      maxProviderAttempts,
    }: {
      endpoint: string;
      maxProviderAttempts: number;
    }) {
      reserve(endpoint, maxProviderAttempts);
      return snapshot();
    },
    snapshot,
  });
  return counter;
}

export interface PaidAiToolApproval extends PaidAiAttemptCounter {
  readonly target: string;
  readonly endpoints: readonly string[];
  readonly runId: string;
  boundJobs<T>(
    jobs: readonly T[],
    options?: Readonly<{ maxAttemptsPerJob?: number }>,
  ): readonly T[];
  /** @deprecated Use boundJobs; retained for callers that have not migrated yet. */
  boundCases<T>(
    cases: readonly T[],
    options?: Readonly<{ attemptsPerCase?: number }>,
  ): readonly T[];
  fetchOpaque(
    endpoint: string,
    init: RequestInit,
    options: {
      maxProviderAttempts: number;
      fetchImpl?: typeof fetch;
    },
  ): Promise<Response>;
}

export function requirePaidAiToolApproval(input: {
  operation: string;
  argv: readonly string[];
  env: Readonly<Record<string, string | undefined>>;
  endpoints: readonly string[];
  pricing?: {
    pricingVersion: string;
    estimatedUsdPerAttempt: string;
  };
}): PaidAiToolApproval {
  const operation = allowlistedOperation(input.operation);
  if (operation === 'unknown') {
    blocked('operation-not-allowlisted', input.operation);
  }
  if (input.env.TROPHE_ALLOW_PAID_AI !== '1') {
    blocked('tool-opt-in-required', operation);
  }
  if (input.argv.filter((arg) => arg === '--live').length !== 1) {
    blocked('live-flag-required', operation);
  }
  if (input.argv.some((arg) => arg.startsWith('--live='))) {
    blocked('live-flag-required', operation);
  }

  const endpoints = normalizedEndpointSet(input.endpoints, operation);
  const target = endpoints.join(',');
  if (exactSingleFlag(input.argv, '--target', operation, 'target-mismatch') !== target) {
    blocked('target-mismatch', operation);
  }
  const maxCalls = parseMaxCalls(
    exactSingleFlag(input.argv, '--max-calls', operation, 'call-limit-invalid'),
    operation,
  );
  const maxUsdMicrodollars = parseMaxUsd(
    exactSingleFlag(input.argv, '--max-usd', operation, 'usd-limit-invalid'),
    operation,
  );
  const runId = exactSingleFlag(
    input.argv,
    '--run-id',
    operation,
    'run-id-invalid',
  );
  if (!RUN_ID_PATTERN.test(runId)) blocked('run-id-invalid', operation);
  const acknowledgement = exactSingleFlag(
    input.argv,
    '--ack',
    operation,
    'ack-required',
  );
  if (
    acknowledgement
    !== `I_UNDERSTAND_PAID_AI:${operation}:${runId}:${target}`
  ) {
    blocked('ack-required', operation);
  }

  const caseLimitValues = input.argv
    .filter((arg) => arg.startsWith('--case-limit='))
    .map((arg) => arg.slice('--case-limit='.length));
  let caseLimit = 1;
  if (caseLimitValues.length > 1) blocked('case-limit-invalid', operation);
  if (caseLimitValues.length === 1) {
    if (!/^[1-9]\d*$/.test(caseLimitValues[0])) {
      blocked('case-limit-invalid', operation);
    }
    caseLimit = Number(caseLimitValues[0]);
    if (!Number.isSafeInteger(caseLimit) || caseLimit > MAX_APPROVED_CALLS) {
      blocked('case-limit-invalid', operation);
    }
  }

  let estimatedUsdPerAttempt: string =
    OPERATION_POLICIES[operation].estimatedUsdPerAttempt;
  if (input.pricing != null) {
    if (
      operation !== 'eval-deepseek-stress'
      || input.pricing.pricingVersion !== DEEPSEEK_STRESS_PRICING_VERSION
    ) {
      blocked('estimate-invalid', operation);
    }
    estimatedUsdPerAttempt = input.pricing.estimatedUsdPerAttempt;
  } else if (operation === 'eval-deepseek-stress') {
    blocked('estimate-invalid', operation);
  }
  const counter = createPaidAiAttemptCounter({
    operation,
    maxCalls,
    maxUsdMicrodollars,
    estimatedUsdPerAttempt,
    endpoints,
  });
  const estimateMicrodollars = estimateToMicrodollarsCeil(
    estimatedUsdPerAttempt,
    operation,
  );
  const maxAffordableCalls = Math.floor(maxUsdMicrodollars / estimateMicrodollars);
  const boundJobs = <T>(
    jobs: readonly T[],
    maxAttemptsPerJob: number,
  ): readonly T[] => {
    if (!Array.isArray(jobs)) blocked('dataset-unbounded', operation);
    if (
      !Number.isSafeInteger(maxAttemptsPerJob)
      || maxAttemptsPerJob <= 0
      || maxAttemptsPerJob > maxCalls
    ) {
      blocked('dataset-unbounded', operation);
    }
    const approvedJobs = Math.min(
      Math.floor(maxCalls / maxAttemptsPerJob),
      Math.floor(maxAffordableCalls / maxAttemptsPerJob),
    );
    if (approvedJobs <= 0) blocked('dataset-unbounded', operation);
    return Object.freeze(jobs.slice(0, Math.min(caseLimit, approvedJobs)));
  };

  const approval: PaidAiToolApproval = Object.freeze({
    ...counter,
    target,
    endpoints,
    runId,
    boundJobs<T>(
      jobs: readonly T[],
      options: Readonly<{ maxAttemptsPerJob?: number }> = {},
    ): readonly T[] {
      return boundJobs(jobs, options.maxAttemptsPerJob ?? 1);
    },
    boundCases<T>(
      cases: readonly T[],
      options: Readonly<{ attemptsPerCase?: number }> = {},
    ): readonly T[] {
      return boundJobs(cases, options.attemptsPerCase ?? 1);
    },
    async fetchOpaque(
      endpoint: string,
      init: RequestInit,
      options: {
        maxProviderAttempts: number;
        fetchImpl?: typeof fetch;
      },
    ): Promise<Response> {
      counter.reserveOpaqueEnvelope({
        endpoint,
        maxProviderAttempts: options.maxProviderAttempts,
      });
      return (options.fetchImpl ?? fetch)(normalizeEndpoint(endpoint, true), {
        ...init,
        redirect: 'error',
      });
    },
  });
  return approval;
}

async function runCli(): Promise<void> {
  const args = process.argv.slice(2);
  const operationArg = args.find((arg) => arg.startsWith('--operation='));
  const operation = operationArg?.slice('--operation='.length) ?? 'unknown';
  const targetArg = args.find((arg) => arg.startsWith('--target='));
  const target = targetArg?.slice('--target='.length) ?? '';
  const actualEndpointArg = args.find((arg) =>
    arg.startsWith('--actual-endpoint='));
  const actualEndpoint =
    actualEndpointArg?.slice('--actual-endpoint='.length) ?? '';
  try {
    const approval = requirePaidAiToolApproval({
      operation,
      argv: args,
      env: process.env,
      endpoints: actualEndpoint
        ? [actualEndpoint]
        : target
          ? target.split(',')
          : [],
      ...(operation === 'eval-deepseek-stress'
        ? {
            pricing: deriveDeepSeekStressEstimate({
              model: process.env.DEEPSEEK_STRESS_MODEL ?? '',
              maxOutputTokens: Number(process.env.DEEPSEEK_STRESS_MAX_TOKENS),
            }),
          }
        : {}),
    });
    approval.reserveOpaqueEnvelope({
      endpoint: approval.endpoints[0],
      maxProviderAttempts:
        operation === 'canary-production-ai-route' ? 4 : 1,
    });
  } catch (error) {
    const safeError = error instanceof PaidAiToolApprovalError
      ? error
      : new PaidAiToolApprovalError('operation-not-allowlisted', operation);
    process.stderr.write(`${safeError.operation}:${safeError.rule}\n`);
    process.exitCode = 1;
  }
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void runCli();
}
