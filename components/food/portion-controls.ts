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

function clampPortion(grams: number): number {
  return Math.max(1, Math.min(MAX_PORTION_GRAMS, grams));
}

function roundPractical(grams: number): number {
  if (grams < 5) return clampPortion(Math.round(grams));
  return clampPortion(Math.round(grams / 5) * 5);
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
  return NATURAL_PORTION_UNITS.has(unit.trim().toLowerCase().replace(/\.$/, ''));
}

export function formatNaturalPortionUnit(unit: string, amount: number): string {
  const normalized = unit.trim().toLowerCase().replace(/\.$/, '');
  const labels = NATURAL_PORTION_LABELS[normalized];
  if (!labels) return unit;
  return amount === 1 ? labels[0] : labels[1];
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
  return getPortionDisplayAmount(grams, gramsPerHumanUnit);
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

export function resolveAmountDraft(draft: string, previous: number): number {
  if (draft.trim() === '') return previous;
  const parsed = Number(draft);
  return Number.isFinite(parsed) && parsed > 0
    ? clampPortion(parsed)
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
