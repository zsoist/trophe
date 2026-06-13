import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
async function main() {
  const { lookupFood } = await import('../../agents/food-parse/lookup');
  const names = ['black beans', 'tzatziki', 'guacamole', 'greek salad', 'falafel', 'kalamata olives', 'carne asada', 'mashed potatoes', 'apple pie', 'croque-monsieur'];
  for (const foodName of names) {
    try {
      const r = await lookupFood({ foodName, unit: 'g' });
      console.log(foodName.padEnd(18), '→', r ? `${r.food.nameEn} [${r.food.source}] fat/100g=${r.food.fatPer100g}` : 'MISS');
    } catch (e) { console.log(foodName.padEnd(18), 'ERR', (e as Error).message.slice(0, 100)); }
  }
  process.exit(0);
}
main();
