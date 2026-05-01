/**
 * POST /api/integrations/spike/webhook
 *
 * Receives data webhooks from Spike after each wearable sync.
 *
 * Security:
 *   Every request MUST have a valid X-Spike-Signature: sha256=<hmac>
 *   computed against the raw body with SPIKE_WEBHOOK_SECRET.
 *   Invalid signatures → 401. Missing secret → 503.
 *
 * Supported event_types:
 *   data.synced       — New wearable data (steps, HRV, sleep, etc.)
 *   connection.created — User connected a provider (log only)
 *   connection.revoked — User revoked access → mark connection revoked
 *   token.refreshed   — Spike auto-refreshed the token → update encrypted tokens
 *
 * Idempotency:
 *   wearable_data has UNIQUE(user_id, provider, data_type, recorded_at).
 *   Re-delivered data.synced events skip duplicate rows via ON CONFLICT DO NOTHING.
 *
 * ⚠ SPIKE_WEBHOOK_SECRET must be set in .env.local
 * ⚠ Register this URL in the Spike dashboard: {NEXT_PUBLIC_APP_URL}/api/integrations/spike/webhook
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  verifySpikeWebhookSignature,
  type SpikeWebhookPayload,
} from '@/lib/spike/client';
import { encryptToken } from '@/lib/spike/tokens';
import { db } from '@/db/client';
import { wearableConnections } from '@/db/schema/wearable_connections';
import { wearableData, type InsertWearableData } from '@/db/schema/wearable_data';
import { eq } from 'drizzle-orm';

// ── Data type normalization ────────────────────────────────────────────────

const SPIKE_TYPE_MAP: Record<string, string> = {
  steps: 'steps',
  daily_steps: 'steps',
  heart_rate: 'heart_rate',
  resting_heart_rate: 'heart_rate',
  sleep: 'sleep',
  sleep_summary: 'sleep',
  workout: 'workout',
  activity: 'workout',
  hrv: 'hrv',
  heart_rate_variability: 'hrv',
  weight: 'weight',
  body_weight: 'weight',
  body_fat: 'body_fat',
  body_fat_percentage: 'body_fat',
  spo2: 'spo2',
  oxygen_saturation: 'spo2',
  stress: 'stress',
  stress_level: 'stress',
  readiness: 'readiness',
  recovery_score: 'readiness',
  strain: 'readiness',
  temperature: 'temperature',
  skin_temperature: 'temperature',
};

const VALID_DATA_TYPES = new Set([
  'steps', 'heart_rate', 'sleep', 'workout', 'hrv',
  'weight', 'body_fat', 'spo2', 'stress', 'readiness', 'temperature',
]);

function normalizeDataType(spikeType: string): string | null {
  const normalized = SPIKE_TYPE_MAP[spikeType.toLowerCase()] ?? spikeType.toLowerCase();
  return VALID_DATA_TYPES.has(normalized) ? normalized : null;
}

// ── Webhook handler ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── 1. Read raw body for HMAC verification ─────────────────────────────
  const rawBody = await req.text();
  const signatureHeader = req.headers.get('x-spike-signature');

  // ── 2. Verify HMAC signature ───────────────────────────────────────────
  const isValid = await verifySpikeWebhookSignature(rawBody, signatureHeader);
  if (!isValid) {
    console.warn('[spike/webhook] invalid signature — rejecting request');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // ── 3. Parse payload ───────────────────────────────────────────────────
  let payload: SpikeWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as SpikeWebhookPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { event_type, spike_user_id, provider } = payload;

  // ── 4. Find the wearable connection by spike_user_id ──────────────────
  const [connection] = await db
    .select({ id: wearableConnections.id, userId: wearableConnections.userId })
    .from(wearableConnections)
    .where(eq(wearableConnections.spikeUserId, spike_user_id))
    .limit(1);

  // Unknown spike_user_id — return 200 to prevent Spike from retrying indefinitely
  if (!connection) {
    console.warn(`[spike/webhook] unknown spike_user_id: ${spike_user_id}`);
    return NextResponse.json({ ok: true, note: 'unknown_user' });
  }

  // ── 5. Dispatch by event type ─────────────────────────────────────────

  if (event_type === 'connection.revoked') {
    await db
      .update(wearableConnections)
      .set({ status: 'revoked', lastSyncAt: new Date() })
      .where(eq(wearableConnections.id, connection.id));

    return NextResponse.json({ ok: true, event: 'revoked' });
  }

  if (event_type === 'token.refreshed' && payload.access_token) {
    try {
      const [encAccess, encRefresh] = await Promise.all([
        encryptToken(payload.access_token),
        payload.refresh_token ? encryptToken(payload.refresh_token) : Promise.resolve(undefined),
      ]);

      const expiresAt = payload.expires_in
        ? new Date(Date.now() + payload.expires_in * 1000)
        : undefined;

      await db
        .update(wearableConnections)
        .set({
          accessTokenEncrypted: encAccess,
          ...(encRefresh ? { refreshTokenEncrypted: encRefresh } : {}),
          ...(expiresAt ? { tokenExpiresAt: expiresAt } : {}),
          status: 'active',
        })
        .where(eq(wearableConnections.id, connection.id));
    } catch (err) {
      console.error('[spike/webhook] token refresh encryption failed:', err);
    }

    return NextResponse.json({ ok: true, event: 'token_refreshed' });
  }

  if (event_type === 'data.synced' && payload.data && payload.data.length > 0) {
    let inserted = 0;
    let skipped = 0;

    for (const point of payload.data) {
      const dataType = normalizeDataType(point.type);
      if (!dataType) {
        skipped++;
        continue;
      }

      const recordedAt = new Date(point.recorded_at);
      if (isNaN(recordedAt.getTime())) {
        skipped++;
        continue;
      }

      try {
        // ON CONFLICT DO NOTHING for idempotent re-delivery
        await db
          .insert(wearableData)
          .values({
            userId: connection.userId,
            provider: provider as InsertWearableData['provider'],
            dataType: dataType as InsertWearableData['dataType'],
            valueNumeric: point.value ?? undefined,
            valueJsonb: point.value_detail ?? undefined,
            recordedAt,
            ingestedAt: new Date(),
            spikeEventId: point.spike_event_id,
          })
          .onConflictDoNothing();

        inserted++;
      } catch {
        skipped++;
      }
    }

    // Update last_sync_at on the connection
    await db
      .update(wearableConnections)
      .set({ lastSyncAt: new Date(), status: 'active', lastSyncError: null })
      .where(eq(wearableConnections.id, connection.id));

    return NextResponse.json({
      ok: true,
      event: 'data_synced',
      inserted,
      skipped,
    });
  }

  // connection.created or unhandled event_type — acknowledge silently
  return NextResponse.json({ ok: true, event: event_type });
}
