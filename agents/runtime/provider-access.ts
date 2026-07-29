export type PaidProvider = 'openai' | 'anthropic' | 'deepseek' | 'voyage' | 'google';
export type PaidProviderAccessMode = 'offline' | 'live';

export const PAID_PROVIDER_OFFLINE_CREDENTIAL = 'trophe-offline-placeholder';
const PAID_PROVIDERS = new Set<PaidProvider>([
  'openai',
  'anthropic',
  'deepseek',
  'voyage',
  'google',
]);

if (typeof window !== 'undefined') {
  throw new Error('Paid provider access policy is server-only');
}

export class PaidProviderAccessBlockedError extends Error {
  readonly code = 'paid_provider_access_blocked';
  readonly provider: PaidProvider | 'unknown';

  constructor(provider: PaidProvider) {
    super('Paid provider access is blocked');
    this.name = 'PaidProviderAccessBlockedError';
    this.provider = PAID_PROVIDERS.has(provider) ? provider : 'unknown';
  }
}

export function assertPaidProviderAccess(input: {
  provider: PaidProvider;
  transportWasInjected: boolean;
}): PaidProviderAccessMode {
  if (input.transportWasInjected) return 'offline';

  const liveAllowed = process.env.VERCEL_ENV === 'production'
    || process.env.TROPHE_ALLOW_PAID_AI === '1';
  if (liveAllowed) return 'live';

  throw new PaidProviderAccessBlockedError(input.provider);
}
