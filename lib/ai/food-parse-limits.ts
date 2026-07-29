import { FOOD_PARSE_MAX_ITEMS } from '../../agents/food-parse/pipeline-budget';

/**
 * One bounded food-parse request can make at most:
 * - one initial extraction and one schema repair;
 * - one decomposition per returned item; and
 * - one batched macro fallback for every unresolved item.
 *
 * Each execution can make three OpenAI transports and one Anthropic fallback.
 * The computed ceiling is documented for review, while opaque live-route tools
 * intentionally retain a value above the approval system's hard 1,000-call
 * ceiling so they remain disabled during the zero-spend phase.
 */
export const FOOD_PARSE_MAX_TRANSPORTS_PER_EXECUTION = 4;
export const FOOD_PARSE_MAX_EXECUTIONS =
  2 + FOOD_PARSE_MAX_ITEMS + 1;
export const FOOD_PARSE_COMPUTED_MAX_PROVIDER_ATTEMPTS =
  FOOD_PARSE_MAX_EXECUTIONS * FOOD_PARSE_MAX_TRANSPORTS_PER_EXECUTION;
export const FOOD_PARSE_OPAQUE_MAX_PROVIDER_ATTEMPTS = 1_001;
