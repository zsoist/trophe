import { FOOD_DATABASE } from '@/lib/food-units';
import type { ParsedFoodItem } from '../schemas/food-parse';

export function enrichWithLocalDB(items: ParsedFoodItem[]): ParsedFoodItem[] {
  return items.map((item) => {
    const nameLower = item.food_name.toLowerCase();

    const match = FOOD_DATABASE.find((f) => {
      const names = [f.name_en, f.name_el, f.name_es].map((n) => n.toLowerCase());
      return names.some(
        (n) => n.includes(nameLower) || nameLower.includes(n.split(',')[0].trim()),
      );
    });

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
