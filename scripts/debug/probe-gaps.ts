import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
async function main() {
  const { lookupFood } = await import('../../agents/food-parse/lookup');
  const names = ['croque-monsieur', 'bouillabaisse', 'pastilla', 'kouign-amann', 'eclair au chocolat', 'tarte aux pommes', 'blanquette de veau', 'chilaquiles verdes', 'ajiaco', 'tamale', 'papas chorreadas', 'arroz atollado', 'pad thai', 'churros', 'tabbouleh', 'croissant', 'pain au chocolat', 'paella'];
  for (const foodName of names) {
    try {
      const r = await lookupFood({ foodName, unit: 'g' });
      console.log(foodName.padEnd(20), '→', r ? `${r.food.nameEn} [${r.food.source}] fat=${r.food.fatPer100g}` : 'MISS');
    } catch (e) { console.log(foodName.padEnd(20), 'ERR', (e as Error).message.slice(0, 80)); }
  }
  process.exit(0);
}
main();
