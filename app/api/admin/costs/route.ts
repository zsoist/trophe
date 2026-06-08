import { NextRequest, NextResponse } from 'next/server';
import { and, gte, asc, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { agentRuns } from '@/db/schema/agent_runs';
import { organizationMembers } from '@/db/schema/organizations';
import { requireAdminRequest } from '@/lib/auth/require-role';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const guard = await requireAdminRequest(request);
  if (guard instanceof NextResponse) return guard;

  const daysParam = Number(request.nextUrl.searchParams.get('days') ?? '30');
  const days = Number.isFinite(daysParam) ? Math.min(Math.max(Math.floor(daysParam), 1), 90) : 30;
  const since = new Date();
  since.setDate(since.getDate() - days);

  const organizationIds = guard.session.role === 'super_admin'
    ? []
    : (await db
      .select({ organizationId: organizationMembers.orgId })
      .from(organizationMembers)
      .where(inArray(organizationMembers.userId, [guard.session.user.id])))
      .map((member) => member.organizationId);

  if (guard.session.role !== 'super_admin' && organizationIds.length === 0) {
    return NextResponse.json({ error: 'No organization membership found' }, { status: 403 });
  }

  const visibility = guard.session.role === 'super_admin'
    ? gte(agentRuns.createdAt, since)
    : and(gte(agentRuns.createdAt, since), inArray(agentRuns.organizationId, organizationIds));

  const rows = await db
    .select()
    .from(agentRuns)
    .where(visibility)
    .orderBy(asc(agentRuns.createdAt));

  const resolvedCost = (row: typeof rows[number]) => row.actualCostUsd ?? row.estimatedCostUsd ?? row.costUsd ?? 0;
  const totalCost = rows.reduce((sum, row) => sum + resolvedCost(row), 0);
  const totalCalls = rows.length;
  const completedCalls = rows.filter((row) => row.status === 'completed');
  const failedCalls = rows.filter((row) => row.status === 'failed').length;
  const pendingCalls = rows.filter((row) => row.status === 'pending').length;
  const fallbackCalls = rows.filter((row) => Boolean(row.fallbackFrom)).length;
  const missingCostAttribution = completedCalls.filter((row) =>
    row.actualCostUsd == null && row.estimatedCostUsd == null && row.costUsd == null,
  ).length;
  const cacheReadTokens = rows.reduce((sum, row) => sum + row.cacheReadTokens, 0);
  const cacheWriteTokens = rows.reduce((sum, row) => sum + row.cacheWriteTokens, 0);
  const tokensIn = rows.reduce((sum, row) => sum + row.tokensIn, 0);
  const monthlyBudgetUsd = Number(process.env.AI_MONTHLY_BUDGET_USD ?? '50');
  const projectedMonthlyCost = totalCost / days * 30;
  const avgLatency = totalCalls
    ? rows.reduce((sum, row) => sum + (row.latencyMs ?? 0), 0) / totalCalls
    : 0;

  const byEndpoint: Record<string, { calls: number; cost: number }> = {};
  const byModel: Record<string, { calls: number; cost: number }> = {};
  const byOrganization: Record<string, { calls: number; cost: number }> = {};
  const byUser: Record<string, { calls: number; cost: number }> = {};
  const byDayMap = new Map<string, { cost: number; calls: number }>();
  const latencies = rows.flatMap((row) => row.latencyMs == null ? [] : [row.latencyMs]).sort((a, b) => a - b);
  const percentile = (p: number) => latencies.length
    ? latencies[Math.min(Math.ceil(latencies.length * p) - 1, latencies.length - 1)]
    : 0;

  for (const row of rows) {
    const key = row.taskName;
    byEndpoint[key] ??= { calls: 0, cost: 0 };
    byEndpoint[key].calls++;
    byEndpoint[key].cost += resolvedCost(row);

    for (const [group, value] of [
      [byModel, row.model],
      [byOrganization, row.organizationId ?? 'unattributed'],
      [byUser, row.userId ?? 'system'],
    ] as const) {
      group[value] ??= { calls: 0, cost: 0 };
      group[value].calls++;
      group[value].cost += resolvedCost(row);
    }

    const day = row.createdAt.toISOString().slice(0, 10);
    const daySummary = byDayMap.get(day) ?? { cost: 0, calls: 0 };
    daySummary.cost += resolvedCost(row);
    daySummary.calls++;
    byDayMap.set(day, daySummary);
  }

  return NextResponse.json({
    totalCost,
    totalCalls,
    byEndpoint,
    byModel,
    byOrganization: guard.session.role === 'super_admin' ? byOrganization : undefined,
    topUsers: Object.entries(byUser)
      .map(([userId, value]) => ({ userId, ...value }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10),
    byDay: Array.from(byDayMap.entries()).map(([date, value]) => ({ date, ...value })),
    avgCostPerCall: totalCalls ? totalCost / totalCalls : 0,
    avgLatency,
    latency: { p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99) },
    reliability: {
      failedCalls,
      pendingCalls,
      fallbackCalls,
      missingCostAttribution,
      failureRate: totalCalls ? failedCalls / totalCalls : 0,
      fallbackRate: totalCalls ? fallbackCalls / totalCalls : 0,
      cacheReadRate: tokensIn ? cacheReadTokens / tokensIn : 0,
      cacheReadTokens,
      cacheWriteTokens,
    },
    budget: {
      monthlyBudgetUsd,
      projectedMonthlyCost,
      overBudget: projectedMonthlyCost > monthlyBudgetUsd,
    },
  });
}
