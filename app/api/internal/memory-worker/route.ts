import { NextRequest, NextResponse } from 'next/server';
import { processMemoryQueue } from '@/agents/memory/queue';
import { cronBearerValid } from '@/lib/auth/cron-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Per-worker secret (MEMORY_CRON_SECRET) with a backward-compat window on the legacy shared
  // CRON_SECRET (P2: isolate rotation from the recovery worker).
  if (!cronBearerValid(request.headers.get('authorization'), process.env.MEMORY_CRON_SECRET, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json(await processMemoryQueue());
}
