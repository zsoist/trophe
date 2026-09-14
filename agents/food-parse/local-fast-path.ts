/**
 * Conservative, zero-provider extraction for common food entries.
 *
 * This module deliberately recognizes a small vocabulary and a small grammar.
 * The caller must still verify every candidate against the foods database
 * before returning a result. Anything uncertain returns null and falls through
 * to the full parser.
 */

export interface LocalFoodCandidate {
  rawText: string;
  foodName: string;
  nameLocalized: string;
  quantity: number;
  unit: string;
  portionExplicit: boolean;
}

interface Segment {
  text: string;
  joinedBy: 'start' | 'comma' | 'and' | 'with';
}

const COMPOUND_DISH_PATTERN =
  /\b(?:mac(?:aroni)?\s+and\s+cheese|peanut\s+butter\s+and\s+jelly|fish\s+and\s+chips|ham\s+and\s+cheese|chicken\s+and\s+waffles|rice\s+and\s+beans)\b/i;

/**
 * Conversational prefixes are not food. Keeping this list deliberately small
 * lets a natural sentence reach the same deterministic catalogue grammar while
 * still refusing free-form prose and unsupported dishes.
 */
const CONVERSATIONAL_LEAD_IN = /^(?:i\s+(?:just\s+)?(?:ate|had|have|consumed|am\s+eating)|just\s+(?:ate|had)|(?:(?:hoy|ayer|anoche|esta\s+(?:mañana|manana|tarde|noche)|en\s+(?:la\s+)?(?:mañana|manana|tarde|noche))\s+)?(?:(?:yo\s+)?me\s+|yo\s+)?(?:com[ií]|almorc[eé]|cen[eé]|desayun[eé]|beb[ií])|acabo\s+de\s+(?:comer|beber))\s+/i;

/** Branded cola size words map to the reviewed catalogue conversions. */
const COLA_SIZE_UNITS: Record<string, string> = {
  small: '355ml',
  medium: '500ml',
  large: '600ml',
  mediano: '500ml',
  mediana: '500ml',
  grande: '600ml',
  grandes: '600ml',
};

const FOOD_ALIASES = new Map<string, string>([
  ['egg', 'egg'],
  ['eggs', 'egg'],
  ['huevo', 'egg'],
  ['huevos', 'egg'],
  ['banana', 'banana'],
  ['bananas', 'banana'],
  ['apple', 'apple'],
  ['apples', 'apple'],
  ['orange', 'orange'],
  ['oranges', 'orange'],
  ['avocado', 'avocado'],
  ['avocados', 'avocado'],
  ['whole wheat toast', 'whole wheat bread'],
  ['whole-wheat toast', 'whole wheat bread'],
  ['whole wheat bread', 'whole wheat bread'],
  ['toast', 'bread'],
  ['bread', 'bread'],
  ['coffee', 'coffee brewed'],
  ['black coffee', 'coffee brewed'],
  ['brewed coffee', 'coffee brewed'],
  ['milk', 'milk whole'],
  ['whole milk', 'milk whole'],
  ['chicken breast', 'chicken breast'],
  ['grilled chicken breast', 'chicken breast'],
  ['rice', 'rice'],
  ['white rice', 'white rice'],
  ['brown rice', 'brown rice'],
  ['greek yogurt', 'greek yogurt'],
  ['yogurt', 'yogurt'],
  ['oats', 'oats'],
  ['oatmeal', 'oatmeal'],
  ['salmon', 'salmon'],
  ['tuna', 'tuna'],
  ['potato', 'potato'],
  ['potatoes', 'potato'],
  ['olive oil', 'olive oil'],
  ['peanut butter', 'peanut butter'],
  ['fries', 'french fries'],
  ['french fries', 'french fries'],
  // Common branded/restaurant and regional entries are already resolved by
  // the canonical catalogue. Keep these aliases here so a simple meal such as
  // "1 Big Mac and two cans of beer" does not spend a provider call just to
  // split two unambiguous catalogue lookups.
  ['big mac', 'big mac'],
  ['big macs', 'big mac'],
  ['beer', 'beer'],
  ['beers', 'beer'],
  ['cerveza', 'beer'],
  ['coca cola', 'coca cola'],
  ['coca-cola', 'coca cola'],
  ['coke', 'coca cola'],
  ['empanada', 'empanada'],
  ['empanadas', 'empanada'],
]);

const COUNT_WORDS = new Map<string, number>([
  ['one', 1], ['a', 1], ['an', 1], ['two', 2], ['three', 3], ['four', 4],
  ['five', 5], ['six', 6], ['seven', 7], ['eight', 8], ['nine', 9], ['ten', 10],
  ['un', 1], ['una', 1], ['uno', 1], ['dos', 2], ['tres', 3], ['cuatro', 4],
  ['cinco', 5], ['seis', 6], ['siete', 7], ['ocho', 8], ['nueve', 9], ['diez', 10],
]);

const GENERIC_COOKED_STEAK_PATTERN =
  /^(?:(?:a|one)\s+)?(?:(?:big|large)\s+(?:portion\s+of\s+)?)?(?:(?:grilled|cooked)\s+)?(?:beef\s+)?steak(?:\s+(?:big|large)(?:\s+portion)?)?(?:\s+only)?$/i;

const UNIT_ALIASES = new Map<string, string>([
  ['g', 'g'],
  ['gram', 'g'],
  ['grams', 'g'],
  ['kg', 'kg'],
  ['kilogram', 'kg'],
  ['kilograms', 'kg'],
  ['ml', 'ml'],
  ['milliliter', 'ml'],
  ['milliliters', 'ml'],
  ['millilitre', 'ml'],
  ['millilitres', 'ml'],
  ['l', 'l'],
  ['liter', 'l'],
  ['liters', 'l'],
  ['litre', 'l'],
  ['litres', 'l'],
  ['cup', 'cup'],
  ['cups', 'cup'],
  ['tbsp', 'tbsp'],
  ['tablespoon', 'tbsp'],
  ['tablespoons', 'tbsp'],
  ['tsp', 'tsp'],
  ['teaspoon', 'tsp'],
  ['teaspoons', 'tsp'],
  ['slice', 'slice'],
  ['slices', 'slice'],
  ['piece', 'piece'],
  ['pieces', 'piece'],
  ['can', 'can'],
  ['cans', 'can'],
  ['lata', 'can'],
  ['latas', 'can'],
]);

const UNIT_PATTERN =
  /^(g|grams?|kg|kilograms?|ml|millilit(?:er|re)s?|l|lit(?:er|re)s?|cups?|tbsp|tablespoons?|tsp|teaspoons?|slices?|pieces?|cans?|latas?)\b/i;

function splitSegments(text: string): Segment[] {
  const separator = /\s*(,|;)\s*|\s+(and|with|y|con)\s+/gi;
  const segments: Segment[] = [];
  let cursor = 0;
  let joinedBy: Segment['joinedBy'] = 'start';

  for (const match of text.matchAll(separator)) {
    const index = match.index ?? cursor;
    const value = text.slice(cursor, index).trim();
    if (value) segments.push({ text: value, joinedBy });
    joinedBy = match[2]?.toLowerCase() === 'with' || match[2]?.toLowerCase() === 'con'
      ? 'with'
      : match[2]?.toLowerCase() === 'and'
        ? 'and'
        : 'comma';
    cursor = index + match[0].length;
  }

  const tail = text.slice(cursor).trim();
  if (tail) segments.push({ text: tail, joinedBy });
  return segments;
}

function parseQuantity(token: string): number | null {
  const word = COUNT_WORDS.get(token.toLowerCase());
  if (word !== undefined) return word;
  if (token.includes('/')) {
    const [numerator, denominator] = token.split('/').map(Number);
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
      return null;
    }
    return numerator / denominator;
  }
  const quantity = Number(token);
  return Number.isFinite(quantity) ? quantity : null;
}

function parseSegment(segment: Segment): LocalFoodCandidate | null {
  const rawText = segment.text.trim();
  let remainder = rawText
    .toLowerCase()
    .replace(/[.!?]+$/g, '')
    .trim();

  remainder = remainder.replace(CONVERSATIONAL_LEAD_IN, '').trim();

  const quantityMatch = remainder.match(new RegExp(`^(${[...COUNT_WORDS.keys()].sort((a, b) => b.length - a.length).join('|')}|\\d+(?:\\.\\d+)?|\\d+\\/\\d+)(?:\\s+|(?=[a-z]))`, 'i'));
  const quantityWasExplicit = quantityMatch !== null;
  let quantity = quantityMatch ? parseQuantity(quantityMatch[1]) : 1;
  if (quantity === null || quantity <= 0 || quantity > 10_000) return null;
  if (quantityMatch) remainder = remainder.slice(quantityMatch[0].length);

  const unitMatch = remainder.match(UNIT_PATTERN);
  let unit = quantityWasExplicit ? 'piece' : 'serving';
  if (unitMatch) {
    unit = UNIT_ALIASES.get(unitMatch[1].toLowerCase()) ?? '';
    if (!unit) return null;
    remainder = remainder.slice(unitMatch[0].length).trim();
  }

  remainder = remainder
    .replace(/^(?:of\s+|a\s+|an\s+|the\s+|some\s+)/, '')
    .trim();

  let sizeUnit: string | null = null;
  // Recognize only sizes attached to a known cola alias. This avoids turning
  // an arbitrary adjective into a measured serving for unrelated foods.
  const sizeMatch = remainder.match(/^(?:(small|medium|large|mediano|mediana|grande|grandes)\s+)?(.+?)(?:\s+(small|medium|large|mediano|mediana|grande|grandes))?$/i);
  if (sizeMatch) {
    const size = sizeMatch[1] ?? sizeMatch[3];
    const base = sizeMatch[2]?.trim() ?? '';
    const alias = FOOD_ALIASES.get(base);
    if (size && alias === 'coca cola') {
      remainder = base;
      sizeUnit = COLA_SIZE_UNITS[size.toLowerCase()] ?? null;
    }
  }
  const genericCookedSteak = GENERIC_COOKED_STEAK_PATTERN.test(remainder);
  const foodName = genericCookedSteak
    ? 'beef steak grilled'
    : FOOD_ALIASES.get(remainder);
  if (!foodName) return null;

  // A steak is a countable whole item, not a universal 100 g "serving".
  // `lookupFood` resolves the evidence-backed 200 g common piece weight in
  // production. Exact metric input ("100 g steak") remains untouched.
  if (genericCookedSteak && !unitMatch) unit = 'piece';

  // "coffee with milk" needs a modest, reviewable splash rather than a full
  // 240 ml serving. It remains implicit and therefore receives a range and a
  // clarification warning in the result.
  if (!quantityWasExplicit && segment.joinedBy === 'with' && foodName === 'milk whole') {
    quantity = 30;
    unit = 'ml';
  }
  if (sizeUnit) unit = sizeUnit;

  return {
    rawText,
    foodName,
    nameLocalized: remainder,
    quantity,
    unit,
    // A numeric piece count (for example, "1 steak") is explicit, but the
    // piece-to-gram mass is still estimated. Only an explicit unit makes the
    // portion mass exact enough to suppress the review range/clarification.
    portionExplicit: Boolean(sizeUnit) || (quantityWasExplicit && (!genericCookedSteak || unitMatch !== null)),
  };
}

export function extractLocalFoodCandidates(text: string): LocalFoodCandidate[] | null {
  const normalized = text.trim();
  if (!normalized || normalized.length > 500 || COMPOUND_DISH_PATTERN.test(normalized)) {
    return null;
  }

  const segments = splitSegments(normalized);
  if (segments.length === 0 || segments.length > 10) return null;

  const candidates = segments.map(parseSegment);
  return candidates.every((candidate): candidate is LocalFoodCandidate => candidate !== null)
    ? candidates
    : null;
}
