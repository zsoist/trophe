import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { taskFallbacks, taskPolicies, type Provider } from '@/agents/router/policies';

export interface ProviderPreflightEnv {
  ANTHROPIC_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  OPENAI_API_KEY?: string;
  VOYAGE_API_KEY?: string;
}

export interface ProviderPreflightCheck {
  id: string;
  ok: boolean;
  status?: number;
  latencyMs?: number;
  providerGenerationId?: string;
  providerRequestId?: string;
  clientRequestId?: string;
  inputTokens?: number;
  outputTokens?: number;
  errorType?: string;
  errorCode?: string;
  balanceState?: 'available' | 'unavailable' | 'not_api_verifiable';
  message?: string;
}

export interface ProviderPreflightResult {
  ok: boolean;
  checks: ProviderPreflightCheck[];
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

interface PreflightInput {
  env?: ProviderPreflightEnv;
  fetchImpl?: FetchLike;
  log?: (line: string) => void;
  timeoutMs?: number;
}

interface JsonResult {
  data: Record<string, unknown>;
  validJson: boolean;
}

class PreflightResponseReadError extends Error {
  constructor(
    readonly status: number,
    readonly providerRequestId?: string,
  ) {
    super('Provider response body could not be read');
  }
}

const PREFLIGHT_PROVIDERS = ['openai', 'anthropic', 'deepseek', 'voyage'] as const;
type PreflightProvider = typeof PREFLIGHT_PROVIDERS[number];

export function requiredPolicyModels(): Record<Provider, string[]> {
  const models: Record<Provider, Set<string>> = {
    anthropic: new Set(),
    deepseek: new Set(),
    google: new Set(),
    openai: new Set(),
    voyage: new Set(),
  };
  for (const policy of [
    ...Object.values(taskPolicies),
    ...Object.values(taskFallbacks).filter((value) => value !== undefined),
  ]) {
    models[policy.provider].add(policy.model);
  }
  return Object.fromEntries(
    Object.entries(models).map(([provider, values]) => [provider, [...values].sort()]),
  ) as Record<Provider, string[]>;
}

async function readJson(response: Response): Promise<JsonResult> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    throw new PreflightResponseReadError(
      response.status,
      response.headers.get('request-id') ?? response.headers.get('x-request-id') ?? undefined,
    );
  }
  if (!text) return { data: {}, validJson: false };
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { data: {}, validJson: false };
    }
    return { data: parsed as Record<string, unknown>, validJson: true };
  } catch {
    return { data: {}, validJson: false };
  }
}

function errorFields(
  data: Record<string, unknown>,
  validJson = true,
): Pick<ProviderPreflightCheck, 'errorType' | 'errorCode' | 'message'> {
  if (!validJson) {
    return {
      errorType: 'provider_protocol_error',
      errorCode: 'invalid_json_response',
      message: 'Provider returned a non-JSON response',
    };
  }
  const error = data.error && typeof data.error === 'object'
    ? data.error as Record<string, unknown>
    : {};
  const topLevelMessage = typeof data.detail === 'string'
    ? data.detail
    : (typeof data.message === 'string' ? data.message : undefined);
  return {
    errorType: typeof error.type === 'string' ? error.type : undefined,
    errorCode: typeof error.code === 'string' ? error.code : undefined,
    message: typeof error.message === 'string'
      ? error.message.slice(0, 200)
      : topLevelMessage?.slice(0, 200),
  };
}

async function executeCheck(
  id: string,
  operation: (signal: AbortSignal) => Promise<ProviderPreflightCheck>,
  context: Pick<ProviderPreflightCheck, 'clientRequestId'> = {},
  timeoutMs = 25_000,
): Promise<ProviderPreflightCheck> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<ProviderPreflightCheck>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error(`Provider preflight check timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    if (error instanceof PreflightResponseReadError) {
      return {
        id,
        ok: false,
        status: error.status,
        providerRequestId: error.providerRequestId,
        errorType: 'provider_protocol_error',
        errorCode: 'response_read_failed',
        message: error.message,
        ...context,
      };
    }
    return {
      id,
      ok: false,
      errorType: 'network_error',
      message: error instanceof Error ? error.message.slice(0, 200) : 'Unknown network error',
      ...context,
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function missingKey(id: string, key: keyof ProviderPreflightEnv): ProviderPreflightCheck {
  return { id, ok: false, errorType: 'missing_credential', message: `${key} is not configured` };
}

export async function runProviderPreflight(input: PreflightInput = {}): Promise<ProviderPreflightResult> {
  const env = input.env ?? process.env;
  const fetchImpl = input.fetchImpl ?? fetch;
  const log = input.log ?? console.log;
  const timeoutMs = input.timeoutMs ?? 25_000;
  const openAiEntitlementClientRequestId = randomUUID();
  const openAiBatchClientRequestId = randomUUID();
  const policyModels = requiredPolicyModels();
  const coverageProblems = [
    ...PREFLIGHT_PROVIDERS.flatMap((provider) => policyModels[provider].length === 1
      ? []
      : [`${provider} has ${policyModels[provider].length} active models; preflight supports exactly one`]),
    ...policyModels.google.map((model) => `unsupported active provider model google/${model}`),
  ];
  const modelFor = (provider: PreflightProvider): string => policyModels[provider][0] ?? '__missing_policy_model__';
  const runCheck = (
    id: string,
    operation: (signal: AbortSignal) => Promise<ProviderPreflightCheck>,
    context: Pick<ProviderPreflightCheck, 'clientRequestId'> = {},
  ) => executeCheck(id, operation, context, timeoutMs);

  const generationCheck = async (config: {
    id: string;
    key: keyof ProviderPreflightEnv;
    url: string;
    init: (key: string) => RequestInit;
    parse: (data: Record<string, unknown>) => {
      generationId?: string;
      inputTokens: number;
      outputTokens: number;
    };
    requestHeader: 'request-id' | 'x-request-id';
    clientRequestId?: string;
  }, signal: AbortSignal): Promise<ProviderPreflightCheck> => {
    const key = env[config.key];
    if (!key) return missingKey(config.id, config.key);
    const startedAt = Date.now();
    const response = await fetchImpl(config.url, { ...config.init(key), signal });
    const { data, validJson } = await readJson(response);
    const usage = config.parse(data);
    const providerRequestId = response.headers.get(config.requestHeader)
      ?? response.headers.get(config.requestHeader === 'request-id' ? 'x-request-id' : 'request-id')
      ?? (typeof data.request_id === 'string' ? data.request_id : undefined);
    const hasEvidence = Boolean(usage.generationId)
      && usage.inputTokens > 0
      && usage.outputTokens > 0;
    return {
      id: config.id,
      ok: response.ok && hasEvidence,
      status: response.status,
      latencyMs: Date.now() - startedAt,
      providerGenerationId: usage.generationId,
      providerRequestId,
      clientRequestId: config.clientRequestId,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      ...(response.ok
        ? (validJson && hasEvidence
          ? {}
          : (validJson
            ? { errorType: 'missing_usage_evidence', message: 'Generation ID or token usage missing' }
            : errorFields(data, false)))
        : errorFields(data, validJson)),
    };
  };

  const checks = await Promise.all([
    Promise.resolve<ProviderPreflightCheck>({
      id: 'policy.coverage',
      ok: coverageProblems.length === 0,
      ...(coverageProblems.length === 0
        ? { message: 'Every active primary/fallback model has an entitlement probe' }
        : { errorType: 'policy_coverage_error', message: coverageProblems.join('; ').slice(0, 200) }),
    }),
    runCheck('anthropic.entitlement', (signal) => generationCheck({
      id: 'anthropic.entitlement',
      key: 'ANTHROPIC_API_KEY',
      url: 'https://api.anthropic.com/v1/messages',
      requestHeader: 'request-id',
      init: (key) => ({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: modelFor('anthropic'),
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Reply OK' }],
        }),
      }),
      parse: (data) => {
        const usage = data.usage as Record<string, unknown> | undefined;
        return {
          generationId: typeof data.id === 'string' ? data.id : undefined,
          inputTokens: Number(usage?.input_tokens ?? 0),
          outputTokens: Number(usage?.output_tokens ?? 0),
        };
      },
    }, signal)),
    runCheck('openai.entitlement', (signal) => generationCheck({
      id: 'openai.entitlement',
      key: 'OPENAI_API_KEY',
      url: 'https://api.openai.com/v1/chat/completions',
      requestHeader: 'x-request-id',
      init: (key) => ({
        method: 'POST',
        headers: {
          authorization: `Bearer ${key}`,
          'content-type': 'application/json',
          'X-Client-Request-Id': openAiEntitlementClientRequestId,
        },
        body: JSON.stringify({
          model: modelFor('openai'),
          max_completion_tokens: 64,
          reasoning_effort: 'none',
          messages: [{ role: 'user', content: 'Reply OK' }],
        }),
      }),
      parse: (data) => {
        const usage = data.usage as Record<string, unknown> | undefined;
        return {
          generationId: typeof data.id === 'string' ? data.id : undefined,
          inputTokens: Number(usage?.prompt_tokens ?? 0),
          outputTokens: Number(usage?.completion_tokens ?? 0),
        };
      },
      clientRequestId: openAiEntitlementClientRequestId,
    }, signal), { clientRequestId: openAiEntitlementClientRequestId }),
    runCheck('deepseek.entitlement', (signal) => generationCheck({
      id: 'deepseek.entitlement',
      key: 'DEEPSEEK_API_KEY',
      url: 'https://api.deepseek.com/chat/completions',
      requestHeader: 'x-request-id',
      init: (key) => ({
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: modelFor('deepseek'),
          max_tokens: 10,
          thinking: { type: 'disabled' },
          messages: [{ role: 'user', content: 'Reply OK' }],
        }),
      }),
      parse: (data) => {
        const usage = data.usage as Record<string, unknown> | undefined;
        return {
          generationId: typeof data.id === 'string' ? data.id : undefined,
          inputTokens: Number(usage?.prompt_tokens ?? 0),
          outputTokens: Number(usage?.completion_tokens ?? 0),
        };
      },
    }, signal)),
    runCheck('voyage.entitlement', async (signal) => {
      const key = env.VOYAGE_API_KEY;
      if (!key) return missingKey('voyage.entitlement', 'VOYAGE_API_KEY');
      const startedAt = Date.now();
      const response = await fetchImpl('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          input: 'provider preflight',
          model: modelFor('voyage'),
          input_type: 'query',
          output_dimension: 256,
        }),
        signal,
      });
      const { data, validJson } = await readJson(response);
      const usage = data.usage as Record<string, unknown> | undefined;
      const firstEmbedding = Array.isArray(data.data) && data.data[0] && typeof data.data[0] === 'object'
        ? (data.data[0] as Record<string, unknown>).embedding
        : undefined;
      const inputTokens = Number(usage?.total_tokens ?? 0);
      const hasEvidence = Array.isArray(firstEmbedding) && firstEmbedding.length > 0 && inputTokens > 0;
      return {
        id: 'voyage.entitlement',
        ok: response.ok && hasEvidence,
        status: response.status,
        latencyMs: Date.now() - startedAt,
        providerRequestId: response.headers.get('request-id')
          ?? response.headers.get('x-request-id')
          ?? undefined,
        inputTokens,
        outputTokens: 0,
        ...(response.ok
          ? (validJson && hasEvidence
            ? {}
            : (validJson
              ? { errorType: 'missing_usage_evidence', message: 'Embedding or token usage missing' }
              : errorFields(data, false)))
          : errorFields(data, validJson)),
      };
    }),
    runCheck('openai.batch', async (signal) => {
      const key = env.OPENAI_API_KEY;
      if (!key) return missingKey('openai.batch', 'OPENAI_API_KEY');
      const response = await fetchImpl('https://api.openai.com/v1/batches?limit=1', {
        method: 'GET',
        headers: { authorization: `Bearer ${key}`, 'X-Client-Request-Id': openAiBatchClientRequestId },
        signal,
      });
      const { data, validJson } = await readJson(response);
      const hasCapabilityEvidence = validJson && data.object === 'list' && Array.isArray(data.data);
      return {
        id: 'openai.batch',
        ok: response.ok && hasCapabilityEvidence,
        status: response.status,
        providerRequestId: response.headers.get('x-request-id') ?? undefined,
        clientRequestId: openAiBatchClientRequestId,
        ...(response.ok && hasCapabilityEvidence
          ? {}
          : (response.ok && validJson
            ? { errorType: 'missing_capability_evidence', message: 'OpenAI batch list shape missing' }
            : errorFields(data, validJson))),
      };
    }, { clientRequestId: openAiBatchClientRequestId }),
    runCheck('anthropic.batch', async (signal) => {
      const key = env.ANTHROPIC_API_KEY;
      if (!key) return missingKey('anthropic.batch', 'ANTHROPIC_API_KEY');
      const response = await fetchImpl('https://api.anthropic.com/v1/messages/batches?limit=1', {
        method: 'GET',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        signal,
      });
      const { data, validJson } = await readJson(response);
      const hasCapabilityEvidence = validJson && Array.isArray(data.data);
      return {
        id: 'anthropic.batch',
        ok: response.ok && hasCapabilityEvidence,
        status: response.status,
        providerRequestId: response.headers.get('request-id') ?? undefined,
        ...(response.ok && hasCapabilityEvidence
          ? {}
          : (response.ok && validJson
            ? { errorType: 'missing_capability_evidence', message: 'Anthropic batch list shape missing' }
            : errorFields(data, validJson))),
      };
    }),
    runCheck('voyage.batch', async (signal) => {
      const key = env.VOYAGE_API_KEY;
      if (!key) return missingKey('voyage.batch', 'VOYAGE_API_KEY');
      const response = await fetchImpl('https://api.voyageai.com/v1/batches?limit=1', {
        method: 'GET',
        headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
        signal,
      });
      const { data, validJson } = await readJson(response);
      const hasCapabilityEvidence = validJson && data.object === 'list' && Array.isArray(data.data);
      return {
        id: 'voyage.batch',
        ok: response.ok && hasCapabilityEvidence,
        status: response.status,
        providerRequestId: response.headers.get('request-id')
          ?? response.headers.get('x-request-id')
          ?? undefined,
        ...(response.ok && hasCapabilityEvidence
          ? {}
          : (response.ok && validJson
            ? { errorType: 'missing_capability_evidence', message: 'Voyage batch list shape missing' }
            : errorFields(data, validJson))),
      };
    }),
    runCheck('deepseek.models', async (signal) => {
      const key = env.DEEPSEEK_API_KEY;
      if (!key) return missingKey('deepseek.models', 'DEEPSEEK_API_KEY');
      const response = await fetchImpl('https://api.deepseek.com/models', {
        method: 'GET', headers: { authorization: `Bearer ${key}`, accept: 'application/json' }, signal,
      });
      const { data, validJson } = await readJson(response);
      const ids = new Set(Array.isArray(data.data)
        ? data.data.map((item) => item && typeof item === 'object' ? (item as Record<string, unknown>).id : undefined)
        : []);
      const requiredDeepSeekModels = new Set([...policyModels.deepseek, 'deepseek-v4-pro']);
      const requiredModelsPresent = [...requiredDeepSeekModels].every((model) => ids.has(model));
      return {
        id: 'deepseek.models',
        ok: response.ok && requiredModelsPresent,
        status: response.status,
        ...(response.ok && requiredModelsPresent
          ? {}
          : { ...errorFields(data, validJson), message: 'Required DeepSeek model aliases are unavailable' }),
      };
    }),
    runCheck('deepseek.balance', async (signal) => {
      const key = env.DEEPSEEK_API_KEY;
      if (!key) return missingKey('deepseek.balance', 'DEEPSEEK_API_KEY');
      const response = await fetchImpl('https://api.deepseek.com/user/balance', {
        method: 'GET', headers: { authorization: `Bearer ${key}`, accept: 'application/json' }, signal,
      });
      const { data, validJson } = await readJson(response);
      const available = data.is_available === true;
      return {
        id: 'deepseek.balance',
        ok: response.ok && available,
        status: response.status,
        balanceState: available ? 'available' : 'unavailable',
        ...(response.ok && available ? {} : errorFields(data, validJson)),
      };
    }),
  ]);

  checks.push(
    {
      id: 'openai.balance',
      ok: true,
      balanceState: 'not_api_verifiable',
      message: 'No supported balance endpoint; bounded generation proves current spend entitlement',
    },
    {
      id: 'anthropic.balance',
      ok: true,
      balanceState: 'not_api_verifiable',
      message: 'No supported balance endpoint; bounded generation proves current spend entitlement',
    },
    {
      id: 'voyage.balance',
      ok: true,
      balanceState: 'not_api_verifiable',
      message: 'No supported balance endpoint; bounded embedding proves current spend entitlement',
    },
  );

  for (const check of checks) {
    const evidence = [
      check.status ? `HTTP ${check.status}` : undefined,
      check.providerGenerationId ? `generation=${check.providerGenerationId}` : undefined,
      check.providerRequestId ? `request=${check.providerRequestId}` : undefined,
      check.clientRequestId ? `client=${check.clientRequestId}` : undefined,
      check.latencyMs !== undefined ? `latency=${check.latencyMs}ms` : undefined,
      check.inputTokens !== undefined ? `input=${check.inputTokens}` : undefined,
      check.outputTokens !== undefined ? `output=${check.outputTokens}` : undefined,
      check.balanceState ? `balance=${check.balanceState}` : undefined,
      check.errorType ? `type=${check.errorType}` : undefined,
      check.errorCode ? `code=${check.errorCode}` : undefined,
      check.message ? `message=${check.message.replace(/\s+/g, ' ').slice(0, 120)}` : undefined,
    ].filter(Boolean).join(' ');
    log(`${check.ok ? 'PASS' : 'FAIL'} ${check.id}${evidence ? ` ${evidence}` : ''}`);
  }

  return { ok: checks.every((check) => check.ok), checks };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runProviderPreflight();
  if (!result.ok) process.exitCode = 1;
}
