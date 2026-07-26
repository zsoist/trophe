/**
 * One food-parse request can make:
 * - one initial extraction execution; and
 * - for each returned item, two decomposition executions plus one macro fallback.
 *
 * An execution can make three OpenAI transports and one Anthropic fallback.
 * Production intentionally has no artificial meal-item ceiling. An opaque
 * route evaluator therefore cannot prove a finite provider-attempt envelope.
 * Setting this above the approval system's hard 1,000-call ceiling makes every
 * such evaluator fail closed before it can select or execute a case.
 */
export const FOOD_PARSE_MAX_TRANSPORTS_PER_EXECUTION = 4;
export const FOOD_PARSE_OPAQUE_MAX_PROVIDER_ATTEMPTS = 1_001;
