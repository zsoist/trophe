import { NextRequest, NextResponse } from 'next/server';
import { processMemoryQueue } from '@/agents/memory/queue';
import { cronBearerValid } from '@/lib/auth/cron-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Per-worker secret ONLY (P2 phase 2: the legacy shared CRON_SECRET fallback was removed). The
  // scheduler (run_memory_queue_worker) sends `Authorization: Bearer <MEMORY_CRON_SECRET>`,
  // value read from Vault: memory_cron_secret.
  if (!cronBearerValid(request.headers.get('authorization'), process.env.MEMORY_CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json(await processMemoryQueue());
}
