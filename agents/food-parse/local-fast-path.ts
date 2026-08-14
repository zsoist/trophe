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

const FOOD_ALIASES = new Map<string, string>([
  ['egg', 'egg'],
  ['eggs', 'egg'],
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
]);

const UNIT_PATTERN =
  /^(g|grams?|kg|kilograms?|ml|millilit(?:er|re)s?|l|lit(?:er|re)s?|cups?|tbsp|tablespoons?|tsp|teaspoons?|slices?|pieces?)\b/i;

function splitSegments(text: string): Segment[] {
  const separator = /\s*(,|;)\s*|\s+(and|with)\s+/gi;
  const segments: Segment[] = [];
  let cursor = 0;
  let joinedBy: Segment['joinedBy'] = 'start';

  for (const match of text.matchAll(separator)) {
    const index = match.index ?? cursor;
    const value = text.slice(cursor, index).trim();
    if (value) segments.push({ text: value, joinedBy });
    joinedBy = match[2]?.toLowerCase() === 'with'
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

  const quantityMatch = remainder.match(/^(\d+(?:\.\d+)?|\d+\/\d+)\s*/);
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

  return {
    rawText,
    foodName,
    nameLocalized: remainder,
    quantity,
    unit,
    // A numeric piece count (for example, "1 steak") is explicit, but the
    // piece-to-gram mass is still estimated. Only an explicit unit makes the
    // portion mass exact enough to suppress the review range/clarification.
    portionExplicit: quantityWasExplicit && (!genericCookedSteak || unitMatch !== null),
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
