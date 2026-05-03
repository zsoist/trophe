import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { gte, asc } from 'drizzle-orm';
import { db } from '@/db/client';
import { agentRuns } from '@/db/schema/agent_runs';

const ADMIN_EMAILS = new Set(['daniel@reyes.com']);

function unauthorized(status = 401) {
  return NextResponse.json({ error: 'Unauthorized' }, { status });
}

async function verifyAdmin(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return false;
  const token = auth.slice(7).trim();
  if (!token) return false;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return false;

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  return !error && !!data.user?.email && ADMIN_EMAILS.has(data.user.email);
}

export async function GET(request: NextRequest) {
  if (!(await verifyAdmin(request))) return unauthorized();

  const daysParam = Number(request.nextUrl.searchParams.get('days') ?? '30');
  const days = Number.isFinite(daysParam) ? Math.min(Math.max(Math.floor(daysParam), 1), 90) : 30;
  const since = new Date();
  since.setDate(since.getDate() - days);

  const rows = await db
    .select()
    .from(agentRuns)
    .where(gte(agentRuns.createdAt, since))
    .orderBy(asc(agentRuns.createdAt));

  const totalCost = rows.reduce((sum, row) => sum + (row.costUsd ?? 0), 0);
  const totalCalls = rows.length;
  const avgLatency = totalCalls
    ? rows.reduce((sum, row) => sum + (row.latencyMs ?? 0), 0) / totalCalls
    : 0;

  const byEndpoint: Record<string, { calls: number; cost: number }> = {};
  const byDayMap = new Map<string, { cost: number; calls: number }>();

  for (const row of rows) {
    const key = row.taskName;
    byEndpoint[key] ??= { calls: 0, cost: 0 };
    byEndpoint[key].calls++;
    byEndpoint[key].cost += row.costUsd ?? 0;

    const day = row.createdAt.toISOString().slice(0, 10);
    const daySummary = byDayMap.get(day) ?? { cost: 0, calls: 0 };
    daySummary.cost += row.costUsd ?? 0;
    daySummary.calls++;
    byDayMap.set(day, daySummary);
  }

  return NextResponse.json({
    totalCost,
    totalCalls,
    byEndpoint,
    byDay: Array.from(byDayMap.entries()).map(([date, value]) => ({ date, ...value })),
    avgCostPerCall: totalCalls ? totalCost / totalCalls : 0,
    avgLatency,
  });
}
