/** A bounded offer to estimate a NEW meal, never permission to write it.
 * Ambiguous, planned, negative and edit requests stay in normal conversation.
 */
export function textFoodIntakeIntent(text: string): { text: string; language: 'en' | 'es' } | null {
  const normalized = text.trim().normalize('NFKC');
  if (!normalized || normalized.length > 500) return null;
  if (/\b(?:not|never|don't|didn't|haven't|won't|tomorrow|might|would|should|will|planning|plan to|instead|delete|remove|change|correct|no|nunca|mañana|manana|quizás|quizas|comería|comeria|voy a|cambia|corrige|elimina|borra)\b/i.test(normalized)) return null;
  if (/^(?:I\s+(?:(?:just|actually)\s+)?(?:ate|had|drank)\s+|(?:please\s+)?log\s+(?!it\b|that\b|this\b|my\b))/i.test(normalized)) return { text: normalized, language: 'en' };
  if (/^(?:(?:yo\s+)?(?:comí|comi|almorcé|almorce|cené|cene|desayuné|desayune|bebí|bebi)\s+|acabo de (?:comer|beber)\s+|(?:por favor\s+)?registra\s+(?!eso\b|esto\b|mi\b))/i.test(normalized)) return { text: normalized, language: 'es' };
  return null;
}
