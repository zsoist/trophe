export const FOOD_PARSE_MAX_ITEMS = 12;
export const FOOD_PARSE_PIPELINE_BUDGET_MS = 50_000;

const FOOD_PARSE_AI_PHASE_RESERVE_MS = 16_000;
const ITEM_LIMIT_MESSAGES: Record<string, (count: number) => string> = {
  en: (count) => `I found ${count} items. Please split this into groups of ${FOOD_PARSE_MAX_ITEMS} or fewer.`,
  es: (count) => `Encontré ${count} alimentos. Divídelos en grupos de ${FOOD_PARSE_MAX_ITEMS} o menos.`,
  el: (count) => `Βρήκα ${count} τρόφιμα. Χώρισέ τα σε ομάδες των ${FOOD_PARSE_MAX_ITEMS} ή λιγότερων.`,
  fr: (count) => `J’ai trouvé ${count} aliments. Divise-les en groupes de ${FOOD_PARSE_MAX_ITEMS} maximum.`,
  de: (count) => `Ich habe ${count} Lebensmittel gefunden. Teile sie in Gruppen von höchstens ${FOOD_PARSE_MAX_ITEMS} auf.`,
  it: (count) => `Ho trovato ${count} alimenti. Dividili in gruppi di massimo ${FOOD_PARSE_MAX_ITEMS}.`,
  pt: (count) => `Encontrei ${count} alimentos. Divide-os em grupos de no máximo ${FOOD_PARSE_MAX_ITEMS}.`,
  nl: (count) => `Ik heb ${count} voedingsmiddelen gevonden. Verdeel ze in groepen van maximaal ${FOOD_PARSE_MAX_ITEMS}.`,
};

export function hasFoodParseAiPhaseBudget(
  deadlineAt: number,
  now = performance.now(),
): boolean {
  return deadlineAt - now >= FOOD_PARSE_AI_PHASE_RESERVE_MS;
}

export function foodParseItemLimitQuestion(language: string, count: number): string {
  return (ITEM_LIMIT_MESSAGES[language] ?? ITEM_LIMIT_MESSAGES.en)(count);
}
