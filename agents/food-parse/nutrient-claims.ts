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
const PRODUCT_NOUN_AFTER_PROTEIN = /^(?:bar|shake|powder|cookie|snack|drink)\b/i;
const CLAIM_CONTEXT = /\b(?:with|has|have|contains?|provides?|con|contiene|avec|contient|με|εχει)\b/i;

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
    const explicitConnector = /\b(?:of|de|del)\b/.test(match[0]);
    if (
      definition.key === 'protein_g' &&
      PRODUCT_NOUN_AFTER_PROTEIN.test(suffix) &&
      !explicitConnector &&
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
}

export function applyUserStatedNutrients<T extends NutrientResult>(
  item: T,
  claims: UserStatedNutrients,
): T & { user_stated_nutrients?: UserStatedNutrients } {
  if (!hasUserStatedNutrients(claims)) return item;
  return {
    ...item,
    calories: claims.calories ?? item.calories,
    protein_g: claims.protein_g ?? item.protein_g,
    carbs_g: claims.carbs_g ?? item.carbs_g,
    fat_g: claims.fat_g ?? item.fat_g,
    fiber_g: claims.fiber_g ?? item.fiber_g,
    sugar_g: claims.sugar_g ?? item.sugar_g,
    user_stated_nutrients: { ...claims },
  };
}
