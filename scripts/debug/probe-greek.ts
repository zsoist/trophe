import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
async function main() {
  const { lookupFood } = await import('../../agents/food-parse/lookup');
  const names = ['fava','greek fava','fava puree','gigantes','gyros pork','souvlaki chicken skewer','spanakopita','loukoumades','tiropita','kolokithokeftedes','revithia soup','imam baildi'];
  for (const foodName of names) {
    try {
      const r = await lookupFood({ foodName, unit: 'serving', region: 'GR' });
      console.log(foodName.padEnd(22), '→', r ? `${r.food.nameEn} [${r.food.source}] ${r.food.kcalPer100g}kcal/${r.food.fatPer100g}F /100g, serv=${r.food.defaultServingGrams}g` : 'MISS');
    } catch (e) { console.log(foodName.padEnd(22), 'ERR', (e as Error).message.slice(0,60)); }
  }
  process.exit(0);
}
main();
