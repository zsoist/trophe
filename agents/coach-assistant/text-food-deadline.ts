/** Native Food has a 50s algorithm ceiling; leave room for authorization, durable
 * claims and review persistence. Browser additionally allows response/turn setup.
 * Neither value changes transport attempts, model limits, or the shared budget. */
export const TEXT_FOOD_SERVER_DEADLINE_MS = 65_000;
export const TEXT_FOOD_CLIENT_DEADLINE_MS = TEXT_FOOD_SERVER_DEADLINE_MS + 10_000;
