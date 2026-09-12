import type { RunOptions } from './index';
import type { CoachConversationRequest, CoachConversationResponse } from './contracts';
import { conversationRequestSchema } from './schema';
import { runConversationCandidate } from './conversation-candidate';
import { createGovernedCoachTransport, type GovernedCoachTransport } from './governed-transport';
import { createGovernedPilotBoundary } from './governed-engine-boundary';
import { CAPABILITY_PROMPT_VERSION } from './capability-conversation';
import { COACH_CANDIDATE_PROMPT_VERSION } from './prompt.v5';
import type { PilotBudgetStore } from './pilot-budget';
import { USD_IN_NANODOLLARS } from './pilot-budget';
import { createSharedPilotBudgetRuntime } from '@/lib/workout/shared-pilot-budget';

type EngineOptions = RunOptions & {
  capabilityRegistry?: import('./capability-registry').CoachCapabilityRegistry;
  filterMemoryHistory?: (input: CoachConversationRequest) => CoachConversationRequest;
  isolatedActionsEnabled?: boolean;
  workoutSetIntentsEnabled?: boolean;
  foodQuantityIntentsEnabled?: boolean;
  foodSelection?: import('./open-conversation').ConversationFoodSelection;
  foodChange?: import('./open-conversation').ConversationFoodChange;
  resolvePhotoObservations?: (input: CoachConversationRequest, signal: AbortSignal) => Promise<import('./open-conversation').ConversationPhotoObservation[]>;
};

export interface GovernedCoachEngineBinding {
  readonly kind: 'governed_coach_engine_binding';
  run(raw: unknown, options: EngineOptions): Promise<CoachConversationResponse>;
}

interface VerifiedExecution {
  binding: GovernedCoachEngineBinding;
  request: string;
  actorId: string;
}

const bindings = new WeakSet<GovernedCoachEngineBinding>();
const executions = new WeakMap<CoachConversationResponse, VerifiedExecution>();
const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

/** Authenticated Preview composition for the text-only LIVE-01 pilot. */
export function createGovernedCoachEngineBinding(input: {
  env: Record<string, string | undefined>;
  actorId: string;
  persistentStore: PilotBudgetStore;
  transport: GovernedCoachTransport;
}): GovernedCoachEngineBinding {
  const runtime = createSharedPilotBudgetRuntime(input.env, input.actorId, input.persistentStore);
  if (!runtime.ok) throw new Error(`governed_pilot_${runtime.error}`);

  const binding: GovernedCoachEngineBinding = Object.freeze({
    kind: 'governed_coach_engine_binding',
    async run(raw: unknown, options: EngineOptions) {
      if (options.actorId !== input.actorId || options.repository.dataSource !== 'authorized_records') {
        throw new Error('forbidden');
      }
      const request = conversationRequestSchema.parse(raw);
      const governed = createGovernedCoachTransport({
        pilotId: runtime.pilotId,
        actorId: input.actorId,
        turnId: request.turnId,
        identityParts: [runtime.pilotId, input.actorId, request.conversationId, request.turnId],
        mode: 'live',
        store: runtime.store,
        signal: options.signal,
        transport: input.transport,
        allowedPromptVersions: [CAPABILITY_PROMPT_VERSION, COACH_CANDIDATE_PROMPT_VERSION],
      });
      const boundary = createGovernedPilotBoundary(input.env, input.actorId, governed.transport);
      const response = await runConversationCandidate(request, {
        ...options,
        mode: 'model',
        offlineConversationProvider: governed.transport,
        governedPilotBoundary: boundary,
        providerEvidence: 'provider_real',
      });
      if (governed.attempts.length > 0) {
        response.telemetry.model = 'gpt-5.6-luna';
        response.telemetry.provider = 'openai';
        if (governed.attempts.every(attempt => attempt.state === 'settled' && attempt.pricedUsageNanoUsd !== null)) {
          response.telemetry.costUsd = governed.attempts.reduce(
            (total, attempt) => total + attempt.pricedUsageNanoUsd!, 0,
          ) / USD_IN_NANODOLLARS;
        }
      }
      executions.set(response, { binding, request: stable(request), actorId: options.actorId });
      return response;
    },
  });
  bindings.add(binding);
  return binding;
}

export function isGovernedCoachEngineBinding(value: unknown): value is GovernedCoachEngineBinding {
  return !!value && typeof value === 'object' && bindings.has(value as GovernedCoachEngineBinding);
}

export function verifyGovernedCoachEngineExecution(
  binding: GovernedCoachEngineBinding,
  input: unknown,
  actorId: string,
  response: CoachConversationResponse,
): boolean {
  if (!bindings.has(binding)) return false;
  const execution = executions.get(response);
  return !!execution && execution.binding === binding && execution.actorId === actorId
    && execution.request === stable(input);
}
