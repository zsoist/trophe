/** Literal query hints only: a language is not evidence of a food's market. */
const BRANDS = /\b(?:big\s+macs?|whoppers?|mcdonald(?:['’]s|s)?|burger\s+king|coca[ -]?cola|pepsi|red\s+bull|starbucks|dunkin|subway|wendy['’]?s|chipotle|kfc|taco\s+bell|quest|tropicana)\b/i;
const MARKETS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bColombia\b/i, 'CO'], [/\b(?:United States|Estados Unidos|USA)\b/i, 'US'],
  [/\bM[eé]xico\b/i, 'MX'], [/\b(?:Espa[ñn]a|Spain)\b/i, 'ES'],
  [/\b(?:Greece|Grecia)\b/i, 'GR'], [/\b(?:United Kingdom|Reino Unido)\b/i, 'GB'],
  [/\bCanad[aá]\b/i, 'CA'], [/\bArgentina\b/i, 'AR'], [/\bChile\b/i, 'CL'], [/\bBra[sz]il\b/i, 'BR'],
];
export function requestedFoodMarkets(text: string): string[] {
  return MARKETS.filter(([pattern]) => pattern.test(text)).map(([, region]) => region);
}
export function foodReferenceSearchIntent(product: string, text: string, language: string) {
  const literalBrand = product.match(BRANDS)?.[0] ?? null;
  const brand = literalBrand && text.toLowerCase().includes(literalBrand.toLowerCase()) ? literalBrand : null;
  const markets = requestedFoodMarkets(text);
  // Multiple named markets need clarification, never an arbitrary first country.
  if (markets.length > 1) return null;
  const wantsSources = /\b(?:online|internet|search|look\s+up|busca(?:r)?|verifica(?:r)?|etiqueta|label)\b/i.test(text);
  if (!brand && !markets.length && !wantsSources) return null;
  const lang = language.split('-')[0];
  return { product, brand, locale: markets.length ? `${lang}-${markets[0]}` : lang };
}
