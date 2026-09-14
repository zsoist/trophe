import { z } from 'zod';
import { foodReferenceEvidenceSchema } from './food-reference-evidence';
import { safeSourceUrl } from '@/lib/food/nutrition-search-transport';
import { nativeFoodReferenceSchema } from './food-reference-native-fallback';

/** Native Food owns values and portion provenance; this layer only formats them. */
export function renderNativeFoodReference(raw: unknown, spanish: boolean): string | null {
  if (!raw || typeof raw !== 'object' || !('native' in raw)) return null;
  const native = raw.native;
  const unavailable = spanish ? 'No pude calcular esta referencia. No se registró ningún alimento.' : 'I could not calculate this reference. No food was logged.';
  if (!native || typeof native !== 'object' || !('ok' in native) || native.ok !== true) return unavailable;
  if (!('outcome' in native)) return unavailable;
  const evidence = 'referenceEvidence' in raw ? foodReferenceEvidenceSchema.safeParse(raw.referenceEvidence) : null;
  const links = evidence?.success ? [...new Set(evidence.data.flatMap(item => item.sources.map(source => safeSourceUrl(source.url)).filter((url): url is string => !!url)))].slice(0, 3).map(url => `[${new URL(url).hostname}](${url.replaceAll(')', '%29')})`) : [];
  const sources = links.length ? `\n\n${spanish ? 'Fuentes de apoyo' : 'Supporting sources'}: ${links.join(', ')}.` : '';
  if (native.outcome === 'clarification_required') {
    const question = 'question' in native && typeof native.question === 'string' && native.question.trim()
      ? native.question : spanish ? 'Indica el alimento, su preparación y la cantidad para calcular la referencia.' : 'Specify the food, preparation and amount to calculate the reference.';
    return `${question}${sources}`;
  }
  if (native.outcome === 'preparation_mismatch') return spanish
    ? 'La preparación encontrada no coincide con la solicitada. Confirma cómo está preparado el alimento; no se registró nada.'
    : 'The matched preparation differs from your request. Confirm how the food is prepared; nothing was logged.';
  if (native.outcome === 'no_match') return spanish ? 'No encontré una referencia para ese alimento. No se registró nada.' : 'I found no reference for that food. Nothing was logged.';
  if (native.outcome !== 'reference' || !('references' in native)) return unavailable;
  const parsed = z.array(nativeFoodReferenceSchema).min(1).max(12).safeParse(native.references);
  if (!parsed.success) return unavailable;
  const number = (value: number) => new Intl.NumberFormat(spanish ? 'es' : 'en', { maximumFractionDigits: 1 }).format(value);
  const rows = parsed.data.map(ref => {
    const n = ref.nutrients;
    const qualifier = ref.estimate ? spanish ? 'Estimación' : 'Estimate' : spanish ? 'Referencia de Food' : 'Food reference';
    const portion = `${number(ref.portion.grams)} g${ref.portionBasis === 'model_estimate' ? spanish ? ' aprox.' : ' approx.' : ''}`;
    return `**${ref.name}** — ${portion}: **${number(n.kcal)} kcal**, ${number(n.proteinG)} g ${spanish ? 'proteína' : 'protein'}, ${number(n.carbsG)} g ${spanish ? 'carbohidratos' : 'carbs'}, ${number(n.fatG)} g ${spanish ? 'grasa' : 'fat'}. ${qualifier}.`;
  });
  const marketNote = 'unverifiedMarkets' in raw && Array.isArray(raw.unverifiedMarkets) && raw.unverifiedMarkets.length ? spanish ? 'Referencia genérica; no se verificó una etiqueta del país solicitado. Las fuentes no acreditan ese mercado.' : 'Generic reference; a label for the requested country was not verified. Sources do not establish that market.' : '';
  return `${marketNote ? `${marketNote}\n\n` : ''}${rows.join('\n\n')}\n\n${spanish ? 'No registrado. ¿Quieres registrarlo?' : 'Not logged. Would you like to log it?'}${sources}`;
}
