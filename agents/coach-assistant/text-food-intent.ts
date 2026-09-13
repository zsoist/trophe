/** Bound on the raw utterance that may be interpreted as a new-meal intake. */
export const MAX_TEXT_FOOD_INTENT_LENGTH = 500;

/**
 * Planning, negation and edit/correction language must NEVER start an intake (written or even
 * prepared). Shared verbatim with the live follow-up classifier so both sides agree on what is
 * explicitly out of scope. Exported for that single reuse — it is not a general-purpose filter.
 */
export const NON_INTAKE_PATTERN =
  /\b(?:not|never|don't|didn't|haven't|won't|tomorrow|might|would|should|will|planning|plan to|instead|delete|remove|change|correct|no|nunca|mañana|manana|quizás|quizas|comería|comeria|voy a|cambia|corrige|elimina|borra)\b/i;

export function isNonIntakeUtterance(text: string): boolean {
  return NON_INTAKE_PATTERN.test(text);
}

/**
 * A bounded offer to estimate a NEW meal, never permission to write it.
 * Ambiguous, planned, negative and edit requests stay in normal conversation.
 *
 * A bare reference ("log it", "eso", "registra eso") is deliberately NOT an intake: it can only
 * ever point at an already-reviewed proposal, never authorize a guessed/new food. The explicit
 * request forms ("I want to log …", "quiero registrar …") DO prepare a review, but the writer
 * still requires the user's explicit confirmation.
 */
export function textFoodIntakeIntent(text: string): { text: string; language: 'en' | 'es' } | null {
  const normalized = text.trim().normalize('NFKC');
  if (!normalized || normalized.length > MAX_TEXT_FOOD_INTENT_LENGTH) return null;
  if (isNonIntakeUtterance(normalized)) return null;
  if (/^(?:I\s+(?:(?:just|actually)\s+)?(?:ate|had|drank)\s+|(?:please\s+)?log\s+(?!it\b|that\b|this\b|my\b)|(?:i\s+want\s+to|i(?:'d|\s+would)\s+like\s+to|i\s+need\s+to)\s+(?:log|record|add)\s+(?!it\b|that\b|this\b|my\b))/i.test(normalized)) return { text: normalized, language: 'en' };
  if (/^(?:(?:yo\s+)?(?:comí|comi|almorcé|almorce|cené|cene|desayuné|desayune|bebí|bebi)\s+|acabo de (?:comer|beber)\s+|(?:por favor\s+)?registra\s+(?!eso\b|esto\b|mi\b|lo\b)|(?:quiero|quisiera|necesito|deseo|me\s+gustaría)\s+(?:registrar|anotar|apuntar)\s+(?!eso\b|esto\b|mi\b|lo\b))/i.test(normalized)) return { text: normalized, language: 'es' };
  return null;
}
