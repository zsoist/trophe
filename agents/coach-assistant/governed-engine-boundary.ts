import type { OfflineConversationProvider } from './open-conversation';
import { sharedPilotRuntimeGate } from '@/lib/workout/shared-pilot-budget';
import { isGovernedCoachTransport } from './governed-transport';

/** Process-local proof that a provider is behind the LIVE-01 durable budget gate. */
export interface GovernedPilotBoundary {
  readonly kind: 'governed_live_pilot';
}

const issued = new WeakMap<GovernedPilotBoundary, {
  provider: OfflineConversationProvider;
  valid: () => boolean;
}>();

export function createGovernedPilotBoundary(
  env: Record<string, string | undefined>,
  actorId: string,
  provider: OfflineConversationProvider,
) {
  if (!sharedPilotRuntimeGate(env, actorId).ok || !isGovernedCoachTransport(provider)) {
    throw new Error('governed_pilot_disabled');
  }
  const boundary: GovernedPilotBoundary = Object.freeze({ kind: 'governed_live_pilot' });
  issued.set(boundary, {
    provider,
    valid: () => sharedPilotRuntimeGate(env, actorId).ok && isGovernedCoachTransport(provider),
  });
  return boundary;
}

export function isGovernedPilotBoundary(
  boundary: GovernedPilotBoundary | undefined,
  provider: OfflineConversationProvider | undefined,
) {
  if (!boundary) return false;
  const match = issued.get(boundary);
  return !!match && match.provider === provider && match.valid();
}
