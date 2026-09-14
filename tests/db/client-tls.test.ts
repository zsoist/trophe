import { describe, expect, it } from 'vitest';
import { resolveSupabaseSsl } from '../../db/ssl';

const hostedUrl =
  'postgresql://postgres:example@aws-1-us-east-2.pooler.supabase.com:6543/postgres';

describe('production Supabase TLS configuration', () => {
  it('requires the CA certificate for hosted production connections', () => {
    expect(() =>
      resolveSupabaseSsl({
        connectionString: hostedUrl,
        nodeEnv: 'production',
      }),
    ).toThrow('SUPABASE_CA_CERT is required');
  });

  it('returns certificate verification options and decodes env newlines', () => {
    const result = resolveSupabaseSsl({
      connectionString: hostedUrl,
      caCert: '-----BEGIN CERTIFICATE-----\\nabc\\n-----END CERTIFICATE-----',
      nodeEnv: 'production',
    });

    expect(result).toEqual({
      ca: '-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----',
      rejectUnauthorized: true,
    });
  });

  it('rejects sslmode query parameters that could override verification', () => {
    expect(() =>
      resolveSupabaseSsl({
        connectionString: `${hostedUrl}?sslmode=require`,
        caCert: 'ca',
        nodeEnv: 'production',
      }),
    ).toThrow('Remove sslmode');
  });

  it('does not require hosted TLS settings during local development or builds', () => {
    expect(
      resolveSupabaseSsl({
        connectionString: hostedUrl,
        nodeEnv: 'development',
      }),
    ).toBeUndefined();
    expect(
      resolveSupabaseSsl({
        connectionString: hostedUrl,
        nodeEnv: 'production',
        nextPhase: 'phase-production-build',
      }),
    ).toBeUndefined();
  });
});
