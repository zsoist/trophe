/**
 * Client-facing view flags (Daily Nutrafit — Michael's request, Jun 12).
 *
 * Michael coaches that calories are "a made-up thing" that confuse clients, and
 * that unsolicited food ideas tempt clients to deviate from the prescribed plan.
 * So the CLIENT view (the /dashboard/* surface) hides calorie numbers, the
 * weekly calorie-adherence chart, and the generic food-idea suggester. Coaches
 * still see everything on the /coach/* surface.
 *
 * Kept as module-level flags for now (beta has one coach). The natural next step
 * is a per-coach preference column so each coach decides what their clients see.
 */
export const CLIENT_SHOWS_CALORIES = false;
export const CLIENT_SHOWS_FOOD_IDEAS = false;
