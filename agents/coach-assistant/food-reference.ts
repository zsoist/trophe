import { z } from 'zod';
export const foodReferenceSchema = z.object({
  name: z.string().min(1).max(200), source: z.string().min(1).max(80),
  grams: z.literal(100), calories: z.number().finite().min(0).max(1000),
  proteinG: z.number().finite().min(0).max(100), quality: z.string().max(80),
}).strict();
export type FoodReference = z.infer<typeof foodReferenceSchema>;
export type FoodReferenceLookup = (name: string, userText: string, signal: AbortSignal) => Promise<FoodReference | null>;
/** Uses the existing food retrieval path, with no embedding or external search.
 * Returned preparation/name remains explicit; a match is an option, not intake. */
export const lookupFoodReference: FoodReferenceLookup = async (name, userText, signal) => {
  signal.throwIfAborted();
  const { lookupFood } = await import('@/agents/food-parse/lookup');
  const result = await lookupFood({ foodName: name, unit: 'g', intentText: userText });
  signal.throwIfAborted();
  if (!result) return null;
  const parsed = foodReferenceSchema.safeParse({ name: result.food.nameEn, source: result.food.source,
    grams: 100, calories: result.food.kcalPer100g, proteinG: result.food.proteinPer100g, quality: result.food.dataQuality });
  return parsed.success ? parsed.data : null;
};
export function renderFoodReferences(raw: unknown, spanish: boolean, userText = ''): string {
  const parsed = z.object({ options: z.array(foodReferenceSchema).max(2) }).strict().safeParse(raw);
  if (!parsed.success) return '';
  if (!parsed.data.options.length) return spanish ? 'No encontré una referencia alimentaria compatible en el catálogo.' : 'No matching food reference was found in the catalogue.';
  const quantities=[...userText.matchAll(/\b(\d+(?:[.,]\d+)?)\s*(?:g|grams|gramos)\b/gi)];
  const grams=quantities.length===1&&parsed.data.options.length===1?Number(quantities[0][1].replace(',','.')):100;
  const portion=Number.isFinite(grams)&&grams>=.1&&grams<=10000?grams:100;
  const round=(n:number)=>Math.round(n*portion/100*10)/10;
  return (spanish ? 'Referencias del catálogo, por 100 g (no son registros de consumo):' : 'Catalogue references, per 100 g (not logged intake):')
    + '\n' + parsed.data.options.map(item => `- **${item.name}**: ${item.calories} kcal · ${item.proteinG} g ${spanish ? 'proteína' : 'protein'} (${item.source}; ${item.quality}).`).join('\n')
    + (portion!==100 ? '\n'+(spanish?`Para los ${portion} g que indicas: `:`For the ${portion} g you stated: `)+`${round(parsed.data.options[0].calories)} kcal · ${round(parsed.data.options[0].proteinG)} g ${spanish?'proteína':'protein'}.` : '')
    + '\n' + (spanish ? 'Confirma que la preparación coincide e indica tu porción para calcularla.' : 'Check that the preparation matches and specify your portion to calculate it.');
}
