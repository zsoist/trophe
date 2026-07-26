/**
 * One food-parse request can make:
 * - one initial extraction execution; and
 * - for each bounded item, two decomposition executions plus one macro fallback.
 *
 * An execution can make three OpenAI transports and one Anthropic fallback.
 * Keeping these constants shared makes the opaque-route reservation a static
 * consequence of the response cardinality contract.
 */
export const FOOD_PARSE_MAX_ITEMS = 5;
export const FOOD_PARSE_MAX_TRANSPORTS_PER_EXECUTION = 4;
export const FOOD_PARSE_OPAQUE_MAX_PROVIDER_ATTEMPTS =
  FOOD_PARSE_MAX_TRANSPORTS_PER_EXECUTION
  * (1 + FOOD_PARSE_MAX_ITEMS * 3);
