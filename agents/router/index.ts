/**
 * Trophē v0.3 — LLM router.
 *
 * Resolves a task name to a RoutingPolicy. The policy file is the single
 * source of truth for model assignments; this module just dispatches.
 *
 * Usage:
 *   const policy = pick('food_parse');
 *   // policy.provider === 'google', policy.model === 'gemini-2.5-flash'
 */

import { taskPolicies } from './policies';
import type { RoutingPolicy, TaskName } from './policies';

export type { RoutingPolicy, TaskName };
export { taskPolicies };

/**
 * Return the routing policy for a given task.
 * Throws if the task is unknown (catches typos at call sites).
 */
export function pick(task: TaskName): RoutingPolicy {
  const policy = taskPolicies[task];
  if (!policy) {
    throw new Error(`[router] Unknown task: "${task}". Add it to agents/router/policies.ts.`);
  }
  return policy;
}

/**
 * Convenience: return the model string for a task.
 * Useful for telemetry labels.
 */
export function modelFor(task: TaskName): string {
  return pick(task).model;
}
