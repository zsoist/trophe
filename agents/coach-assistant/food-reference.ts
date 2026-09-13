import { z } from 'zod';

/** One catalogue reference option, always normalised to per-100 g with explicit
 * provenance. A match is an option, never a logged intake. */
export const foodReferenceSchema = z.object({
  /** Deterministic catalogue identity (name + source + preparation). Used only to
   * bind a portion-only follow-up to the same validated food, never model input. */
  referenceId: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  /** Real catalogue brand, when the row has one. Lets Ask surface the same
   * branded identity Food resolved instead of a bare English name. Null for
   * generic/unbranded rows; never synthesised from the model's wording. */
  brand: z.string().max(120).nullable().optional(),
  /** Canonical foods.id when the resolver returned one — the shared identifier
   * Food writes to food_log.food_id. Absent when the resolver has no row id. */
  catalogueId: z.string().min(1).max(200).optional(),
  source: z.string().min(1).max(80),
  quality: z.string().min(1).max(80),
  preparation: z.string().min(1).max(120).nullable(),
  kcalPer100g: z.number().finite().min(0).max(1000),
  proteinPer100g: z.number().finite().min(0).max(100),
  /** Validated food_unit_conversions rows for units the user actually mentioned
   * in the latest message. Empty when no validated conversion exists; the
   * renderer then asks for grams instead of inventing one. */
  conversions: z.array(z.object({
    unit: z.string().min(1).max(20),
    gramsPerUnit: z.number().finite().gt(0).max(10_000),
    /** Real food_unit_conversions row id. Present only for a persisted row; a
     * portion is never scaled from a fabricated conversion. */
    conversionId: z.string().min(1).max(200).optional(),
  }).strict()).max(4),
}).strict();
export type FoodReference = z.infer<typeof foodReferenceSchema>;
export type FoodReferenceLookup = (name: string, userText: string, signal: AbortSignal) => Promise<FoodReference | null>;

/** Structural subset of agents/food-parse/lookup.ts lookupFood we depend on. */
interface FoodReferenceRow {
  food: {
    id?: string | null;
    nameEn?: string | null;
    brand?: string | null;
    source?: string | null;
    dataQuality?: string | null;
    kcalPer100g?: number | null;
    proteinPer100g?: number | null;
  };
  conversionId: string | null;
  gramsPerUnit: number;
}
export type FoodReferenceResolver = (
  input: { foodName: string; unit: string; intentText?: string },
) => Promise<FoodReferenceRow | null>;

const PREPARATION_TERMS = [
  'hard-boiled', 'soft-boiled', 'boiled', 'scrambled', 'poached', 'fried', 'grilled',
  'roasted', 'baked', 'steamed', 'smoked', 'cured', 'canned', 'dried', 'frozen',
  'cooked', 'raw',
] as const;

/** Surface forms → canonical English preparation term. Spanish is the primary
 * user language, so a Spanish state word ("crudo", "cocido", …) must surface the
 * preparation conflict instead of silently binding the English catalogue match. */
const PREPARATION_ALIAS_LIST: ReadonlyArray<readonly [surface: string, term: string]> = [
  ...PREPARATION_TERMS.map(term => [term, term] as const),
  ['crudo', 'raw'], ['cruda', 'raw'], ['crudos', 'raw'], ['crudas', 'raw'],
  ['cocido', 'cooked'], ['cocida', 'cooked'], ['cocidos', 'cooked'], ['cocidas', 'cooked'],
  ['hervido', 'boiled'], ['hervida', 'boiled'], ['hervidos', 'boiled'], ['hervidas', 'boiled'],
  ['frito', 'fried'], ['frita', 'fried'], ['fritos', 'fried'], ['fritas', 'fried'],
  ['asado', 'roasted'], ['asada', 'roasted'], ['asados', 'roasted'], ['asadas', 'roasted'],
  ['a la parrilla', 'grilled'], ['horneado', 'baked'], ['horneada', 'baked'],
  ['al vapor', 'steamed'], ['revuelto', 'scrambled'], ['revuelta', 'scrambled'],
  ['escalfado', 'poached'], ['escalfada', 'poached'], ['ahumado', 'smoked'], ['ahumada', 'smoked'],
  ['enlatado', 'canned'], ['enlatada', 'canned'], ['congelado', 'frozen'], ['congelada', 'frozen'],
  ['seco', 'dried'], ['seca', 'dried'],
];
/** Longest surface first so "hard-boiled" wins over "boiled". */
const PREPARATION_ALIASES = [...PREPARATION_ALIAS_LIST].sort((a, b) => b[0].length - a[0].length);

/** Preparation/state stated by a catalogue name or the user text, as both the
 * canonical term (for comparison) and the exact surface form (for the reply). */
function matchPreparation(text: string): { term: string; surface: string } | null {
  const lower = text.toLowerCase();
  for (const [surface, term] of PREPARATION_ALIASES) {
    if (new RegExp(`\\b${escapeRegex(surface)}\\b`).test(lower)) return { term, surface };
  }
  return null;
}

/** Explicit preparation/state stated by a catalogue name or the user text. */
export function extractPreparation(text: string): string | null {
  return matchPreparation(text)?.term ?? null;
}

function makeReferenceId(name: string, source: string, preparation: string | null): string {
  return [name, source, preparation ?? '']
    .map(part => part.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim())
    .join('|');
}

const MASS_UNITS: Record<string, number> = {
  g: 1, gr: 1, gram: 1, grams: 1, gramo: 1, gramos: 1,
  kg: 1000, kilo: 1000, kilos: 1000, kilogram: 1000, kilograms: 1000,
};

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

const CANONICAL_UNITS: Record<string, string> = {
  cup: 'cup', cups: 'cup', taza: 'cup', tazas: 'cup',
  tbsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp', cucharada: 'tbsp', cucharadas: 'tbsp',
  tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp', cucharadita: 'tsp', cucharaditas: 'tsp',
  ml: 'ml', milliliter: 'ml', milliliters: 'ml',
  egg: 'piece', eggs: 'piece', huevo: 'piece', huevos: 'piece',
  piece: 'piece', pieces: 'piece', unidad: 'piece', unidades: 'piece',
  slice: 'slice', slices: 'slice', rebanada: 'slice', rebanadas: 'slice', loncha: 'slice', lonchas: 'slice',
  serving: 'serving', servings: 'serving', portion: 'serving', portions: 'serving', porcion: 'serving', porciones: 'serving',
  scoop: 'scoop', scoops: 'scoop',
  glass: 'glass', glasses: 'glass', vaso: 'glass', vasos: 'glass',
  bowl: 'bowl', bowls: 'bowl',
  handful: 'handful',
  can: 'can', cans: 'can', lata: 'can', latas: 'can',
  oz: 'oz', ounce: 'oz', ounces: 'oz',
};

const ALL_UNIT_WORDS = [...Object.keys(MASS_UNITS), ...Object.keys(CANONICAL_UNITS)]
  .sort((a, b) => b.length - a.length)
  .map(escapeRegex)
  .join('|');

/** Complete numeric token: mixed number, fraction, decimal (dot/comma) or
 * leading decimal. The look-behind rejects any partial match inside a longer
 * numeric/word token so "-150 g" is never read as "150 g" and "1/2 cup" never
 * as "2 cups". */
const AMOUNT_TOKEN = String.raw`[+-]?(?:\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?|\.\d+)`;
const PORTION_RE = new RegExp(
  String.raw`(?<![0-9A-Za-z.,/\-+])(${AMOUNT_TOKEN})\s*(${ALL_UNIT_WORDS})\b`,
  'gi',
);

/** A numeric amount as typed, or null when it is not a complete valid number. */
function parseAmountToken(token: string): { value: number; ambiguousSeparator: boolean } | null {
  const compact = token.replace(/\s+/g, ' ').trim();
  const fraction = /^([+-]?)(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)$/.exec(compact);
  if (fraction) {
    const sign = fraction[1] === '-' ? -1 : 1;
    const whole = fraction[2] ? Number(fraction[2]) : 0;
    const numerator = Number(fraction[3]);
    const denominator = Number(fraction[4]);
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
    return { value: sign * (whole + numerator / denominator), ambiguousSeparator: false };
  }
  const decimal = /^([+-]?)(\d*)([.,]?)(\d*)$/.exec(compact);
  if (!decimal) return null;
  const sign = decimal[1] === '-' ? -1 : 1;
  const integer = decimal[2];
  const separator = decimal[3];
  const fractionDigits = decimal[4];
  if (!integer && !fractionDigits) return null;
  if (separator && !fractionDigits) return null;
  // A separator followed by exactly three digits is a genuine thousands/decimal
  // locale ambiguity ("1,500" / "1.500"); refuse to guess.
  const ambiguousSeparator = Boolean(separator) && Boolean(integer) && fractionDigits.length === 3;
  const normalized = `${integer}${separator ? '.' : ''}${fractionDigits}`;
  const value = sign * Number(normalized || '0');
  if (!Number.isFinite(value)) return null;
  return { value, ambiguousSeparator };
}

interface PortionSyntaxIssue {
  kind: 'invalid_quantity' | 'ambiguous_syntax';
  /** Offending text as typed, for an honest clarification. */
  detail: string;
  index: number;
}

/** A digit run separated from the amount only by whitespace ("2 200 g") is not
 * a suffix we may silently drop. */
function precededByBareNumber(text: string, index: number): boolean {
  let cursor = index - 1;
  while (cursor >= 0 && /\s/.test(text[cursor])) cursor -= 1;
  return cursor >= 0 && /[0-9]/.test(text[cursor]);
}

export interface ParsedPortion {
  /** Numeric amount as typed (e.g. 150, 1, 0.5). */
  value: number;
  /** Canonical unit name ('g', 'cup', 'piece', ...). */
  unit: string;
  /** 'mass' portions are measured directly; others need a validated conversion. */
  kind: 'mass' | 'conversion';
  /** Grams for mass portions; null when a conversion is required. */
  grams: number | null;
  /** Human label, e.g. '150 g' or '1 cup'. */
  label: string;
  /** Character index of the amount in the source text (for deterministic binding). */
  index: number;
}

/** Deterministic scan of every explicit amount+unit the user typed, plus the
 * tokens that look like an amount but cannot be scaled honestly. No model input. */
function scanFoodPortions(text: string): { portions: ParsedPortion[]; issues: PortionSyntaxIssue[] } {
  const portions: ParsedPortion[] = [];
  const issues: PortionSyntaxIssue[] = [];
  for (const match of text.matchAll(PORTION_RE)) {
    const index = match.index ?? 0;
    const rawAmount = match[1];
    const rawUnit = match[2].toLowerCase();
    if (precededByBareNumber(text, index)) {
      issues.push({ kind: 'ambiguous_syntax', detail: match[0], index });
      continue;
    }
    const parsed = parseAmountToken(rawAmount);
    if (!parsed || parsed.ambiguousSeparator) {
      issues.push({ kind: parsed && parsed.ambiguousSeparator ? 'ambiguous_syntax' : 'invalid_quantity', detail: match[0], index });
      continue;
    }
    const { value } = parsed;
    if (!Number.isFinite(value) || value <= 0) {
      issues.push({ kind: 'invalid_quantity', detail: match[0], index });
      continue;
    }
    const massFactor = MASS_UNITS[rawUnit];
    if (massFactor !== undefined) {
      const grams = value * massFactor;
      if (!Number.isFinite(grams) || grams < 0.1 || grams > 10_000) {
        issues.push({ kind: 'invalid_quantity', detail: match[0], index });
        continue;
      }
      portions.push({ value, unit: massFactor === 1000 ? 'kg' : 'g', kind: 'mass', grams, label: `${formatNumber(grams)} g`, index });
      continue;
    }
    const unit = CANONICAL_UNITS[rawUnit];
    if (!unit) continue;
    portions.push({ value, unit, kind: 'conversion', grams: null, label: `${formatNumber(value)} ${unit}`, index });
  }
  return { portions, issues };
}

/** Every explicit amount+unit the user typed. Deterministic; no model input. */
export function parseFoodPortions(text: string): ParsedPortion[] {
  return scanFoodPortions(text).portions;
}

/** Character positions where a meaningful token of `name` appears in `text`. */
export function mentionPositions(name: string, text: string): number[] {
  const tokens = [...new Set(
    name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9]+/).filter(token => token.length >= 3),
  )];
  const positions = new Set<number>();
  for (const token of tokens) {
    const matches = text.matchAll(new RegExp(`\\b${escapeRegex(token)}\\b`, 'gi'));
    for (const match of matches) positions.add(match.index ?? 0);
  }
  return [...positions].sort((a, b) => a - b);
}

/** Clause boundaries so "200 g rice and 150 g chicken" binds each amount to the
 * food named in its own clause instead of guessing from raw distance. */
const CLAUSE_SEPARATOR_RE = /[,;&+]|\b(?:and|y|con|with|plus|mas|más)\b/gi;

function clauseRange(text: string, index: number): [number, number] {
  let start = 0;
  let end = text.length;
  for (const separator of text.matchAll(CLAUSE_SEPARATOR_RE)) {
    const position = separator.index ?? 0;
    if (position <= index && position >= start) start = position + separator[0].length;
    else if (position > index) { end = position; break; }
  }
  return [start, end];
}

export type PortionIssue = 'ambiguous_portion' | 'missing_conversion' | 'needs_preparation' | 'ambiguous_syntax' | 'invalid_quantity';

/** Same inclusive gram window enforced for parsed masses and converted portions. */
const MIN_PORTION_GRAMS = 0.1;
const MAX_PORTION_GRAMS = 10_000;

export interface ReferenceResolution {
  option: FoodReference;
  grams: number | null;
  basis: 'measured_mass' | 'validated_conversion' | null;
  label: string | null;
  issue: PortionIssue | null;
  /** Offending unit or preparation term, for an honest clarification. */
  issueDetail: string | null;
}

/** Binds the user's explicit portions to catalogue options. It only scales a
 * portion when the binding is unambiguous (one option/one portion, or a
 * one-to-one nearest match); otherwise it records a clarification issue and
 * never attributes an amount to the wrong food. */
export function resolveFoodReferences(options: readonly FoodReference[], userText: string): ReferenceResolution[] {
  const { portions, issues } = scanFoodPortions(userText);
  const userPreparation = matchPreparation(userText);
  const resolutions: ReferenceResolution[] = options.map(option => ({
    option, grams: null, basis: null, label: null, issue: null, issueDetail: null,
  }));

  const assign = (resolution: ReferenceResolution, portion: ParsedPortion): void => {
    if (userPreparation && userPreparation.term !== resolution.option.preparation) {
      resolution.issue = 'needs_preparation';
      resolution.issueDetail = userPreparation.surface;
      return;
    }
    if (portion.kind === 'mass' && portion.grams !== null) {
      resolution.grams = portion.grams;
      resolution.basis = 'measured_mass';
      resolution.label = portion.label;
      return;
    }
    const conversion = resolution.option.conversions.find(item => item.unit === portion.unit);
    if (conversion) {
      const grams = portion.value * conversion.gramsPerUnit;
      // Converted totals obey the same finite/bounded contract as parsed masses.
      if (!Number.isFinite(grams) || grams < MIN_PORTION_GRAMS || grams > MAX_PORTION_GRAMS) {
        resolution.issue = 'invalid_quantity';
        resolution.issueDetail = portion.label;
        return;
      }
      resolution.grams = grams;
      resolution.basis = 'validated_conversion';
      resolution.label = portion.label;
      return;
    }
    resolution.issue = 'missing_conversion';
    resolution.issueDetail = portion.unit;
  };

  const flagAll = (issue: PortionIssue): ReferenceResolution[] => {
    for (const resolution of resolutions) { resolution.issue = issue; resolution.issueDetail = null; }
    return resolutions;
  };

  if (portions.length === 0) {
    const first = issues[0];
    if (first) {
      for (const resolution of resolutions) {
        resolution.issue = first.kind === 'ambiguous_syntax' ? 'ambiguous_syntax' : 'invalid_quantity';
        resolution.issueDetail = first.detail;
      }
    }
    return resolutions;
  }

  // A malformed amount alongside a valid one must not be silently dropped.
  if (issues.length > 0) {
    const first = issues[0];
    for (const resolution of resolutions) {
      resolution.issue = first.kind === 'ambiguous_syntax' ? 'ambiguous_syntax' : 'invalid_quantity';
      resolution.issueDetail = first.detail;
    }
    return resolutions;
  }

  if (options.length <= 1) {
    if (options.length === 1 && portions.length === 1) assign(resolutions[0], portions[0]);
    else if (options.length === 1) resolutions[0].issue = 'ambiguous_portion';
    return resolutions;
  }

  if (portions.length !== options.length) return flagAll('ambiguous_portion');
  const mentions = options.map(option => mentionPositions(option.name, userText));
  if (mentions.some(positions => positions.length === 0)) return flagAll('ambiguous_portion');

  const claimed = new Map<number, number>(); // option index -> portion index
  for (let p = 0; p < portions.length; p += 1) {
    const [start, end] = clauseRange(userText, portions[p].index);
    const inClause = options
      .map((_, o) => o)
      .filter(o => mentions[o].some(position => position >= start && position < end));
    if (inClause.length !== 1 || claimed.has(inClause[0])) return flagAll('ambiguous_portion');
    claimed.set(inClause[0], p);
  }
  if (claimed.size !== options.length) return flagAll('ambiguous_portion');
  for (const [optionIndex, portionIndex] of claimed) assign(resolutions[optionIndex], portions[portionIndex]);
  return resolutions;
}

const SPANISH_TOKENS = ['gramos', 'gramo', 'calorias', 'calorías', 'proteina', 'proteína', 'cuanto', 'cuánto', 'cuanta', 'cuánta', 'cuantos', 'cuántos', 'cuantas', 'cuántas', 'pollo', 'arroz', 'pechuga', 'queso', 'leche', 'huevo', 'huevos', 'taza', 'tazas', 'cucharada', 'rebanada', 'loncha', 'porcion', 'porción', 'porciones', 'con', 'por', 'para', 'del', 'una', 'los', 'las'];
const ENGLISH_TOKENS = ['grams', 'gram', 'calories', 'protein', 'how', 'many', 'much', 'chicken', 'rice', 'cheese', 'milk', 'egg', 'eggs', 'cup', 'cups', 'tablespoon', 'slice', 'ounces', 'with', 'of', 'the', 'and', 'for'];

function countTokens(text: string, tokens: readonly string[]): number {
  const lower = text.toLowerCase();
  let count = 0;
  for (const token of tokens) {
    const matches = lower.match(new RegExp(`\\b${escapeRegex(token)}\\b`, 'g'));
    if (matches) count += matches.length;
  }
  return count;
}

/** Language of the latest question wins over the stored profile language. */
export function resolveLanguage(userText: string, fallbackSpanish: boolean): boolean {
  const spanish = countTokens(userText, SPANISH_TOKENS);
  const english = countTokens(userText, ENGLISH_TOKENS);
  if (spanish > english) return true;
  if (english > spanish) return false;
  return fallbackSpanish;
}

function buildFoodReference(
  input: { name: string; userText: string },
  resolve: FoodReferenceResolver,
  signal: AbortSignal,
): Promise<FoodReference | null> {
  return (async (): Promise<FoodReference | null> => {
    signal.throwIfAborted();
    const base = await resolve({ foodName: input.name, unit: 'g', intentText: input.userText });
    signal.throwIfAborted();
    if (!base) return null;
    const name = typeof base.food?.nameEn === 'string' ? base.food.nameEn.trim() : '';
    const kcal = base.food?.kcalPer100g;
    const protein = base.food?.proteinPer100g;
    if (!name || typeof kcal !== 'number' || typeof protein !== 'number' || !Number.isFinite(kcal) || !Number.isFinite(protein)) return null;

    const preparation = extractPreparation(name);
    const brand = typeof base.food?.brand === 'string' && base.food.brand.trim()
      ? base.food.brand.trim()
      : null;
    const catalogueId = typeof base.food?.id === 'string' && base.food.id.trim()
      ? base.food.id.trim()
      : undefined;
    const conversions: Array<{ unit: string; gramsPerUnit: number; conversionId: string }> = [];
    const units = [...new Set(parseFoodPortions(input.userText).filter(portion => portion.kind === 'conversion').map(portion => portion.unit))].slice(0, 2);
    for (const unit of units) {
      signal.throwIfAborted();
      const resolved = await resolve({ foodName: input.name, unit, intentText: input.userText });
      signal.throwIfAborted();
      // Only genuine food_unit_conversions rows count as validated conversions.
      if (resolved && resolved.conversionId !== null && Number.isFinite(resolved.gramsPerUnit) && resolved.gramsPerUnit > 0) {
        conversions.push({ unit, gramsPerUnit: resolved.gramsPerUnit, conversionId: resolved.conversionId });
      }
    }

    const parsed = foodReferenceSchema.safeParse({
      referenceId: makeReferenceId(name, String(base.food.source ?? ''), preparation),
      name,
      brand,
      ...(catalogueId ? { catalogueId } : {}),
      source: String(base.food.source ?? ''),
      quality: String(base.food.dataQuality ?? ''),
      preparation,
      kcalPer100g: kcal,
      proteinPer100g: protein,
      conversions,
    });
    return parsed.success ? parsed.data : null;
  })();
}

/** Builds a lookup over an injected retrieval function so the conversion and
 * provenance rules are testable without a database. */
export function makeFoodReferenceLookup(resolve: FoodReferenceResolver): FoodReferenceLookup {
  return (name, userText, signal) => buildFoodReference({ name, userText }, resolve, signal);
}

/** Uses the existing food retrieval path, with no embedding or external search.
 * Returned preparation/name remains explicit; a match is an option, not intake. */
export const lookupFoodReference: FoodReferenceLookup = makeFoodReferenceLookup(async input => {
  const { lookupFood } = await import('@/agents/food-parse/lookup');
  return lookupFood(input);
});

function scaledLine(resolution: ReferenceResolution, spanish: boolean): string {
  const factor = (resolution.grams as number) / 100;
  const kcal = formatNumber(resolution.option.kcalPer100g * factor);
  const protein = formatNumber(resolution.option.proteinPer100g * factor);
  const basis = resolution.basis === 'validated_conversion' ? (spanish ? ' (conversión de unidad validada)' : ' (validated unit conversion)') : '';
  return spanish
    ? `Para ${resolution.label} que indicas: ${kcal} kcal · ${protein} g proteína${basis}.`
    : `For the ${resolution.label} you stated: ${kcal} kcal · ${protein} g protein${basis}.`;
}

function issueLine(resolution: ReferenceResolution, spanish: boolean): string {
  if (resolution.issue === 'ambiguous_portion') {
    return spanish
      ? 'Las cantidades y los alimentos no se emparejan uno a uno, así que no asigné ninguna cantidad. Indica una porción por alimento.'
      : 'The amounts and foods do not line up one-to-one, so I attached no amount to any item. Give one portion per food.';
  }
  if (resolution.issue === 'missing_conversion') {
    return spanish
      ? `No tengo una conversión validada de "${resolution.issueDetail}" a gramos para ${resolution.option.name}; dime los gramos y no los adivino.`
      : `I do not have a validated "${resolution.issueDetail}" to grams conversion for ${resolution.option.name}; give the amount in grams so I do not guess.`;
  }
  if (resolution.issue === 'invalid_quantity') {
    return spanish
      ? `No pude usar la cantidad "${resolution.issueDetail}": debe ser una porción positiva entre ${MIN_PORTION_GRAMS} g y ${MAX_PORTION_GRAMS} g. Dime una cantidad válida y la calculo.`
      : `I could not use the amount "${resolution.issueDetail}": it must be a positive portion between ${MIN_PORTION_GRAMS} g and ${MAX_PORTION_GRAMS} g. Give a valid amount and I will calculate it.`;
  }
  if (resolution.issue === 'ambiguous_syntax') {
    return spanish
      ? `La cantidad "${resolution.issueDetail}" es ambigua (separador decimal o de miles). Escríbela sin ambigüedad, por ejemplo 1500 g, y la calculo.`
      : `The amount "${resolution.issueDetail}" is ambiguous (decimal vs thousands separator). Write it unambiguously, e.g. 1500 g, and I will calculate it.`;
  }
  const stated = resolution.option.preparation ? (spanish ? ` (${resolution.option.preparation})` : ` (${resolution.option.preparation})`) : '';
  return spanish
    ? `Mencionas "${resolution.issueDetail}", pero la coincidencia del catálogo es "${resolution.option.name}"${stated}. Confirma la preparación antes de calcular la porción.`
    : `You mentioned "${resolution.issueDetail}", but the catalogue match is "${resolution.option.name}"${stated}. Confirm the preparation before I calculate a portion.`;
}

/** Renders catalogue references for the latest question. Shows honest per-100 g
 * figures plus, only when a portion binds unambiguously, deterministic arithmetic
 * for the user's own portion. Never logs intake and never fabricates macros. */
export function renderFoodReferences(raw: unknown, spanish: boolean, userText = ''): string {
  const parsed = z.object({ options: z.array(foodReferenceSchema).max(2) }).strict().safeParse(raw);
  if (!parsed.success) return '';
  const language = resolveLanguage(userText, spanish);
  if (parsed.data.options.length === 0) {
    return language ? 'No encontré una referencia alimentaria compatible en el catálogo.' : 'No matching food reference was found in the catalogue.';
  }
  const resolutions = resolveFoodReferences(parsed.data.options, userText);
  const lines: string[] = [language
    ? 'Referencias del catálogo por 100 g (no son registros de consumo):'
    : 'Catalogue references per 100 g (not logged intake):'];
  for (const resolution of resolutions) {
    const preparation = resolution.option.preparation
      ? (language ? ` (preparación: ${resolution.option.preparation})` : ` (preparation: ${resolution.option.preparation})`)
      : '';
    lines.push(`- **${resolution.option.name}**${preparation} — ${formatNumber(resolution.option.kcalPer100g)} kcal · ${formatNumber(resolution.option.proteinPer100g)} g ${language ? 'proteína' : 'protein'} (${resolution.option.source}; ${resolution.option.quality}).`);
  }
  const scaled = resolutions.filter(resolution => resolution.grams !== null && resolution.label);
  for (const resolution of scaled) lines.push(scaledLine(resolution, language));
  const issues = resolutions.filter(resolution => resolution.issue !== null);
  const seen = new Set<string>();
  for (const resolution of issues) {
    const key = `${resolution.issue}|${resolution.issueDetail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(issueLine(resolution, language));
  }
  if (issues.length === 0) {
    if (scaled.length === 0) lines.push(language ? 'Dime la porción y la calculo.' : 'Tell me the portion you mean and I will calculate it.');
    lines.push(language
      ? 'Confirma que la preparación coincide; son referencias estimadas del catálogo, no registros de consumo.'
      : 'Check that the preparation matches; these are estimated catalogue references, not logged intake.');
  }
  return lines.join('\n');
}

/** Pure filler allowed around a bare portion: "and for 200 g?", "y para 200g?".
 * Anything outside this whitelist means the message carries new intent (a food
 * name, a negation, an intake verb, a question), so it is NOT a portion-only
 * follow-up. We never strip arbitrary tokens, which would silently change intent. */
const FOLLOW_UP_FILLER = new Set([
  'and', 'for', 'y', 'para', 'por', 'de', 'del', 'con', 'with', 'plus', 'mas', 'más',
  'of', 'the', 'a', 'an', 'me', 'my', 'o', 'or', 'u', 'please', 'favor',
]);

/** Explicit small contract for a portion-only follow-up: AG1 supplies the
 * validated options from the previous food.reference turn. Returns null when the
 * message is not a single-portion follow-up, so the normal flow continues. */
export function renderFoodReferenceFollowUp(priorOptions: readonly unknown[], spanish: boolean, userText: string): string | null {
  const parsed = z.array(foodReferenceSchema).max(2).safeParse(priorOptions);
  if (!parsed.success || parsed.data.length === 0) return null;
  if (!isFoodPortionFollowUp(userText)) return null;
  return renderFoodReferences({ options: parsed.data }, spanish, userText);
}

export function isFoodPortionFollowUp(userText: string): boolean {
  if (parseFoodPortions(userText).length !== 1) return false;
  const residual = userText
    .replace(new RegExp(PORTION_RE.source, 'gi'), ' ')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .filter(token => !FOLLOW_UP_FILLER.has(token));
  return residual.length === 0;
}
