import { isNonIntakeUtterance, MAX_TEXT_FOOD_INTENT_LENGTH } from '@/agents/coach-assistant/text-food-intent';

/**
 * Bounded follow-up interpretation for the live voice rail.
 *
 * Voice turns arrive as one delegated utterance at a time, so a meal can be built up across
 * several turns ("I ate two hot dogs." then "And 30 ml of cola."). This classifier uses ONLY the
 * explicitly bounded local context — the raw text of the current live-reviewed draft — and never
 * provider/remote state. It cannot authorize a write: at most it returns the utterance to
 * *prepare a revised review* from the combined, bounded text.
 *
 * Out of scope on purpose (returns `null`, so the normal conversation path handles it):
 *  - planning ("quiero comer", "I will eat"), negation ("no comí") and edits the writer owns;
 *  - any utterance outside an active live draft;
 *  - anything longer than the existing intake bound, so a truncated/lost fragment is never
 *    converted into a guessed meal.
 */
export interface LiveFoodDraftContext {
  /** Raw text of the bounded current live-reviewed draft, or null when no live food draft is active. */
  currentDraftText: string | null;
  /**
   * True once the current live draft produced a validated applied receipt. The saved meal must
   * never be reused as the rawText of a fresh create: an additive continuation prepares ONLY the
   * added food, and a correction is handed to the normal conversation path instead of re-parsing
   * the old meal.
   */
  currentDraftSaved: boolean;
}

export type LiveFoodFollowup =
  /** Continuation of the current meal: prepare a revised review for the combined text. */
  | { kind: 'addition' | 'correction'; message: string }
  /** A bare save/confirm reference. It only ever points at the existing review — never a write. */
  | { kind: 'confirm_reference' };

/** A save/confirm that names an already-produced object, never a new food. */
const CONFIRM_REFERENCE =
  /^(?:(?:please|por\s+favor)\s+)?(?:log|save|record|register|confirm|registra|registrar|guarda|guárdalo|guardalo|confirma|confírmalo|confirmalo)\s*(?:it|that|this|that one|them|eso|esto|ya|ahora)?\s*[.!]?$/i;
/** A bare demonstrative in an active review context ("eso", "esto", "sí, eso"). */
const BARE_REFERENCE = /^(?:eso|esto|así|asi|sí,?\s*eso|si,?\s*eso)\s*[.!]?$/i;
/** An explicit correction/time-independent restatement of the current meal. */
const CORRECTION = /^(?:actually,?|no,|mejor dicho,?|mejor,?|corrige|corrígelo|corrigelo|cambia|cámbialo|cambialo)\b/i;
/** A bounded additive continuation fragment. */
const ADDITION = /^(?:and|plus|also|y|también|tambien|además|ademas)(?=\s|\d)/i;
/** A quantity signal so a plain "and then" is not treated as a meal addition. */
const QUANTITY = /\d|\b(?:g|gr|gramos?|grams?|ml|mililitros?|milliliters?|oz|onzas?|cups?|tazas?|pieces?|unidad(?:es)?|slices?|rebanadas?)\b/i;
/** Strips a single leading additive conjunction ("And 30 ml cola." -> "30 ml cola."). */
const LEADING_ADDITION = /^(?:and|plus|also|y|también|tambien|además|ademas)(?=\s|\d)[,]?\s*/i;
/**
 * Planning/desire/future language that must NEVER be rewritten into a consumption fragment. The
 * additive remainder must be a genuine consumed-food fragment; "And I want to eat 150g chicken."
 * is a plan and must fall through to the normal conversation path unchanged.
 */
const PLAN_OR_DESIRE =
  /\b(?:want|wanna|wish|would\s+like|would\s+love|will|won't|gonna|going\s+to|intend|plan(?:ning|s|ned)?|hope|need\s+to|should|might|may|quiero|quisiera|querr[aí]a|deseo|desear[ií]a|me\s+gustar[ií]a|voy\s+a|pienso|planeo|tengo\s+ganas|podr[ií]a|deber[ií]a|mañana|manana)\b/i;

/**
 * Classify one live utterance against the bounded current-draft context.
 * Returns `null` when the utterance must follow the normal conversation path.
 */
export function classifyLiveFoodFollowup(text: string, context: LiveFoodDraftContext): LiveFoodFollowup | null {
  const normalized = text.trim().normalize('NFKC');
  if (!normalized || normalized.length > MAX_TEXT_FOOD_INTENT_LENGTH) return null;
  if (!context.currentDraftText || !context.currentDraftText.trim()) return null;
  if (CONFIRM_REFERENCE.test(normalized) || BARE_REFERENCE.test(normalized)) return { kind: 'confirm_reference' };
  if (isNonIntakeUtterance(normalized)) return null;
  if (CORRECTION.test(normalized)) return { kind: 'correction', message: normalized };
  if (ADDITION.test(normalized) && QUANTITY.test(normalized)) return { kind: 'addition', message: normalized };
  return null;
}

/**
 * Resolve the utterance to prepare for a bounded live follow-up.
 *
 * While a review is still open the follow-up is combined with the bounded draft text so the
 * parser sees the whole (still-unsaved) meal. Once that meal is already saved the old rawText is
 * NEVER reused: an addition prepares a fresh intake for only the added food, and any other
 * follow-up (correction, plain utterance) falls through to the normal conversation path so the
 * saved meal can never be duplicated. Returns `null` when the utterance must follow the normal
 * path as-is.
 */
export function resolveLiveFoodFollowupMessage(
  followup: LiveFoodFollowup,
  context: LiveFoodDraftContext,
): string | null {
  if (!context.currentDraftText || !context.currentDraftText.trim()) return null;
  if (!context.currentDraftSaved) {
    return followup.kind === 'confirm_reference' ? null : combineLiveFoodText(context.currentDraftText, followup.message);
  }
  if (followup.kind !== 'addition') return null;
  // The saved meal is already canonical: prepare ONLY the added food as a new bounded intake.
  // The remainder must be a genuine additive consumed-food fragment: a planning/desire, future,
  // negation or correction remainder is preserved verbatim and handed to the normal conversation
  // path instead of being rewritten into a fake intake ("I ate I want to eat 150g chicken.").
  const remainder = followup.message.trim().replace(LEADING_ADDITION, '').trim();
  if (!remainder || remainder.length > MAX_TEXT_FOOD_INTENT_LENGTH) return null;
  if (isNonIntakeUtterance(remainder) || PLAN_OR_DESIRE.test(remainder) || CORRECTION.test(remainder)) return null;
  return `I ate ${remainder}`.trim();
}

/**
 * Combine a bounded follow-up with the current draft text so the existing parser sees the whole
 * meal. Returns `null` when the combined text would exceed the existing intake bound — the caller
 * then falls back to plain conversation rather than sending a truncated meal.
 */
export function combineLiveFoodText(currentDraftText: string, followup: string): string | null {
  const combined = `${currentDraftText.trim()} ${followup.trim()}`.replace(/\s+/g, ' ').trim();
  if (!combined || combined.length > MAX_TEXT_FOOD_INTENT_LENGTH) return null;
  return combined;
}
