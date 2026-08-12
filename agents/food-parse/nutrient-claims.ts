export interface UserStatedNutrients {
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  fiber_g?: number;
  sugar_g?: number;
}

type GramNutrientKey = Exclude<keyof UserStatedNutrients, 'calories'>;

interface NutrientDefinition {
  key: GramNutrientKey;
  aliases: string;
}

const NUTRIENTS: NutrientDefinition[] = [
  { key: 'protein_g', aliases: 'protein(?:e|es)?|proteina|πρωτεινη' },
  { key: 'carbs_g', aliases: 'carbs?|carbohydrates?|carbohidratos?|glucides?|υδατανθρακ(?:ες|ων|α)?' },
  { key: 'fat_g', aliases: 'fats?|grasas?|lipides?|λιπος|λιπαρα' },
  { key: 'fiber_g', aliases: 'fibers?|fibres?|fibras?|ινες|φυτικες\s+ινες' },
  { key: 'sugar_g', aliases: 'sugars?|azucar(?:es)?|sucres?|ζαχαρη|σακχαρα' },
];

const NUMBER_SOURCE = '(\\d+(?:[.,]\\d+)?)';
const GRAM_SOURCE = '(?:g|gr|grams?|gramos?|grammes?|γρ\\.?)';
const OF_SOURCE = '(?:of|de|del|d|απο)?';
const MASS_UNITS = new Set(['g', 'gram', 'grams', 'gr', 'γρ']);
const COUNTABLE_PRODUCT = /\b(?:bar|cookie|biscuit|brownie|muffin|egg|banana|apple|piece|packet|pack)\b/i;
const PRODUCT_NOUN_AFTER_PROTEIN = /^(?:bar|shake|powder|cookie|snack|drink|en\s+polvo|en\s+poudre|σε\s+σκονη|in\s+polvere|em\s+po|pulver|poeder|barra|batido|galleta|bebida|barre)\b/iu;
const CLAIM_CONTEXT = /\b(?:with|has|have|contains?|provides?|con|contiene|avec|contient|με|εχει)\b/i;
const ALCOHOL_NAME_PATTERN = /\b(?:wine|beer|ale|lager|stout|cocktail|mojito|margarita|martini|sangria|champagne|prosecco|cava|cider|rum|vodka|whisk(?:y|ey)?|tequila|gin|brandy|cognac|liqueur|aperol|spritz|negroni|alcohol|vino|cerveza|biere|κρασι|μπιρα|μπυρα|ουζο|τσιπουρο|ouzo|raki|soju|sake)\b/iu;

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

function toPositiveNumber(value: string): number | null {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function hasIndependentFoodMass(candidate: NutrientCandidate): boolean {
  const rawText = normalize(candidate.raw_text ?? '');
  if (!rawText) return false;

  const massPattern = new RegExp(`(?<!\\d)${NUMBER_SOURCE}\\s*${GRAM_SOURCE}`, 'giu');
  for (const match of rawText.matchAll(massPattern)) {
    const value = toPositiveNumber(match[1]);
    if (value === null || Math.abs(value - candidate.quantity) >= 0.01) continue;

    const suffix = rawText.slice((match.index ?? 0) + match[0].length);
    let isNutrientClaim = false;
    for (const definition of NUTRIENTS) {
      const nutrient = new RegExp(
        `^\\s*${OF_SOURCE}\\s*(?:${definition.aliases})(?=$|[^\\p{L}])`,
        'iu',
      ).exec(suffix);
      if (!nutrient) continue;

      const afterNutrient = suffix.slice(nutrient[0].length).trimStart();
      isNutrientClaim = !(
        definition.key === 'protein_g' &&
        PRODUCT_NOUN_AFTER_PROTEIN.test(afterNutrient)
      );
      break;
    }

    if (!isNutrientClaim) return true;
  }
  return false;
}

function firstGramClaim(text: string, definition: NutrientDefinition): number | null {
  const valueFirst = new RegExp(
    `${NUMBER_SOURCE}\\s*${GRAM_SOURCE}\\s*${OF_SOURCE}\\s*(?:${definition.aliases})(?=$|[^\\p{L}])`,
    'giu',
  );

  for (const match of text.matchAll(valueFirst)) {
    const value = toPositiveNumber(match[1]);
    if (value === null) continue;

    // "a 60 g protein bar" is a food weight. "bar with 13 g protein"
    // is a nutrient fact. A following product noun needs claim context or an
    // explicit "of/de" connector before it can override nutrition.
    const suffix = text.slice((match.index ?? 0) + match[0].length).trimStart();
    const prefix = text.slice(Math.max(0, (match.index ?? 0) - 40), match.index ?? 0);
    if (
      definition.key === 'protein_g' &&
      PRODUCT_NOUN_AFTER_PROTEIN.test(suffix) &&
      !CLAIM_CONTEXT.test(prefix)
    ) {
      continue;
    }
    return value;
  }

  const nutrientFirst = new RegExp(
    `(?:${definition.aliases})\\s*(?::|=|is|has|contains?|de|del)?\\s*${NUMBER_SOURCE}\\s*${GRAM_SOURCE}(?=$|[^\\p{L}])`,
    'iu',
  );
  const match = text.match(nutrientFirst);
  return match ? toPositiveNumber(match[1]) : null;
}

function firstCalorieClaim(text: string): number | null {
  const labels = '(?:kcal|calories?|calorias?|θερμιδες)';
  const valueFirst = new RegExp(`${NUMBER_SOURCE}\\s*${labels}(?=$|[^\\p{L}])`, 'iu');
  const nutrientFirst = new RegExp(`${labels}\\s*(?::|=|is)?\\s*${NUMBER_SOURCE}(?=$|[^\\d])`, 'iu');
  const valueMatch = text.match(valueFirst);
  if (valueMatch) return toPositiveNumber(valueMatch[1]);
  const nutrientMatch = text.match(nutrientFirst);
  return nutrientMatch ? toPositiveNumber(nutrientMatch[1]) : null;
}

export function extractNutrientClaims(text: string): UserStatedNutrients {
  const normalized = normalize(text);
  const claims: UserStatedNutrients = {};

  for (const definition of NUTRIENTS) {
    const value = firstGramClaim(normalized, definition);
    if (value !== null) claims[definition.key] = value;
  }

  const calories = firstCalorieClaim(normalized);
  if (calories !== null) claims.calories = calories;
  return claims;
}

export function hasUserStatedNutrients(claims: UserStatedNutrients): boolean {
  return Object.values(claims).some(value => Number.isFinite(value) && (value ?? 0) > 0);
}

export interface NutrientCandidate {
  raw_text?: string;
  food_name?: string;
  quantity: number;
  unit: string;
  portion_explicit?: boolean;
  estimated_grams?: number;
  estimated_calories?: number;
  estimated_protein_g?: number;
  estimated_carbs_g?: number;
  estimated_fat_g?: number;
  estimation_confidence?: number;
}

export function repairNutrientClaimPortion<T extends NutrientCandidate>(
  candidate: T,
  claims: UserStatedNutrients,
): T {
  if (!MASS_UNITS.has(candidate.unit.toLowerCase().trim())) return candidate;

  const claimedGramValues = NUTRIENTS
    .map(({ key }) => claims[key])
    .filter((value): value is number => typeof value === 'number');
  const quantityCameFromClaim = claimedGramValues.some(value => Math.abs(value - candidate.quantity) < 0.01);
  if (!quantityCameFromClaim) return candidate;
  if (hasIndependentFoodMass(candidate)) return candidate;

  const productName = candidate.food_name ?? candidate.raw_text ?? '';
  return {
    ...candidate,
    quantity: 1,
    unit: COUNTABLE_PRODUCT.test(productName) ? 'piece' : 'serving',
    portion_explicit: false,
    estimated_grams: undefined,
    estimated_calories: undefined,
    estimated_protein_g: undefined,
    estimated_carbs_g: undefined,
    estimated_fat_g: undefined,
    estimation_confidence: undefined,
  };
}

export interface NutrientResult {
  grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  food_name?: string;
  name_localized?: string;
}

export function applyUserStatedNutrients<T extends NutrientResult>(
  item: T,
  claims: UserStatedNutrients,
): T & { user_stated_nutrients?: UserStatedNutrients } {
  if (!hasUserStatedNutrients(claims)) return item;

  const accepted: UserStatedNutrients = {};
  const massLimit = item.grams * 1.15;

  const macroKeys = ['protein_g', 'carbs_g', 'fat_g'] as const;
  const projectedMacros = {
    protein_g: claims.protein_g ?? item.protein_g,
    carbs_g: claims.carbs_g ?? item.carbs_g,
    fat_g: claims.fat_g ?? item.fat_g,
  };
  const macrosArePlausible = macroKeys.every(key => (
    Number.isFinite(projectedMacros[key]) &&
    projectedMacros[key] >= 0 &&
    projectedMacros[key] <= massLimit
  )) && Object.values(projectedMacros).reduce((sum, value) => sum + value, 0) <= massLimit;

  if (macrosArePlausible) {
    for (const key of macroKeys) {
      const value = claims[key];
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        accepted[key] = value;
      }
    }
  }

  for (const key of ['fiber_g', 'sugar_g'] as const) {
    const value = claims[key];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= massLimit) {
      accepted[key] = value;
    }
  }

  const claimedCalories = claims.calories;
  if (
    typeof claimedCalories === 'number' &&
    Number.isFinite(claimedCalories) &&
    claimedCalories > 0 &&
    claimedCalories <= item.grams * 9.5
  ) {
    const finalMacros = macrosArePlausible ? projectedMacros : {
      protein_g: item.protein_g,
      carbs_g: item.carbs_g,
      fat_g: item.fat_g,
    };
    const finalFiber = accepted.fiber_g ?? item.fiber_g;
    const computedCalories = finalMacros.protein_g * 4 +
      (finalMacros.carbs_g - finalFiber) * 4 +
      finalFiber * 2 +
      finalMacros.fat_g * 9;
    const isAlcoholic = ALCOHOL_NAME_PATTERN.test(`${item.food_name ?? ''} ${item.name_localized ?? ''}`);
    const divergence = computedCalories > 0
      ? Math.abs(computedCalories - claimedCalories) / claimedCalories
      : Number.POSITIVE_INFINITY;
    if (divergence <= 0.30 || (isAlcoholic && claimedCalories > computedCalories)) {
      accepted.calories = claimedCalories;
    }
  }

  if (!hasUserStatedNutrients(accepted)) return item;
  return {
    ...item,
    calories: accepted.calories ?? item.calories,
    protein_g: accepted.protein_g ?? item.protein_g,
    carbs_g: accepted.carbs_g ?? item.carbs_g,
    fat_g: accepted.fat_g ?? item.fat_g,
    fiber_g: accepted.fiber_g ?? item.fiber_g,
    sugar_g: accepted.sugar_g ?? item.sugar_g,
    user_stated_nutrients: accepted,
  };
}
