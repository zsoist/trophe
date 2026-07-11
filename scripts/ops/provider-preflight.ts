import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export interface ProviderPreflightEnv {
  ANTHROPIC_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  GOOGLE_API_KEY?: string;
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
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function errorFields(data: Record<string, unknown>): Pick<ProviderPreflightCheck, 'errorType' | 'errorCode' | 'message'> {
  const error = data.error && typeof data.error === 'object'
    ? data.error as Record<string, unknown>
    : {};
  return {
    errorType: typeof error.type === 'string' ? error.type : undefined,
    errorCode: typeof error.code === 'string' ? error.code : undefined,
    message: typeof error.message === 'string' ? error.message.slice(0, 200) : undefined,
  };
}

async function executeCheck(
  id: string,
  operation: () => Promise<ProviderPreflightCheck>,
): Promise<ProviderPreflightCheck> {
  try {
    return await operation();
  } catch (error) {
    return {
      id,
      ok: false,
      errorType: 'network_error',
      message: error instanceof Error ? error.message.slice(0, 200) : 'Unknown network error',
    };
  }
}

function missingKey(id: string, key: keyof ProviderPreflightEnv): ProviderPreflightCheck {
  return { id, ok: false, errorType: 'missing_credential', message: `${key} is not configured` };
}

export async function runProviderPreflight(input: PreflightInput = {}): Promise<ProviderPreflightResult> {
  const env = input.env ?? process.env;
  const fetchImpl = input.fetchImpl ?? fetch;
  const log = input.log ?? console.log;
  const clientRequestId = randomUUID();

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
  }): Promise<ProviderPreflightCheck> => {
    const key = env[config.key];
    if (!key) return missingKey(config.id, config.key);
    const startedAt = Date.now();
    const response = await fetchImpl(config.url, config.init(key));
    const data = await readJson(response);
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
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      ...(response.ok
        ? (hasEvidence ? {} : { errorType: 'missing_usage_evidence', message: 'Generation ID or token usage missing' })
        : errorFields(data)),
    };
  };

  const checks = await Promise.all([
    executeCheck('google.entitlement', () => generationCheck({
      id: 'google.entitlement',
      key: 'GOOGLE_API_KEY',
      url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(env.GOOGLE_API_KEY ?? '')}`,
      requestHeader: 'x-request-id',
      init: () => ({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Reply OK' }] }],
          generationConfig: { maxOutputTokens: 10 },
        }),
      }),
      parse: (data) => {
        const usage = data.usageMetadata as Record<string, unknown> | undefined;
        return {
          generationId: typeof data.responseId === 'string' ? data.responseId : undefined,
          inputTokens: Number(usage?.promptTokenCount ?? 0),
          outputTokens: Number(usage?.candidatesTokenCount ?? 0),
        };
      },
    })),
    executeCheck('anthropic.entitlement', () => generationCheck({
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
          model: 'claude-haiku-4-5-20251001',
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
    })),
    executeCheck('openai.entitlement', () => generationCheck({
      id: 'openai.entitlement',
      key: 'OPENAI_API_KEY',
      url: 'https://api.openai.com/v1/chat/completions',
      requestHeader: 'x-request-id',
      init: (key) => ({
        method: 'POST',
        headers: {
          authorization: `Bearer ${key}`,
          'content-type': 'application/json',
          'X-Client-Request-Id': clientRequestId,
        },
        body: JSON.stringify({
          model: 'gpt-5.6-luna',
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
    })),
    executeCheck('deepseek.entitlement', () => generationCheck({
      id: 'deepseek.entitlement',
      key: 'DEEPSEEK_API_KEY',
      url: 'https://api.deepseek.com/chat/completions',
      requestHeader: 'x-request-id',
      init: (key) => ({
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'deepseek-v4-flash',
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
    })),
    executeCheck('voyage.entitlement', async () => {
      const key = env.VOYAGE_API_KEY;
      if (!key) return missingKey('voyage.entitlement', 'VOYAGE_API_KEY');
      const startedAt = Date.now();
      const response = await fetchImpl('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          input: 'provider preflight',
          model: 'voyage-4',
          input_type: 'query',
          output_dimension: 256,
        }),
      });
      const data = await readJson(response);
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
          ? (hasEvidence ? {} : { errorType: 'missing_usage_evidence', message: 'Embedding or token usage missing' })
          : errorFields(data)),
      };
    }),
    executeCheck('openai.batch', async () => {
      const key = env.OPENAI_API_KEY;
      if (!key) return missingKey('openai.batch', 'OPENAI_API_KEY');
      const response = await fetchImpl('https://api.openai.com/v1/batches?limit=1', {
        method: 'GET',
        headers: { authorization: `Bearer ${key}`, 'X-Client-Request-Id': clientRequestId },
      });
      const data = await readJson(response);
      return {
        id: 'openai.batch',
        ok: response.ok,
        status: response.status,
        providerRequestId: response.headers.get('x-request-id') ?? undefined,
        ...(response.ok ? {} : errorFields(data)),
      };
    }),
    executeCheck('anthropic.batch', async () => {
      const key = env.ANTHROPIC_API_KEY;
      if (!key) return missingKey('anthropic.batch', 'ANTHROPIC_API_KEY');
      const response = await fetchImpl('https://api.anthropic.com/v1/messages/batches?limit=1', {
        method: 'GET',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      });
      const data = await readJson(response);
      return {
        id: 'anthropic.batch',
        ok: response.ok,
        status: response.status,
        providerRequestId: response.headers.get('request-id') ?? undefined,
        ...(response.ok ? {} : errorFields(data)),
      };
    }),
    executeCheck('voyage.batch', async () => {
      const key = env.VOYAGE_API_KEY;
      if (!key) return missingKey('voyage.batch', 'VOYAGE_API_KEY');
      const response = await fetchImpl('https://api.voyageai.com/v1/batches?limit=1', {
        method: 'GET',
        headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
      });
      const data = await readJson(response);
      return {
        id: 'voyage.batch',
        ok: response.ok,
        status: response.status,
        providerRequestId: response.headers.get('request-id')
          ?? response.headers.get('x-request-id')
          ?? undefined,
        ...(response.ok ? {} : errorFields(data)),
      };
    }),
    executeCheck('deepseek.models', async () => {
      const key = env.DEEPSEEK_API_KEY;
      if (!key) return missingKey('deepseek.models', 'DEEPSEEK_API_KEY');
      const response = await fetchImpl('https://api.deepseek.com/models', {
        method: 'GET', headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
      });
      const data = await readJson(response);
      const ids = new Set(Array.isArray(data.data)
        ? data.data.map((item) => item && typeof item === 'object' ? (item as Record<string, unknown>).id : undefined)
        : []);
      const requiredModelsPresent = ids.has('deepseek-v4-flash') && ids.has('deepseek-v4-pro');
      return {
        id: 'deepseek.models',
        ok: response.ok && requiredModelsPresent,
        status: response.status,
        ...(response.ok && requiredModelsPresent
          ? {}
          : { ...errorFields(data), message: 'Required DeepSeek model aliases are unavailable' }),
      };
    }),
    executeCheck('deepseek.balance', async () => {
      const key = env.DEEPSEEK_API_KEY;
      if (!key) return missingKey('deepseek.balance', 'DEEPSEEK_API_KEY');
      const response = await fetchImpl('https://api.deepseek.com/user/balance', {
        method: 'GET', headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
      });
      const data = await readJson(response);
      const available = data.is_available === true;
      return {
        id: 'deepseek.balance',
        ok: response.ok && available,
        status: response.status,
        balanceState: available ? 'available' : 'unavailable',
        ...(response.ok && available ? {} : errorFields(data)),
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
      check.providerRequestId ? `request=${check.providerRequestId}` : undefined,
      check.inputTokens !== undefined ? `input=${check.inputTokens}` : undefined,
      check.outputTokens !== undefined ? `output=${check.outputTokens}` : undefined,
      check.balanceState ? `balance=${check.balanceState}` : undefined,
      check.errorType ? `type=${check.errorType}` : undefined,
      check.errorCode ? `code=${check.errorCode}` : undefined,
    ].filter(Boolean).join(' ');
    log(`${check.ok ? 'PASS' : 'FAIL'} ${check.id}${evidence ? ` ${evidence}` : ''}`);
  }

  return { ok: checks.every((check) => check.ok), checks };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runProviderPreflight();
  if (!result.ok) process.exitCode = 1;
}
