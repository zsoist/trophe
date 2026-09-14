/**
 * Voice usage observed on the client.
 *
 * `session.usage.updated` values are cumulative snapshots, NOT increments — they are
 * never summed. Only `session.closed` confirms final usage. Whatever the client sees,
 * `authoritative` stays false: the trusted backend reconciles before anything is booked.
 */
import type { LiveCloseReason, LiveUsageReconciler, LiveUsageSnapshot } from './client-types';

type ReconcileInput = Parameters<LiveUsageReconciler['reconcile']>[0];

export class LiveUsage {
  private observedSeconds: number | null = null;
  private finalSeconds: number | null = null;
  private confirmed = false;
  private reason: LiveCloseReason | null = null;
  private reconciledSeconds: number | null = null;
  private reconcileAccepted = false;

  /** Record the latest cumulative snapshot (last wins; never accumulate). */
  observe(seconds: number): void {
    if (Number.isFinite(seconds) && seconds >= 0) this.observedSeconds = seconds;
  }

  /** `session.closed` is the only event that confirms finalization. */
  close(reason: LiveCloseReason, seconds: number | null): void {
    this.reason = reason;
    if (seconds !== null && Number.isFinite(seconds) && seconds >= 0) {
      this.finalSeconds = seconds;
      this.confirmed = true;
    }
  }

  /** True when finalization never produced a `session.closed` usage figure. */
  get needsReconcile(): boolean {
    return !this.confirmed;
  }

  reconcileInput(sessionId: string): ReconcileInput {
    return {
      sessionId,
      observedSeconds: this.observedSeconds,
      finalSeconds: this.finalSeconds,
      confirmed: this.confirmed,
      reason: this.reason,
    };
  }

  markReconciled(seconds: number | null, accepted: boolean): void {
    this.reconciledSeconds = seconds;
    this.reconcileAccepted = accepted;
  }

  snapshot(): LiveUsageSnapshot {
    return {
      observedSeconds: this.observedSeconds,
      finalSeconds: this.finalSeconds,
      confirmed: this.confirmed,
      reason: this.reason,
      reconciledSeconds: this.reconciledSeconds,
      reconcileAccepted: this.reconcileAccepted,
      authoritative: false,
    };
  }
}

export const emptyUsage = (): LiveUsageSnapshot => new LiveUsage().snapshot();
