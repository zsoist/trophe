const REQUIRED_STATUS_KEYS = [
  'API_URL',
  'ANON_KEY',
  'SERVICE_ROLE_KEY',
  'DB_URL',
];

const PAID_CAPABILITY_KEYS = [
  'AI_PAID_TOOL_APPROVAL',
  'ANTHROPIC_API_KEY',
  'DEEPSEEK_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'OPENAI_API_KEY',
  'TROPHE_ALLOW_PAID_AI',
  'VOYAGE_API_KEY',
];

export function parseSupabaseStatusEnv(raw) {
  const parsed = {};
  for (const line of String(raw).split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(?:"([^"]*)"|'([^']*)'|([^\s]*))$/);
    if (!match || !REQUIRED_STATUS_KEYS.includes(match[1])) continue;
    parsed[match[1]] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  for (const key of REQUIRED_STATUS_KEYS) {
    if (!parsed[key]) throw new Error(`local Supabase status is missing ${key}`);
  }
  return parsed;
}

export function assertLoopbackSupabaseUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Supabase E2E target must be an HTTP loopback URL');
  }
  const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);
  if (url.protocol !== 'http:' || !loopbackHosts.has(url.hostname)) {
    throw new Error('Supabase E2E target must be an HTTP loopback URL');
  }
  return url;
}

export function assertLoopbackDatabaseUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Database E2E target must be a PostgreSQL loopback URL');
  }
  const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);
  const postgresProtocols = new Set(['postgres:', 'postgresql:']);
  if (!postgresProtocols.has(url.protocol) || !loopbackHosts.has(url.hostname)) {
    throw new Error('Database E2E target must be a PostgreSQL loopback URL');
  }
  return url;
}

export function buildLocalPlaywrightEnv(baseEnv, status, credentials) {
  assertLoopbackSupabaseUrl(status.API_URL);
  const env = {
    ...baseEnv,
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    DATABASE_URL: status.DB_URL,
    E2E_CLIENT_EMAIL: credentials.client.email,
    E2E_CLIENT_PASSWORD: credentials.client.password,
    E2E_COACH_EMAIL: credentials.coach.email,
    E2E_COACH_PASSWORD: credentials.coach.password,
    E2E_ADMIN_EMAIL: credentials.admin.email,
    E2E_ADMIN_PASSWORD: credentials.admin.password,
  };
  for (const key of PAID_CAPABILITY_KEYS) env[key] = '';
  return env;
}

export function localAppOrigin(port) {
  if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
    throw new Error('Local app port must be an integer from 1024 through 65535');
  }
  return `http://127.0.0.1:${port}`;
}

export function buildLocalDevEnv(baseEnv, status, port) {
  assertLoopbackSupabaseUrl(status.API_URL);
  assertLoopbackDatabaseUrl(status.DB_URL);
  const appOrigin = localAppOrigin(port);
  const env = {
    ...baseEnv,
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    DATABASE_URL: status.DB_URL,
    NEXT_PUBLIC_SITE_URL: appOrigin,
    NEXT_PUBLIC_APP_URL: appOrigin,
    SERWIST_SUPPRESS_TURBOPACK_WARNING: '1',
  };
  for (const key of PAID_CAPABILITY_KEYS) env[key] = '';
  return env;
}

async function defaultCleanupRetryDelay(attempt) {
  await new Promise((resolve) => setTimeout(resolve, attempt * 150));
}

export async function withDisposableUsers({
  admin,
  users,
  execute,
  cleanupAttempts = 3,
  cleanupRetryDelay = defaultCleanupRetryDelay,
}) {
  const createdIds = [];
  let executionError;
  let result;

  try {
    for (const user of users) {
      const created = await admin.createUser(user);
      createdIds.push(created.id);
      await admin.provisionProfile(created.id, user);
    }
    result = await execute();
  } catch (error) {
    executionError = error;
  }

  let cleanupError;
  for (const id of [...createdIds].reverse()) {
    for (let attempt = 1; attempt <= cleanupAttempts; attempt++) {
      try {
        await admin.deleteUser(id);
        break;
      } catch (error) {
        if (attempt === cleanupAttempts) {
          cleanupError ??= error;
          break;
        }
        await cleanupRetryDelay(attempt);
      }
    }
  }

  if (executionError) throw executionError;
  if (cleanupError) throw cleanupError;
  return result;
}
