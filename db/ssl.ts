/**
 * Resolve the TLS options used by the hosted Supabase Postgres connections.
 *
 * The connection string intentionally stays free of `sslmode`: node-postgres
 * lets that query parameter override an `ssl` object, which could silently
 * discard certificate verification. The CA is supplied separately through a
 * Vercel encrypted environment variable.
 */

export type SupabaseSslOptions = {
  ca: string;
  rejectUnauthorized: true;
};

export type SupabaseSslInput = {
  connectionString?: string;
  caCert?: string;
  nodeEnv?: string;
  nextPhase?: string;
};

function normalizeCertificate(value: string): string {
  return value.trim().replace(/\\n/g, '\n');
}

function hostedSupabaseUrl(value: string): URL | undefined {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname.endsWith('.supabase.co') ||
      hostname.endsWith('.pooler.supabase.com')
    ) {
      return parsed;
    }
  } catch {
    // The Pool constructor will report malformed connection strings. This
    // helper only makes a TLS decision when the host can be parsed safely.
  }
  return undefined;
}

/**
 * Require verified TLS for hosted Supabase connections at runtime.
 *
 * Build-time and local development paths remain unchanged. A production
 * Supabase URL without its CA is rejected closed so a missing deployment
 * variable cannot downgrade the connection to unverified or plaintext TLS.
 */
export function resolveSupabaseSsl({
  connectionString = process.env.DATABASE_URL,
  caCert = process.env.SUPABASE_CA_CERT,
  nodeEnv = process.env.NODE_ENV,
  nextPhase = process.env.NEXT_PHASE,
}: SupabaseSslInput = {}): SupabaseSslOptions | undefined {
  if (nodeEnv !== 'production' || nextPhase === 'phase-production-build') {
    return undefined;
  }

  if (!connectionString) {
    return undefined;
  }

  const parsed = hostedSupabaseUrl(connectionString);
  if (!parsed) {
    return undefined;
  }

  const sslmode = parsed.searchParams.get('sslmode');
  if (sslmode) {
    throw new Error(
      '[db/client] Remove sslmode from the Supabase connection string; set SUPABASE_CA_CERT so node-postgres can verify the server certificate',
    );
  }

  const normalized = caCert ? normalizeCertificate(caCert) : '';
  if (!normalized) {
    throw new Error(
      '[db/client] SUPABASE_CA_CERT is required for production Supabase connections',
    );
  }

  return { ca: normalized, rejectUnauthorized: true };
}
