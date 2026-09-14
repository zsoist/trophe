/**
 * Delegated backend work scheduling, kept explicitly separate from speech interruption.
 *
 * - `interrupt()` (barge-in) only stops local playback; the session and any delegated
 *   action continue. See the controller for that side.
 * - `cancelAction(id)` here aborts our own in-flight backend work. It never runs as a
 *   side effect of transcript grouping or playback changes.
 */
import type { LiveDelegationAdapter, LiveDelegationOutcome, LiveDelegationRequest } from './client-types';

export interface DelegationResult {
  delegationId: string;
  status: 'completed' | 'failed' | 'cancelled';
  summary: string;
  /**
   * True only when the request actually reached the adapter attempt. False for refusals
   * before any attempt (duplicate id, no adapter) so the host can release — never silently
   * consume — the fragments it had reserved for this delegation. A dispatched failure is
   * `true`: it was attempted once and is never retried or replayed.
   */
  dispatched: boolean;
}

export class LiveDelegation {
  private readonly controllers = new Map<string, AbortController>();
  private readonly adapter: LiveDelegationAdapter | null;

  constructor(adapter: LiveDelegationAdapter | null) {
    this.adapter = adapter;
  }

  get active(): string[] {
    return [...this.controllers.keys()];
  }

  get busy(): boolean {
    return this.controllers.size > 0;
  }

  has(delegationId: string): boolean {
    return this.controllers.has(delegationId);
  }

  async run(request: LiveDelegationRequest): Promise<DelegationResult> {
    if (this.controllers.has(request.delegationId)) {
      return { delegationId: request.delegationId, status: 'failed', summary: 'duplicate_delegation', dispatched: false };
    }
    if (!this.adapter) {
      return { delegationId: request.delegationId, status: 'failed', summary: 'delegation_not_connected', dispatched: false };
    }
    const controller = new AbortController();
    this.controllers.set(request.delegationId, controller);
    try {
      const outcome: LiveDelegationOutcome = await this.adapter.delegate(request, controller.signal);
      return {
        delegationId: request.delegationId,
        status: outcome.ok ? 'completed' : 'failed',
        summary: outcome.summary,
        dispatched: true,
      };
    } catch (error) {
      if (controller.signal.aborted) {
        return { delegationId: request.delegationId, status: 'cancelled', summary: 'action_cancelled', dispatched: true };
      }
      return {
        delegationId: request.delegationId,
        status: 'failed',
        summary: error instanceof Error ? error.message : 'delegation_failed',
        dispatched: true,
      };
    } finally {
      this.controllers.delete(request.delegationId);
    }
  }

  /** Application-initiated cancellation of delegated backend work. Distinct from barge-in. */
  cancel(delegationId: string): boolean {
    const controller = this.controllers.get(delegationId);
    if (!controller) return false;
    controller.abort();
    return true;
  }

  /** Teardown path: abort everything without reporting (owner/unmount/dispose). */
  abortAll(): void {
    for (const controller of this.controllers.values()) controller.abort();
    this.controllers.clear();
  }
}
