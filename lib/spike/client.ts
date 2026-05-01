/**
 * Trophē v0.3 — Spike API client (Phase 6).
 *
 * Spike (https://spike.sh) is the single integration layer for:
 *   Apple Health, Whoop, Oura, Strava, Garmin, Fitbit, Polar, COROS
 * at $0.10/connected-user/month.
 *
 * API reference: https://spike.sh/docs/api
 *
 * Config (required in .env.local):
 *   SPIKE_CLIENT_ID=      — from Spike developer dashboard
 *   SPIKE_CLIENT_SECRET=  — from Spike developer dashboard
 *   SPIKE_WEBHOOK_SECRET= — for HMAC-SHA256 signature verification
 *
 * ⚠ MANUAL STEP REQUIRED:
 *   Create a Spike sandbox account at https://spike.sh/developers
 *   Add the redirect URI: {NEXT_PUBLIC_APP_URL}/api/integrations/spike/callback
 *   Set SPIKE_CLIENT_ID, SPIKE_CLIENT_SECRET, SPIKE_WEBHOOK_SECRET in .env.local
 */

// ── Spike API constants ────────────────────────────────────────────────────

const SPIKE_API_BASE = 'https://api.spike.sh/v2';
const SPIKE_AUTH_BASE = 'https://auth.spike.sh';

// ── Types ──────────────────────────────────────────────────────────────────

export interface SpikeTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: 'Bearer';
  scope: string;
  spike_user_id: string;
  provider: string;
}

export interface SpikeDataPoint {
  type: string;
  value: number | null;
  value_detail: Record<string, unknown> | null;
  recorded_at: string; // ISO 8601
  source: string;
  spike_event_id: string;
}

export interface SpikeWebhookPayload {
  event_type: 'data.synced' | 'connection.created' | 'connection.revoked' | 'token.refreshed';
  spike_user_id: string;
  provider: string;
  data?: SpikeDataPoint[];
  /** Present for token.refreshed events */
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  timestamp: string;
}

export interface SpikeUserProfile {
  spike_user_id: string;
  provider: string;
  scopes: string[];
  connected_at: string;
  status: 'active' | 'expired' | 'revoked';
}

// ── OAuth helpers ──────────────────────────────────────────────────────────

/**
 * Build the Spike OAuth authorization URL.
 * Redirect the user to this URL to initiate the connection flow.
 *
 * @param provider   - Which wearable to connect (e.g. 'apple_health', 'whoop')
 * @param state      - CSRF state token (store in session before redirecting)
 * @param redirectUri - Must match the URI registered in Spike dashboard
 */
export function buildSpikeAuthUrl(provider: string, state: string, redirectUri: string): string {
  const clientId = process.env.SPIKE_CLIENT_ID;
  if (!clientId) throw new Error('SPIKE_CLIENT_ID not configured');

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    provider,
    state,
    scope: 'activity sleep heart_rate body_composition',
  });

  return `${SPIKE_AUTH_BASE}/oauth/authorize?${params.toString()}`;
}

/**
 * Exchange an OAuth code for tokens.
 * Called from /api/integrations/spike/callback.
 */
export async function exchangeSpikeCode(
  code: string,
  redirectUri: string,
): Promise<SpikeTokenResponse> {
  const clientId = process.env.SPIKE_CLIENT_ID;
  const clientSecret = process.env.SPIKE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Spike credentials not configured');

  const response = await fetch(`${SPIKE_AUTH_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Spike token exchange failed: ${response.status} ${error.slice(0, 200)}`);
  }

  return response.json() as Promise<SpikeTokenResponse>;
}

/**
 * Refresh an expired Spike access token using the refresh token.
 */
export async function refreshSpikeToken(refreshToken: string): Promise<SpikeTokenResponse> {
  const clientId = process.env.SPIKE_CLIENT_ID;
  const clientSecret = process.env.SPIKE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Spike credentials not configured');

  const response = await fetch(`${SPIKE_AUTH_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Spike token refresh failed: ${response.status} ${error.slice(0, 200)}`);
  }

  return response.json() as Promise<SpikeTokenResponse>;
}

// ── Data fetching ──────────────────────────────────────────────────────────

/**
 * Fetch recent data for a user from Spike's API.
 * Used for backfill on initial connection (the webhook handles ongoing ingestion).
 *
 * @param accessToken - Decrypted Spike access token
 * @param dataTypes   - Which data types to fetch
 * @param startDate   - ISO date string (e.g. '2026-04-01')
 * @param endDate     - ISO date string (e.g. '2026-05-01')
 */
export async function fetchSpikeData(
  accessToken: string,
  dataTypes: string[],
  startDate: string,
  endDate: string,
): Promise<SpikeDataPoint[]> {
  const params = new URLSearchParams({
    types: dataTypes.join(','),
    start: startDate,
    end: endDate,
  });

  const response = await fetch(`${SPIKE_API_BASE}/data?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error('SPIKE_TOKEN_EXPIRED');
    const error = await response.text();
    throw new Error(`Spike data fetch failed: ${response.status} ${error.slice(0, 200)}`);
  }

  const data = (await response.json()) as { data: SpikeDataPoint[] };
  return data.data ?? [];
}

/**
 * Get a user's connection profile from Spike.
 * Useful for verifying connection health after OAuth.
 */
export async function getSpikeUserProfile(accessToken: string): Promise<SpikeUserProfile> {
  const response = await fetch(`${SPIKE_API_BASE}/user`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Spike profile fetch failed: ${response.status}`);
  }

  return response.json() as Promise<SpikeUserProfile>;
}

// ── Webhook HMAC verification ──────────────────────────────────────────────

/**
 * Verify the HMAC-SHA256 signature on a Spike webhook request.
 * Spike sends: X-Spike-Signature: sha256=<hex>
 *
 * MUST be called before processing any webhook payload.
 * Returns true if valid, false if signature mismatch or key missing.
 */
export async function verifySpikeWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
): Promise<boolean> {
  const secret = process.env.SPIKE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[spike] SPIKE_WEBHOOK_SECRET not configured — rejecting webhook');
    return false;
  }

  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }

  const receivedHex = signatureHeader.slice('sha256='.length);

  // Use Web Crypto API (available in Next.js edge + Node runtimes)
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(rawBody);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const computedHex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time comparison to prevent timing attacks
  if (computedHex.length !== receivedHex.length) return false;
  let mismatch = 0;
  for (let i = 0; i < computedHex.length; i++) {
    mismatch |= computedHex.charCodeAt(i) ^ receivedHex.charCodeAt(i);
  }
  return mismatch === 0;
}
