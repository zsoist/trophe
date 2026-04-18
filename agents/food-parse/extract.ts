import type { ParsedFoodItem, FoodParseOutput } from '../schemas/food-parse';

export function extractJSON(text: string): FoodParseOutput | null {
  const objectMatch = text.match(/\{[\s\S]*"items"\s*:\s*\[[\s\S]*\][\s\S]*\}/);
  if (objectMatch) {
    try {
      const parsed = JSON.parse(objectMatch[0]);
      if (Array.isArray(parsed.items)) return parsed as FoodParseOutput;
    } catch {
      // fall through
    }
  }
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed)) return { items: parsed as ParsedFoodItem[] };
    } catch {
      // fall through
    }
  }
  return null;
}
