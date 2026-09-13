import { z } from 'zod';
import type { FoodParseInput, FoodParseOutput, ParsedFoodItem } from '@/agents/schemas/food-parse';
import { isParsedFoodItem } from '@/agents/schemas/food-parse';
import { isGovernedFoodParseTransport, type GovernedCoachTransport } from './governed-transport';
import { extractPreparation, type FoodReference, type FoodReferenceLookup } from './food-reference';
import { parseTextFood } from './text-food-parser';

/**
 * Read-only Food reference fallback.
 *
 * Ask/Live resolve a food question against the canonical catalogue first. When the
 * catalogue has NO row (a genuine miss), this adapter reuses Food's SAME existing
 * governed parser/estimator (`parseTextFood` → `agents/food-parse` `run`) through
 * the SAME admitted `food_parse` transport the Text Food slice already uses. It
 * never builds a second model engine, never seeds foods, never hardcodes nutrients
 * and never calls a provider or the database directly.
 *
 * Contract invariants:
 * - A reference query is read-only: no Food draft, proposal, receipt or row is
 *   created here (the module has no writer/DB import at all).
 * - The caller must supply an already-admitted scope (`actorId`, the ORIGINAL user
 *   turn `requestId`, the turn `signal`) and an admitted `food_parse` transport.
 *   Only such a transport is issued with the `reservationProfile:'food_parse'`
 *   marker; a smaller chat reservation is refused (fail-closed, no provider call).
 * - Catalogue misses and provider failures are different facts. A failure is never
 *   reported as "no match", and no phase is retried after a provider/governor
 *   failure. Cancellation is re-thrown so the caller's request is actually aborted.
 * - Provenance is propagated verbatim from Food (`db_source`, `data_quality`,
 *   `brand`, `db_food_id`) and NEVER invented. `llm_cot`/`ai_estimate`/category
 *   defaults are surfaced as `estimate:true`, and so is a real `local_db` row
 *   whose PORTION the model had to guess (implicit amount, or a non-mass unit with
 *   no proven conversion): its totals are a gram guess scaled by the row, not the
 *   row's own value. Generic data is never relabelled official.
 * - The honest primary basis is the parser's own portion (original unit + its own
 *   grams), with its real certainty in `portionBasis`; a per-100 g projection is
 *   derived only when grams are positive and is never used to disguise the basis.
 */

export const NATIVE_FOOD_REFERENCE_VERSION = 'coach-assistant.food-reference-native.v1';

const bounded = (minimum: number, maximum: number) => z.number().finite().min(minimum).max(maximum);
const label = (value: number): string => String(Math.round(value * 100) / 100);
const round4 = (value: number): number => Math.round(value * 1e4) / 1e4;
const round6 = (value: number): number => Math.round(value * 1e6) / 1e6;

/** How the parser arrived at the portion. Certainty is never invented:
 *
 * - an explicit, internally CONSISTENT mass (typed amount × canonical unit factor
 *   ≈ the parser's own `grams`) is the one portion the parser actually measured —
 *   `measured_mass`;
 * - an implicit portion (no user-stated amount) is a `model_estimate`;
 * - an explicit NON-mass unit (`cup`/`tbsp`/`piece`) is ALSO a `model_estimate`.
 *   A `local_db`/`hybrid` `db_food_id` proves FOOD identity — it does NOT prove the
 *   non-mass grams came from a persisted `food_unit_conversions` row, and a
 *   `ParsedFoodItem` carries no `conversionId`. Labelling such a portion
 *   `validated_conversion` merely because a food row matched would invent
 *   provenance the parser never carried.
 *
 * `validated_conversion` therefore stays in the contract but is unreachable until
 * the parser surfaces real conversion provenance (DS1/AG1 scope; no fabricated
 * `conversionId`, no schema change here). */
export type NativePortionBasis = 'measured_mass' | 'validated_conversion' | 'model_estimate';

export const nativeFoodReferenceSchema = z.object({
  /** Deterministic identity for binding a portion-only follow-up to the SAME food
   * (name|source|preparation, accent/case/space normalised). Never model input. */
  referenceId: z.string().min(1).max(240),
  name: z.string().min(1).max(200),
  /** 'catalogue' when the identity/name came from a real food row; 'model' when
   * only the estimator supplied it. */
  identity: z.enum(['catalogue', 'model']),
  /** True whenever the reported macros are NOT a canonical row's own value for a
   * proven portion: any non-`local_db` source, or a `local_db` row whose portion
   * was model-estimated (implicit / non-mass unit with no proven conversion). */
  estimate: z.boolean(),
  /** Real row provenance, propagated verbatim. Null for a model-only estimate. */
  source: z.string().min(1).max(80).nullable(),
  quality: z.string().min(1).max(80).nullable(),
  brand: z.string().min(1).max(120).nullable(),
  preparation: z.string().min(1).max(120).nullable(),
  portionBasis: z.enum(['measured_mass', 'validated_conversion', 'model_estimate']),
  /** The portion the parser actually used, retaining its original unit plus its own
   * grams (see `portionBasis` for how certain that portion is). This is the immutable
   * basis; follow-ups rescale from here. */
  portion: z.object({
    quantity: z.number().finite().positive().max(10_000),
    unit: z.string().min(1).max(50),
    grams: z.number().finite().positive().max(15_000),
    label: z.string().min(1).max(80),
    explicit: z.boolean(),
  }).strict(),
  /** Totals for the stated portion. */
  nutrients: z.object({
    kcal: bounded(0, 15_000),
    proteinG: bounded(0, 1_000),
    carbsG: bounded(0, 1_000),
    fatG: bounded(0, 1_000),
    fiberG: bounded(0, 1_000).nullable(),
    sugarG: bounded(0, 1_000).nullable(),
  }).strict(),
  /** Deterministic per-100 g projection of `nutrients`, derived from the real
   * basis. Null only when a positive gram basis is unavailable. */
  per100g: z.object({
    kcal: bounded(0, 1_000),
    proteinG: bounded(0, 100),
    carbsG: bounded(0, 100),
    fatG: bounded(0, 100),
  }).strict().nullable(),
  confidence: bounded(0, 1),
}).strict();
export type NativeFoodReference = z.infer<typeof nativeFoodReferenceSchema>;

/** A defined, truthful outcome for every reachable state. Failures are explicit
 * and distinct from `no_match`; they are never repaired or retried. */
export type NativeFoodReferenceOutcome =
  | { ok: true; outcome: 'reference'; references: NativeFoodReference[] }
  | { ok: true; outcome: 'no_match' }
  | { ok: true; outcome: 'clarification_required'; question: string | null; partial: NativeFoodReference[] }
  | { ok: true; outcome: 'preparation_mismatch'; stated: string; matched: string | null; references: NativeFoodReference[] }
  | { ok: false; outcome: 'invalid_input'; detail: string }
  | { ok: false; outcome: 'budget_blocked' }
  | { ok: false; outcome: 'provider_unavailable' }
  | { ok: false; outcome: 'incomplete' }
  | { ok: false; outcome: 'unknown' };

/** The admitted scope, mirroring `parseTextFood`. `requestId` MUST be the original
 * user turn's request id (the same one admission already charged) — never a fresh
 * UUID minted to obtain extra quota. `transport` MUST be the Food `food_parse`
 * transport marker. */
export interface NativeFoodReferenceScope {
  actorId: string;
  requestId: string;
  signal: AbortSignal;
  transport: GovernedCoachTransport;
}

export interface NativeFoodReferenceInput {
  text: string;
  language?: string;
}

/** Injected parser port. Production uses the real `parseTextFood`; tests may
 * inject an equivalent function without changing the contract. */
export type NativeFoodReferenceParser = (
  input: FoodParseInput,
  scope: NativeFoodReferenceScope,
) => Promise<FoodParseOutput>;

/** Mirror of `run`'s own input guard. Nothing here is a fallback — a bad input is
 * refused before any paid phase. */
const MAX_TEXT_LENGTH = 500;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function normaliseIdPart(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

function preparationOf(item: ParsedFoodItem): string | null {
  const stated = extractPreparation(item.food_name) ?? extractPreparation(item.name_localized);
  if (stated) return stated;
  return item.food_state && item.food_state !== 'unknown' ? item.food_state : null;
}

/** Canonical grams per unit for the units a user states as a direct mass. */
const MASS_UNIT_GRAMS: Record<string, number> = {
  g: 1, gr: 1, gram: 1, grams: 1, gramo: 1, gramos: 1,
  kg: 1000, kilo: 1000, kilos: 1000, kilogram: 1000, kilograms: 1000,
};

function massFactorOf(unit: string): number | null {
  const factor = MASS_UNIT_GRAMS[unit.toLowerCase().trim()];
  return factor === undefined ? null : factor;
}

/** An explicit mass unit is only a measurement when the typed amount and the
 * parser's own grams agree under the canonical unit factor. `0.5 kg` next to
 * `87.5 g` (or any silent mismatch) is NOT a measured mass — the mass is unknown,
 * so the caller must refuse the item rather than certify an invented certainty. */
function explicitMassIsConsistent(item: ParsedFoodItem): boolean {
  const factor = massFactorOf(item.unit);
  if (factor === null) return true; // non-mass unit: governed by conversion provenance
  const canonical = item.quantity * factor;
  if (!Number.isFinite(canonical) || canonical <= 0) return false;
  // Allow parser rounding, never a dimensional mismatch (87.5 g vs 500 g).
  const tolerance = Math.max(0.5, canonical * 0.02);
  return Math.abs(canonical - item.grams) <= tolerance;
}

function portionBasisOf(item: ParsedFoodItem): NativePortionBasis {
  if (item.portion_explicit !== true) return 'model_estimate';
  if (massFactorOf(item.unit) !== null) return 'measured_mass';
  // A non-mass unit needs real `food_unit_conversions` provenance to be a validated
  // conversion. No `ParsedFoodItem` emits that (no `conversionId`), so a matched
  // food row is NOT enough: the portion stays an honest model estimate.
  return 'model_estimate';
}

function identityOf(item: ParsedFoodItem): 'catalogue' | 'model' {
  return item.source === 'local_db' || item.source === 'local_db+category_default' || item.source === 'hybrid'
    ? 'catalogue'
    : 'model';
}

/** The reported macros are an estimate unless BOTH the nutrients and the portion
 * come from a real `local_db` row. Every other source (hybrid, category defaults,
 * llm_cot, ai_estimate) is an estimate — and so is a `local_db` row whose PORTION
 * the model had to guess (an implicit amount, or a non-mass unit with no proven
 * conversion): the totals are then a model gram estimate scaled by the row, not the
 * row's own value, so the overall estimate flag stays truthful. */
function isEstimate(item: ParsedFoodItem): boolean {
  return item.source !== 'local_db' || portionBasisOf(item) === 'model_estimate';
}

/** Projects one validated parser item into a reference, or null when the item is
 * not a valid `ParsedFoodItem` (a malformed output is refused, not dropped). The
 * reference describes the MATCHED food at its own portion — never the user's
 * phrasing, so a follow-up can bind to the same immutable basis. */
export function projectNativeFoodReference(item: unknown): NativeFoodReference | null {
  if (!isParsedFoodItem(item)) return null;
  // An explicit mass whose typed amount and grams disagree is refused whole:
  // reporting it as a measured portion would invent a certainty the parser never
  // proved. Non-mass and implicit portions keep their honest estimate basis.
  if (item.portion_explicit === true && massFactorOf(item.unit) !== null && !explicitMassIsConsistent(item)) return null;
  const preparation = preparationOf(item);
  const estimate = isEstimate(item);
  const identity = identityOf(item);
  const identitySource = item.db_source ?? (estimate ? 'estimate' : 'catalogue');
  const referenceId = [item.food_name, identitySource, preparation ?? ''].map(normaliseIdPart).join('|');
  const factor = item.grams / 100;
  const parsed = nativeFoodReferenceSchema.safeParse({
    referenceId,
    name: item.food_name,
    identity,
    estimate,
    source: item.db_source ?? null,
    quality: item.data_quality ?? null,
    brand: item.brand ?? null,
    preparation,
    portionBasis: portionBasisOf(item),
    portion: {
      quantity: item.quantity,
      unit: item.unit,
      grams: item.grams,
      label: `${label(item.quantity)} ${item.unit}`,
      explicit: item.portion_explicit === true,
    },
    nutrients: {
      kcal: item.calories,
      proteinG: item.protein_g,
      carbsG: item.carbs_g,
      fatG: item.fat_g,
      fiberG: item.fiber_g ?? null,
      sugarG: item.sugar_g ?? null,
    },
    per100g: item.grams > 0 ? {
      kcal: round6(item.calories / factor),
      proteinG: round6(item.protein_g / factor),
      carbsG: round6(item.carbs_g / factor),
      fatG: round6(item.fat_g / factor),
    } : null,
    confidence: item.confidence,
  });
  return parsed.success ? deepFreeze(parsed.data) : null;
}

/** Deterministic rescale of an immutable reference to a new gram portion. Reuses
 * the stored per-100 g basis — no requery, no provider phase. Returns null when
 * the amount is out of contract or no basis exists. */
export function rescaleNativeFoodReference(reference: NativeFoodReference, grams: number): NativeFoodReference | null {
  // Validate the incoming reference first: a malformed or out-of-contract basis
  // must never be scaled into a plausible-looking result.
  const parsedReference = nativeFoodReferenceSchema.safeParse(reference);
  if (!parsedReference.success) return null;
  const ref = parsedReference.data;
  if (!Number.isFinite(grams) || grams < 0.1 || grams > 15_000) return null;
  const basis = ref.per100g;
  if (!basis) return null;
  if (!(ref.portion.grams > 0)) return null;
  const factor = grams / 100;
  const scaled = {
    ...ref,
    portion: {
      quantity: round4(grams),
      unit: 'g',
      grams: round4(grams),
      label: `${label(grams)} g`,
      explicit: true,
    },
    nutrients: {
      kcal: round4(basis.kcal * factor),
      proteinG: round4(basis.proteinG * factor),
      carbsG: round4(basis.carbsG * factor),
      fatG: round4(basis.fatG * factor),
      fiberG: ref.nutrients.fiberG === null ? null : round4(ref.nutrients.fiberG / ref.portion.grams * grams),
      sugarG: ref.nutrients.sugarG === null ? null : round4(ref.nutrients.sugarG / ref.portion.grams * grams),
    },
  };
  // The complete rescaled result must satisfy the SAME contract as a projected
  // reference (portion ≤ 10 000, kcal ≤ 15 000, protein/carbs/fat ≤ 1 000 …).
  // A gram amount whose totals leave that window is refused, not returned.
  const parsed = nativeFoodReferenceSchema.safeParse(scaled);
  return parsed.success ? deepFreeze(parsed.data) : null;
}

function preparationMismatch(userText: string, references: readonly NativeFoodReference[]): { stated: string; matched: string | null } | null {
  const stated = extractPreparation(userText);
  if (!stated) return null;
  const first = references[0];
  if (!first) return null;
  if (first.preparation && first.preparation !== stated) return { stated, matched: first.preparation };
  // A reference whose identity is known but whose preparation is unstated cannot
  // be silently bound to a conflicting user state.
  if (!first.preparation && first.identity === 'catalogue') return { stated, matched: null };
  return null;
}

function mapFailure(error: unknown): NativeFoodReferenceOutcome {
  const message = error instanceof Error ? error.message : String(error);
  if (message === 'budget_blocked') return { ok: false, outcome: 'budget_blocked' };
  if (message === 'food_parse_incomplete') return { ok: false, outcome: 'incomplete' };
  if (message === 'provider_unavailable') return { ok: false, outcome: 'provider_unavailable' };
  return { ok: false, outcome: 'unknown' };
}

export interface NativeFoodReferenceLookup {
  (input: NativeFoodReferenceInput, scope: NativeFoodReferenceScope): Promise<NativeFoodReferenceOutcome>;
}

/** Builds the read-only fallback over an injected parser port (default: the real
 * Food `parseTextFood`). Callers inject `parseTextFood` at the composition root;
 * no model engine is constructed here. */
export function createNativeFoodReferenceFallback(parse: NativeFoodReferenceParser = parseTextFood): NativeFoodReferenceLookup {
  return async function lookupNativeFoodReference(input, scope) {
    const text = (input.text ?? '').trim();
    if (!text) return { ok: false, outcome: 'invalid_input', detail: 'empty' };
    if (text.length > MAX_TEXT_LENGTH) return { ok: false, outcome: 'invalid_input', detail: 'too_long' };
    // Fail closed before any paid phase when the transport is not the Food
    // `food_parse` admission marker (a smaller chat reservation is refused).
    if (!isGovernedFoodParseTransport(scope.transport)) throw new Error('budget_blocked');
    scope.signal.throwIfAborted();

    let output: FoodParseOutput;
    try {
      output = await parse({ text, language: input.language }, scope);
    } catch (error) {
      if (scope.signal.aborted || isAbortError(error)) throw error;
      return mapFailure(error);
    }
    scope.signal.throwIfAborted();

    const rawItems = Array.isArray(output.items) ? output.items : [];
    const references: NativeFoodReference[] = [];
    for (const item of rawItems) {
      const reference = projectNativeFoodReference(item);
      // A malformed parser item is refused whole — never silently dropped (that
      // would turn lost input into a partial meal) and never trusted as-is.
      if (!reference) return { ok: false, outcome: 'incomplete' };
      references.push(reference);
    }

    if (output.needs_clarification) {
      return { ok: true, outcome: 'clarification_required', question: output.clarification_question ?? null, partial: references };
    }
    if (references.length === 0) return { ok: true, outcome: 'no_match' };

    const mismatch = preparationMismatch(text, references);
    if (mismatch) return { ok: true, outcome: 'preparation_mismatch', ...mismatch, references };
    return { ok: true, outcome: 'reference', references };
  };
}

/** Production lookup using Food's real governed parser. */
export const lookupNativeFoodReference: NativeFoodReferenceLookup = createNativeFoodReferenceFallback();

/** Result of the catalogue-first resolution: the canonical catalogue reference is
 * always preferred; the native estimate is produced ONLY for a genuine miss. */
export type FoodReferenceResolution =
  | { ok: true; kind: 'catalogue'; reference: FoodReference }
  | { ok: true; kind: 'native'; references: NativeFoodReference[] }
  | { ok: true; kind: 'native_clarification'; question: string | null; partial: NativeFoodReference[] }
  | { ok: true; kind: 'native_preparation_mismatch'; stated: string; matched: string | null; references: NativeFoodReference[] }
  | { ok: true; kind: 'no_match' }
  | { ok: false; error: 'invalid_input' | 'catalogue_failed' | 'budget_blocked' | 'provider_unavailable' | 'incomplete' | 'unknown' };

function toResolution(outcome: NativeFoodReferenceOutcome): FoodReferenceResolution {
  switch (outcome.outcome) {
    case 'reference': return { ok: true, kind: 'native', references: outcome.references };
    case 'clarification_required': return { ok: true, kind: 'native_clarification', question: outcome.question, partial: outcome.partial };
    case 'preparation_mismatch': return { ok: true, kind: 'native_preparation_mismatch', stated: outcome.stated, matched: outcome.matched, references: outcome.references };
    case 'no_match': return { ok: true, kind: 'no_match' };
    default: return { ok: false, error: outcome.outcome };
  }
}

/** Catalogue-first orchestrator. It queries the canonical catalogue once; the
 * native fallback runs ONLY when the catalogue returns a genuine miss. A thrown
 * catalogue failure is surfaced (and never masquerades as a miss or triggers a
 * paid fallback). Cancellation propagates. */
export function createCatalogueFirstFoodReference(deps: {
  catalogue: FoodReferenceLookup;
  native: NativeFoodReferenceLookup;
}) {
  return async function resolveFoodReference(
    input: { name: string; text: string; language?: string },
    scope: NativeFoodReferenceScope,
  ): Promise<FoodReferenceResolution> {
    let reference: FoodReference | null;
    try {
      reference = await deps.catalogue(input.name, input.text, scope.signal);
    } catch (error) {
      if (scope.signal.aborted || isAbortError(error)) throw error;
      return { ok: false, error: 'catalogue_failed' };
    }
    if (reference) return { ok: true, kind: 'catalogue', reference };
    const native = await deps.native({ text: input.text, language: input.language }, scope);
    return toResolution(native);
  };
}
