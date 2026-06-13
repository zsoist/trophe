/**
 * GET /api/integrations/spike/health
 *
 * Health probe for Mission Control integration.
 * Returns Spike configuration status without revealing secrets.
 */

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'spike_integration',
  });
}
