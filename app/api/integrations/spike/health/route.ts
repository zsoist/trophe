/**
 * GET /api/integrations/spike/health
 *
 * Health probe for Mission Control integration.
 * Returns Spike configuration status without revealing secrets.
 */

import { NextResponse } from 'next/server';

export async function GET() {
  const configured = Boolean(
    process.env.SPIKE_CLIENT_ID &&
    process.env.SPIKE_CLIENT_SECRET &&
    process.env.SPIKE_WEBHOOK_SECRET &&
    process.env.WEARABLE_ENCRYPT_KEY,
  );

  return NextResponse.json({
    ok: configured,
    service: 'spike_integration',
    configured,
    missing: [
      !process.env.SPIKE_CLIENT_ID && 'SPIKE_CLIENT_ID',
      !process.env.SPIKE_CLIENT_SECRET && 'SPIKE_CLIENT_SECRET',
      !process.env.SPIKE_WEBHOOK_SECRET && 'SPIKE_WEBHOOK_SECRET',
      !process.env.WEARABLE_ENCRYPT_KEY && 'WEARABLE_ENCRYPT_KEY',
    ].filter(Boolean),
  });
}
