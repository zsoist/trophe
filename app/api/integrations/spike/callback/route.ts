/**
 * GET /api/integrations/spike/callback?code=...&state=...
 *
 * OAuth callback handler after Spike redirects the user back.
 *
 * Flow:
 *   1. Parse code + state from query params
 *   2. Verify CSRF state (userId + provider encoded in state)
 *   3. Exchange code for tokens via Spike OAuth
 *   4. Encrypt tokens with pgcrypto + upsert into wearable_connections
 *   5. Redirect to /dashboard/integrations?connected=<provider>
 *
 * ⚠ The redirect URI registered in the Spike dashboard MUST match:
 *   {NEXT_PUBLIC_APP_URL}/api/integrations/spike/callback
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { exchangeSpikeCode } from '@/lib/spike/client';
import { encryptToken } from '@/lib/spike/tokens';
import { db } from '@/db/client';
import { wearableConnections, type InsertWearableConnection } from '@/db/schema/wearable_connections';
import { verifySpikeState } from '@/lib/spike/state';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const errorParam = searchParams.get('error');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  // ── User denied access ────────────────────────────────────────────────
  if (errorParam) {
    return NextResponse.redirect(
      `${appUrl}/dashboard/integrations?error=${encodeURIComponent(errorParam)}`,
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${appUrl}/dashboard/integrations?error=missing_params`,
    );
  }

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
    return NextResponse.redirect(
      `${appUrl}/login?redirectTo=${encodeURIComponent('/dashboard/integrations')}`,
    );
  }

  // ── Verify CSRF state ─────────────────────────────────────────────────
  const verifiedState = await verifySpikeState(state, user.id);
  if (!verifiedState) {
    return NextResponse.redirect(
      `${appUrl}/dashboard/integrations?error=invalid_state`,
    );
  }
  const { provider } = verifiedState;

  // ── Exchange code for tokens ──────────────────────────────────────────
  const redirectUri = `${appUrl}/api/integrations/spike/callback`;
  let tokens;
  try {
    tokens = await exchangeSpikeCode(code, redirectUri);
  } catch (err) {
    console.error('[spike/callback] token exchange failed:', err);
    return NextResponse.redirect(
      `${appUrl}/dashboard/integrations?error=token_exchange_failed`,
    );
  }

  // ── Encrypt tokens ────────────────────────────────────────────────────
  let encAccess: Buffer;
  let encRefresh: Buffer;
  try {
    [encAccess, encRefresh] = await Promise.all([
      encryptToken(tokens.access_token),
      encryptToken(tokens.refresh_token),
    ]);
  } catch (err) {
    console.error('[spike/callback] token encryption failed:', err);
    return NextResponse.redirect(
      `${appUrl}/dashboard/integrations?error=encryption_failed`,
    );
  }

  // ── Upsert wearable_connections ───────────────────────────────────────
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  try {
    await db
      .insert(wearableConnections)
      .values({
        userId: user.id,
        provider: provider as InsertWearableConnection['provider'],
        spikeUserId: tokens.spike_user_id,
        accessTokenEncrypted: encAccess,
        refreshTokenEncrypted: encRefresh,
        scopes: tokens.scope,
        status: 'active',
        tokenExpiresAt: expiresAt,
        connectedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [wearableConnections.userId, wearableConnections.provider],
        set: {
          spikeUserId: tokens.spike_user_id,
          accessTokenEncrypted: encAccess,
          refreshTokenEncrypted: encRefresh,
          scopes: tokens.scope,
          status: 'active',
          tokenExpiresAt: expiresAt,
          lastSyncError: null,
        },
      });
  } catch (err) {
    console.error('[spike/callback] DB upsert failed:', err);
    return NextResponse.redirect(
      `${appUrl}/dashboard/integrations?error=db_error`,
    );
  }

  // ── Success ───────────────────────────────────────────────────────────
  return NextResponse.redirect(
    `${appUrl}/dashboard/integrations?connected=${encodeURIComponent(provider)}`,
  );
}
