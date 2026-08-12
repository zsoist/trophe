export type PortionSize = 'small' | 'medium' | 'large';

export interface PortionSizeOption {
  size: PortionSize;
  grams: number;
}

const MAX_PORTION_GRAMS = 15_000;

const NATURAL_PORTION_UNITS = new Set([
  'bottle',
  'bottles',
  'bowl',
  'bowls',
  'can',
  'cans',
  'cup',
  'cups',
  'dish',
  'dishes',
  'glass',
  'glasses',
  'piece',
  'pieces',
  'pint',
  'pints',
  'plate',
  'plates',
  'portion',
  'portions',
  'scoop',
  'scoops',
  'serving',
  'servings',
  'slice',
  'slices',
  'tablespoon',
  'tablespoons',
  'tbsp',
  'teaspoon',
  'teaspoons',
  'tsp',
]);

const NATURAL_PORTION_LABELS: Record<string, [singular: string, plural: string]> = {
  bottle: ['bottle', 'bottles'],
  bottles: ['bottle', 'bottles'],
  bowl: ['bowl', 'bowls'],
  bowls: ['bowl', 'bowls'],
  can: ['can', 'cans'],
  cans: ['can', 'cans'],
  cup: ['cup', 'cups'],
  cups: ['cup', 'cups'],
  dish: ['dish', 'dishes'],
  dishes: ['dish', 'dishes'],
  glass: ['glass', 'glasses'],
  glasses: ['glass', 'glasses'],
  piece: ['piece', 'pieces'],
  pieces: ['piece', 'pieces'],
  pint: ['pint', 'pints'],
  pints: ['pint', 'pints'],
  plate: ['plate', 'plates'],
  plates: ['plate', 'plates'],
  portion: ['portion', 'portions'],
  portions: ['portion', 'portions'],
  scoop: ['scoop', 'scoops'],
  scoops: ['scoop', 'scoops'],
  serving: ['serving', 'servings'],
  servings: ['serving', 'servings'],
  slice: ['slice', 'slices'],
  slices: ['slice', 'slices'],
  tablespoon: ['tablespoon', 'tablespoons'],
  tablespoons: ['tablespoon', 'tablespoons'],
  teaspoon: ['teaspoon', 'teaspoons'],
  teaspoons: ['teaspoon', 'teaspoons'],
};

type NaturalPortionUnitKey =
  | 'bottle'
  | 'bowl'
  | 'can'
  | 'cup'
  | 'dish'
  | 'glass'
  | 'piece'
  | 'pint'
  | 'plate'
  | 'portion'
  | 'scoop'
  | 'serving'
  | 'slice'
  | 'tablespoon'
  | 'teaspoon';

const NATURAL_PORTION_UNIT_KEYS: Record<string, NaturalPortionUnitKey> = {
  bottle: 'bottle', bottles: 'bottle', botella: 'bottle', botellas: 'bottle', bouteille: 'bottle', bouteilles: 'bottle',
  flasche: 'bottle', flaschen: 'bottle', bottiglia: 'bottle', bottiglie: 'bottle', garrafa: 'bottle', garrafas: 'bottle', fles: 'bottle', flessen: 'bottle', 'μπουκάλι': 'bottle', 'μπουκάλια': 'bottle',
  bowl: 'bowl', bowls: 'bowl', bol: 'bowl', bols: 'bowl', schüssel: 'bowl', schüsseln: 'bowl', ciotola: 'bowl', ciotole: 'bowl', tigela: 'bowl', tigelas: 'bowl', kom: 'bowl', kommen: 'bowl', 'μπολ': 'bowl', 'μπωλ': 'bowl',
  can: 'can', cans: 'can', lata: 'can', latas: 'can', canette: 'can', canettes: 'can', dosen: 'can', lattina: 'can', lattine: 'can', blik: 'can', blikken: 'can', 'κουτάκι': 'can', 'κουτάκια': 'can',
  cup: 'cup', cups: 'cup', taza: 'cup', tazas: 'cup', tasse: 'cup', tasses: 'cup', tassen: 'cup', tazza: 'cup', tazze: 'cup', 'xícara': 'cup', 'xícaras': 'cup', xicara: 'cup', xicaras: 'cup', 'chávena': 'cup', 'chávenas': 'cup', chavena: 'cup', chavenas: 'cup', kop: 'cup', koppen: 'cup', 'φλιτζάνι': 'cup', 'φλιτζάνια': 'cup',
  dish: 'dish', dishes: 'dish', plato: 'dish', platos: 'dish', plat: 'dish', plats: 'dish', gericht: 'dish', gerichte: 'dish', piatto: 'dish', piatti: 'dish', prato: 'dish', pratos: 'dish', gerecht: 'dish', gerechten: 'dish', 'πιάτο': 'dish', 'πιάτα': 'dish',
  glass: 'glass', glasses: 'glass', vaso: 'glass', vasos: 'glass', verre: 'glass', verres: 'glass', glas: 'glass', gläser: 'glass', bicchiere: 'glass', bicchieri: 'glass', copo: 'glass', copos: 'glass', glazen: 'glass', 'ποτήρι': 'glass', 'ποτήρια': 'glass',
  piece: 'piece', pieces: 'piece', pieza: 'piece', piezas: 'piece', morceau: 'piece', morceaux: 'piece', stück: 'piece', stücke: 'piece', pezzo: 'piece', pezzi: 'piece', 'pedaço': 'piece', 'pedaços': 'piece', pedaco: 'piece', pedacos: 'piece', stuk: 'piece', stukken: 'piece', 'κομμάτι': 'piece', 'κομμάτια': 'piece',
  pint: 'pint', pints: 'pint', pinta: 'pint', pintas: 'pint', pinte: 'pint', pintes: 'pint', 'πίντα': 'pint', 'πίντες': 'pint',
  plate: 'plate', plates: 'plate', assiette: 'plate', assiettes: 'plate', teller: 'plate', bord: 'plate', borden: 'plate',
  portion: 'portion', portions: 'portion', 'porción': 'portion', porciones: 'portion', portionen: 'portion', porzione: 'portion', porzioni: 'portion', 'porção': 'portion', 'porções': 'portion', porcao: 'portion', porcoes: 'portion', portie: 'portion', porties: 'portion', 'μερίδα': 'portion', 'μερίδες': 'portion',
  scoop: 'scoop', scoops: 'scoop', medida: 'scoop', medidas: 'scoop', dosette: 'scoop', dosettes: 'scoop', messlöffel: 'scoop', messloeffel: 'scoop', misurino: 'scoop', misurini: 'scoop', maatschep: 'scoop', maatscheppen: 'scoop', 'μεζούρα': 'scoop', 'μεζούρες': 'scoop',
  serving: 'serving', servings: 'serving', racion: 'serving', 'ración': 'serving', raciones: 'serving', dose: 'serving', doses: 'serving', dosi: 'serving',
  slice: 'slice', slices: 'slice', rebanada: 'slice', rebanadas: 'slice', tranche: 'slice', tranches: 'slice', scheibe: 'slice', scheiben: 'slice', fetta: 'slice', fette: 'slice', fatia: 'slice', fatias: 'slice', plak: 'slice', plakken: 'slice', 'φέτα': 'slice', 'φέτες': 'slice',
  tablespoon: 'tablespoon', tablespoons: 'tablespoon', tbsp: 'tablespoon', cucharada: 'tablespoon', cucharadas: 'tablespoon', cuillere: 'tablespoon', 'cuillère': 'tablespoon', 'cuillère à soupe': 'tablespoon', 'cuillères à soupe': 'tablespoon', esslöffel: 'tablespoon', essloeffel: 'tablespoon', cucchiaio: 'tablespoon', cucchiai: 'tablespoon', 'colher de sopa': 'tablespoon', 'colheres de sopa': 'tablespoon', eetlepel: 'tablespoon', eetlepels: 'tablespoon', 'κουταλιά': 'tablespoon', 'κουταλιές': 'tablespoon',
  teaspoon: 'teaspoon', teaspoons: 'teaspoon', tsp: 'teaspoon', cucharadita: 'teaspoon', cucharaditas: 'teaspoon', 'cuillère à café': 'teaspoon', 'cuillères à café': 'teaspoon', teelöffel: 'teaspoon', teeloeffel: 'teaspoon', cucchiaino: 'teaspoon', cucchiaini: 'teaspoon', 'colher de chá': 'teaspoon', 'colheres de chá': 'teaspoon', 'colher de cha': 'teaspoon', 'colheres de cha': 'teaspoon', theelepel: 'teaspoon', theelepels: 'teaspoon', 'κουταλάκι': 'teaspoon', 'κουταλάκια': 'teaspoon',
};

function normalizeNaturalPortionUnit(unit: string): string {
  return unit.trim().toLowerCase().replace(/\.$/, '');
}

function clampPortion(grams: number): number {
  return Math.max(1, Math.min(MAX_PORTION_GRAMS, grams));
}

function roundPractical(grams: number): number {
  if (grams < 5) return clampPortion(Math.round(grams));
  return clampPortion(Math.round(grams / 5) * 5);
}

interface RecalculablePortion {
  unit: string;
  grams: number;
  quantity: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g?: number;
  portion_explicit?: boolean;
  confidence: number;
}

export function recalculatePortion<T extends RecalculablePortion>(item: T, requestedGrams: number): T {
  const newGrams = clampPortion(requestedGrams);
  const ratio = item.grams > 0 ? newGrams / item.grams : 1;
  const quantityPrecision = isNaturalPortionUnit(item.unit) ? 100 : 10;
  return {
    ...item,
    grams: newGrams,
    quantity: item.quantity > 0
      ? Math.round(item.quantity * ratio * quantityPrecision) / quantityPrecision
      : item.quantity,
    calories: Math.round(item.calories * ratio),
    protein_g: Math.round(item.protein_g * ratio * 10) / 10,
    carbs_g: Math.round(item.carbs_g * ratio * 10) / 10,
    fat_g: Math.round(item.fat_g * ratio * 10) / 10,
    fiber_g: Math.round(item.fiber_g * ratio * 10) / 10,
    sugar_g: Math.round((item.sugar_g ?? 0) * ratio * 10) / 10,
    portion_explicit: true,
    confidence: Math.max(item.confidence, 0.8),
  };
}

export function getPortionSizeOptions(grams: number): PortionSizeOption[] {
  const center = clampPortion(Number.isFinite(grams) ? grams : 1);
  return [
    { size: 'small', grams: roundPractical(center * 0.7) },
    { size: 'medium', grams: roundPractical(center) },
    { size: 'large', grams: roundPractical(center * 1.4) },
  ];
}

export function getPortionDisplayAmount(grams: number, gramsPerDisplayUnit: number): number {
  if (!Number.isFinite(gramsPerDisplayUnit) || gramsPerDisplayUnit <= 0) return grams;
  const display = grams / gramsPerDisplayUnit;
  return display >= 10
    ? Math.round(display)
    : Math.round(display * 10) / 10;
}

export function isNaturalPortionUnit(unit: string): boolean {
  const normalized = normalizeNaturalPortionUnit(unit);
  return NATURAL_PORTION_UNITS.has(normalized) || normalized in NATURAL_PORTION_UNIT_KEYS;
}

export function canUseNaturalPortionDisplay({
  unit,
  grams,
  quantity,
}: {
  unit: string;
  grams: number;
  quantity: number;
}): boolean {
  return isNaturalPortionUnit(unit)
    && Number.isFinite(grams)
    && grams > 0
    && Number.isFinite(quantity)
    && quantity > 0;
}

export function formatNaturalPortionUnit(unit: string, amount: number): string {
  const normalized = normalizeNaturalPortionUnit(unit);
  const labels = NATURAL_PORTION_LABELS[normalized];
  if (!labels) return unit;
  return amount === 1 ? labels[0] : labels[1];
}

export function getNaturalPortionUnitTranslationKey(
  unit: string,
  amount: number,
  locale?: string,
): string | null {
  const normalized = normalizeNaturalPortionUnit(unit);
  // “Dose” is a can in German, but a serving in Portuguese and Italian.
  const unitKey = normalized === 'dose' && locale?.toLowerCase().startsWith('de')
    ? 'can'
    : NATURAL_PORTION_UNIT_KEYS[normalized];
  return unitKey ? `food.unit.${unitKey}_${amount === 1 ? 'one' : 'other'}` : null;
}

export function getHumanPortionAmount({
  grams,
  quantity,
}: {
  grams: number;
  quantity: number;
}): number {
  if (!Number.isFinite(quantity) || quantity <= 0) return grams;
  const gramsPerHumanUnit = grams / quantity;
  return Math.round((grams / gramsPerHumanUnit) * 100) / 100;
}

export function getGramsForHumanPortion({
  grams,
  quantity,
  humanAmount,
}: {
  grams: number;
  quantity: number;
  humanAmount: number;
}): number {
  if (!Number.isFinite(humanAmount) || humanAmount <= 0) return grams;
  if (!Number.isFinite(quantity) || quantity <= 0) return clampPortion(humanAmount);
  return clampPortion(humanAmount * (grams / quantity));
}

export function resolveAmountDraft(
  draft: string,
  previous: number,
  bounds: { min?: number; max?: number } = {},
): number {
  if (draft.trim() === '') return previous;
  const parsed = Number(draft);
  const min = bounds.min ?? 1;
  const max = bounds.max ?? MAX_PORTION_GRAMS;
  return Number.isFinite(parsed) && parsed > 0
    ? Math.max(min, Math.min(max, parsed))
    : previous;
}

const PORTION_QUESTION_PATTERN = /\b(?:how\s+much|quantity|grams?|portion|serving|size|cantidad|gramos?|porci[oó]n|tama(?:ñ|n)o|quantit[eé]|grammes?|taille)\b|πόσ[οηα]?|ποσότητα|γραμμ|μερίδ/iu;

export function isPortionClarificationQuestion(question: string): boolean {
  return PORTION_QUESTION_PATTERN.test(question);
}

export function shouldTreatPortionAsEstimated({
  portionExplicit,
  itemCount,
  clarificationQuestion,
}: {
  portionExplicit?: boolean;
  itemCount: number;
  clarificationQuestion?: string | null;
}): boolean {
  if (portionExplicit === false) return true;
  return itemCount === 1
    && !!clarificationQuestion
    && isPortionClarificationQuestion(clarificationQuestion);
}

export function shouldShowGlobalClarification({
  clarificationQuestion,
  itemCount,
}: {
  clarificationQuestion?: string | null;
  itemCount: number;
}): boolean {
  if (!clarificationQuestion) return false;
  return itemCount !== 1 || !isPortionClarificationQuestion(clarificationQuestion);
}

export function normalizeItemsForPortionReview<T extends { portion_explicit?: boolean }>(
  items: T[],
  clarificationQuestion?: string | null,
): T[] {
  return items.map(item => {
    if (!shouldTreatPortionAsEstimated({
      portionExplicit: item.portion_explicit,
      itemCount: items.length,
      clarificationQuestion,
    }) || item.portion_explicit === false) {
      return item;
    }
    return { ...item, portion_explicit: false };
  });
}
