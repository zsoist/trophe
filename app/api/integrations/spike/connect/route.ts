/**
 * POST /api/integrations/spike/connect
 *
 * Initiates the Spike OAuth flow for a wearable provider.
 * Returns a redirect URL — the client should navigate to it.
 *
 * Body: { provider: 'apple_health' | 'whoop' | 'oura' | 'strava' | ... }
 *
 * Flow:
 *   1. Validate user session (auth required)
 *   2. Generate CSRF state token, store in DB/cache
 *   3. Return { authUrl } — client redirects the user
 *
 * ⚠ SPIKE_CLIENT_ID must be set in .env.local
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { buildSpikeAuthUrl } from '@/lib/spike/client';

const VALID_PROVIDERS = [
  'apple_health', 'whoop', 'oura', 'strava', 'garmin', 'fitbit', 'polar', 'coros',
] as const;

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        },
      },
    },
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Validate provider ─────────────────────────────────────────────────
  const body = (await req.json().catch(() => ({}))) as { provider?: string };
  const provider = body.provider;

  if (!provider || !VALID_PROVIDERS.includes(provider as typeof VALID_PROVIDERS[number])) {
    return NextResponse.json(
      { error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(', ')}` },
      { status: 400 },
    );
  }

  // ── Build redirect URI ────────────────────────────────────────────────
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const redirectUri = `${appUrl}/api/integrations/spike/callback`;

  // ── CSRF state token ──────────────────────────────────────────────────
  // State = base64(userId + '|' + provider + '|' + randomHex)
  // Verified in /callback to prevent CSRF
  const randomBytes = crypto.getRandomValues(new Uint8Array(16));
  const randomHex = Array.from(randomBytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  const statePayload = `${user.id}|${provider}|${randomHex}`;
  const state = Buffer.from(statePayload).toString('base64url');

  // ── Build auth URL ────────────────────────────────────────────────────
  let authUrl: string;
  try {
    authUrl = buildSpikeAuthUrl(provider, state, redirectUri);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 503 },
    );
  }

  return NextResponse.json({ authUrl, state });
}
