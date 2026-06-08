import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { agentRuns } from '@/db/schema/agent_runs';
import { organizationAiBudgets } from '@/db/schema/organization_ai_budgets';
import { organizationMembers } from '@/db/schema/organizations';
import type { AiTaskContext } from './types';

export class OrganizationAiBudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrganizationAiBudgetExceededError';
  }
}

export async function resolveOrganizationId(context?: AiTaskContext): Promise<string | undefined> {
  if (context?.organizationId) return context.organizationId;
  if (!context?.userId) return undefined;

  const [membership] = await db
    .select({ organizationId: organizationMembers.orgId })
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, context.userId))
    .limit(1);
  return membership?.organizationId;
}

export async function assertWithinOrganizationBudget(organizationId?: string): Promise<void> {
  if (!organizationId) return;

  const [budget] = await db
    .select()
    .from(organizationAiBudgets)
    .where(eq(organizationAiBudgets.organizationId, organizationId))
    .limit(1);
  if (!budget) return;
  if (budget.killSwitchActive) {
    throw new OrganizationAiBudgetExceededError('Organization AI access is disabled');
  }

  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [spend] = await db
    .select({
      daily: sql<number>`coalesce(sum(case when ${agentRuns.createdAt} >= ${dayStart} then coalesce(${agentRuns.actualCostUsd}, ${agentRuns.estimatedCostUsd}, ${agentRuns.costUsd}, 0) else 0 end), 0)`,
      monthly: sql<number>`coalesce(sum(coalesce(${agentRuns.actualCostUsd}, ${agentRuns.estimatedCostUsd}, ${agentRuns.costUsd}, 0)), 0)`,
    })
    .from(agentRuns)
    .where(and(
      eq(agentRuns.organizationId, organizationId),
      gte(agentRuns.createdAt, monthStart),
    ));

  if (Number(spend?.daily ?? 0) >= Number(budget.dailyLimitUsd)) {
    throw new OrganizationAiBudgetExceededError('Organization daily AI budget exceeded');
  }
  if (Number(spend?.monthly ?? 0) >= Number(budget.monthlyLimitUsd)) {
    throw new OrganizationAiBudgetExceededError('Organization monthly AI budget exceeded');
  }
}
