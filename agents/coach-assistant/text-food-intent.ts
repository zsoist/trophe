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
 * Questions and advice/status requests stay in the conversation lane even
 * when they mention something already eaten (for example, "I had breakfast,
 * how am I doing today?"). Voice transcripts often omit punctuation, so the
 * interrogative markers are intentionally matched without requiring a `?`.
 *
 * A status question can also put the auxiliary AFTER the food clause
 * ("I drank a sugary soda is that bad", "I ate chicken am I on track"). Those
 * inversions are matched anywhere in the utterance, but only when the subject
 * follows the auxiliary AND more words follow the subject, so a plain
 * statement tail ("I had a burger and that was it") is not re-read as a
 * question. This is a bounded question detector, not a semantic classifier.
 */
export const ADVICE_OR_QUESTION_PATTERN =
  /\?|\b(?:how|why|whether|which|who|whose|cu[aá]nt[oa]s?|c[oó]mo|qu[eé]|cu[aá]l(?:es)?|cu[aá]ndo|d[oó]nde|qui[eé]n(?:es)?)\b|(?:^|[,.;:!?]\s*|\b(?:and|but|so|or|y|pero|entonces)\s+)(?:what|is|are|was|were|do|does|did|can|could|am|debo|deber[ií]a|puedo)\b|\b(?:is|are|was|were|am|do|does|did|can|could)\s+(?:that|this|it|those|these|i)\b(?=\s+\S)|\b(?:puedo|puede|debo|deber[ií]a)\b(?=\s+\S)/i;

export function isAdviceOrQuestionUtterance(text: string): boolean {
  return ADVICE_OR_QUESTION_PATTERN.test(text);
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
  const englishIngestion = /^I\s+(?:(?:just|actually)\s+)?(?:ate|had|drank)\s+/i.test(normalized)
    && !isAdviceOrQuestionUtterance(normalized);
  const englishRequest = /^(?:(?:please\s+)?log\s+(?!it\b|that\b|this\b|my\b)|(?:i\s+want\s+to|i(?:'d|\s+would)\s+like\s+to|i\s+need\s+to)\s+(?:log|record|add)\s+(?!it\b|that\b|this\b|my\b))/i.test(normalized);
  if (englishIngestion || englishRequest) return { text: normalized, language: 'en' };
  const spanishIngestion = /^(?:(?:yo\s+)?(?:comí|comi|almorcé|almorce|cené|cene|desayuné|desayune|bebí|bebi)\s+|acabo de (?:comer|beber)\s+)/i.test(normalized)
    && !isAdviceOrQuestionUtterance(normalized);
  const spanishRequest = /^(?:(?:por favor\s+)?registra\s+(?!eso\b|esto\b|mi\b|lo\b)|(?:quiero|quisiera|necesito|deseo|me\s+gustaría)\s+(?:registrar|anotar|apuntar)\s+(?!eso\b|esto\b|mi\b|lo\b))/i.test(normalized);
  if (spanishIngestion || spanishRequest) return { text: normalized, language: 'es' };
  return null;
}
