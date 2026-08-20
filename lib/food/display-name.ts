import type { ParsedFoodItem } from '@/agents/schemas/food-parse';

type DisplayNameInput = Pick<ParsedFoodItem, 'food_name' | 'raw_text' | 'name_localized'>;

export function selectFoodDisplayName(item: DisplayNameInput): string {
  for (const candidate of [item.food_name, item.raw_text, item.name_localized]) {
    const normalized = candidate.trim();
    if (normalized) return normalized;
  }
  return 'Food';
}
