export type PortionSize = 'small' | 'medium' | 'large';

export interface PortionSizeOption {
  size: PortionSize;
  grams: number;
}

const MAX_PORTION_GRAMS = 15_000;

function clampPortion(grams: number): number {
  return Math.max(1, Math.min(MAX_PORTION_GRAMS, grams));
}

function roundPractical(grams: number): number {
  if (grams < 5) return clampPortion(Math.round(grams));
  return clampPortion(Math.round(grams / 5) * 5);
}

export function getPortionSizeOptions(grams: number): PortionSizeOption[] {
  const center = clampPortion(Number.isFinite(grams) ? grams : 1);
  return [
    { size: 'small', grams: roundPractical(center * 0.7) },
    { size: 'medium', grams: roundPractical(center) },
    { size: 'large', grams: roundPractical(center * 1.4) },
  ];
}

export function getPortionDisplayAmount(grams: number, gramsPerDisplayUnit: number): number {
  if (!Number.isFinite(gramsPerDisplayUnit) || gramsPerDisplayUnit <= 0) return grams;
  const display = grams / gramsPerDisplayUnit;
  return display >= 10
    ? Math.round(display)
    : Math.round(display * 10) / 10;
}

export function resolveAmountDraft(draft: string, previous: number): number {
  if (draft.trim() === '') return previous;
  const parsed = Number(draft);
  return Number.isFinite(parsed) && parsed > 0
    ? clampPortion(parsed)
    : previous;
}

const PORTION_QUESTION_PATTERN = /\b(?:how\s+much|quantity|grams?|portion|serving|size|cantidad|gramos?|porci[oó]n|tama(?:ñ|n)o|quantit[eé]|grammes?|taille)\b|πόσ[οηα]?|ποσότητα|γραμμ|μερίδ/iu;

export function isPortionClarificationQuestion(question: string): boolean {
  return PORTION_QUESTION_PATTERN.test(question);
}
