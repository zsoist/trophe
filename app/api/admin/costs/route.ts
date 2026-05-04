import { NextRequest, NextResponse } from 'next/server';
import { gte, asc } from 'drizzle-orm';
import { db } from '@/db/client';
import { agentRuns } from '@/db/schema/agent_runs';
import { requireAdminRequest } from '@/lib/auth/require-role';

export async function GET(request: NextRequest) {
  const guard = await requireAdminRequest(request);
  if (guard instanceof NextResponse) return guard;

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
  const monthlyBudgetUsd = Number(process.env.AI_MONTHLY_BUDGET_USD ?? '50');
  const projectedMonthlyCost = totalCost / days * 30;
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
    budget: {
      monthlyBudgetUsd,
      projectedMonthlyCost,
      overBudget: projectedMonthlyCost > monthlyBudgetUsd,
    },
  });
}
