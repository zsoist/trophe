import { FOOD_DATABASE } from '@/lib/food/food-units';
import type { ParsedFoodItem } from '../schemas/food-parse';

function tokens(value: string): string[] {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function tokenMatches(left: string, right: string): boolean {
  if (left === right) return true;
  // Preserve the common fallback behavior for a simple English plural without
  // allowing a token to match inside an unrelated longer token.
  if (left.length > 3 && left.endsWith('s') && left.slice(0, -1) === right) return true;
  return right.length > 3 && right.endsWith('s') && right.slice(0, -1) === left;
}

function containsPhrase(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let start = 0; start <= haystack.length - needle.length; start++) {
    if (needle.every((token, offset) => tokenMatches(haystack[start + offset], token))) {
      return true;
    }
  }
  return false;
}

function phraseScore(itemTokens: string[], candidateTokens: string[]): number {
  if (!containsPhrase(itemTokens, candidateTokens) &&
      !containsPhrase(candidateTokens, itemTokens)) {
    return 0;
  }
  const specificity = candidateTokens.join('').length;
  if (itemTokens.length === candidateTokens.length) {
    return 30_000 + candidateTokens.length * 100 + specificity;
  }
  if (containsPhrase(itemTokens, candidateTokens)) {
    return 20_000 + candidateTokens.length * 100 + specificity;
  }
  return 10_000 + itemTokens.length * 100 + specificity;
}

function findBestMatch(foodName: string) {
  const itemTokens = tokens(foodName);
  if (itemTokens.length === 0) return undefined;

  let best: (typeof FOOD_DATABASE)[number] | undefined;
  let bestScore = 0;
  for (const food of FOOD_DATABASE) {
    const aliases = [food.name_en, food.name_el, food.name_es]
      .flatMap((name) => [name, name.split(',')[0]])
      .map(tokens);
    const score = Math.max(...aliases.map((alias) => phraseScore(itemTokens, alias)));
    if (score > bestScore) {
      best = food;
      bestScore = score;
    }
  }
  return best;
}

export function enrichWithLocalDB(items: ParsedFoodItem[]): ParsedFoodItem[] {
  return items.map((item) => {
    const match = findBestMatch(item.food_name);

    if (!match) return item;

    const grams = item.grams;
    const factor = grams / 100;

    return {
      ...item,
      calories: Math.round(match.calories_per_100g * factor),
      protein_g: Math.round(match.protein_per_100g * factor * 10) / 10,
      carbs_g: Math.round(match.carbs_per_100g * factor * 10) / 10,
      fat_g: Math.round(match.fat_per_100g * factor * 10) / 10,
      fiber_g: Math.round(match.fiber_per_100g * factor * 10) / 10,
      sugar_g: item.sugar_g ?? 0,
      source: item.source,
      confidence: item.confidence,
    };
  });
}
