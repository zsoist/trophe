import type { CoachEvidence, CoachWindow } from './contracts';

/**
 * PURE deterministic localized summary of stored daily targets and registered
 * single-day totals. It consumes ONLY server-authorized `CoachEvidence` (never
 * user text and never illustrative numbers) and returns display text plus the
 * exact evidence ids of the quantities it used.
 *
 * Safety rules held here:
 *  - Missing data is never zero; there is no fabricated default target.
 *  - Subtraction needs a stored target AND a registered total whose evidence
 *    window is the same SINGLE day. Weekly, foreign-window and duplicate
 *    conflicting evidence cannot support daily subtraction.
 *  - Invalid facts (nonfinite, negative, zero target, wrong unit, non-number)
 *    are excluded.
 *  - It never infers consumption from logged/no rows and never claims a meal
 *    was saved.
 */
export interface AdviceContextSummary { text: string; evidenceRefs: string[] }

type Locale = 'en' | 'es' | 'el';

function localeOf(language: string): Locale {
  const value = (language ?? '').trim().toLowerCase();
  if (value.startsWith('es')) return 'es';
  if (value.startsWith('el')) return 'el';
  return 'en';
}

/** Canonical evidence ids and units produced by conversation.ts / tools.ts. */
interface MetricSpec { targetId: string; registeredId: string; unit: string; protein: boolean }
const METRICS: readonly MetricSpec[] = [
  { targetId: 'nutrition.target.calories', registeredId: 'nutrition.calories', unit: 'kcal', protein: false },
  { targetId: 'nutrition.target.proteinG', registeredId: 'nutrition.protein', unit: 'g protein', protein: true },
];

function formatNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** Display amount with the localized metric word. */
function amount(locale: Locale, protein: boolean, value: number): string {
  const n = formatNumber(value);
  if (!protein) return `${n} kcal`;
  if (locale === 'es') return `${n} g de proteína`;
  if (locale === 'el') return `${n} g πρωτεΐνης`;
  return `${n} g protein`;
}

function sameWindow(a: CoachWindow, b: CoachWindow): boolean {
  return a.start === b.start && a.end === b.end && a.days === b.days && a.timezone === b.timezone;
}

/** Single non-conflicting valid fact for `id`, or nothing. A duplicate with a
 * different value inside the matching window is a conflict and yields nothing. */
function resolve(evidence: CoachEvidence[], id: string, unit: string, window: CoachWindow, allowZero: boolean): { fact: CoachEvidence | null; value: number | null } {
  const usable = evidence.filter(f =>
    f.id === id && f.source === 'nutrition' && f.sourceIds.length > 0 && f.unit === unit &&
    typeof f.value === 'number' && Number.isFinite(f.value) && f.value >= 0 && f.value <= Number.MAX_SAFE_INTEGER / 100 &&
    (allowZero || f.value > 0) && sameWindow(f.window, window));
  const values = new Set(usable.map(f => f.value as number));
  if (values.size !== 1) return { fact: null, value: null };
  return { fact: { ...usable[0], completeness: usable.some(f => f.completeness === 'partial') ? 'partial' : 'complete' }, value: usable[0].value as number };
}

interface Copies {
  targetOnly: (target: string) => string;
  registeredOnly: (date: string, registered: string) => string;
  remaining: (target: string, registered: string, diff: string, date: string) => string;
  exceed: (target: string, registered: string, diff: string, date: string) => string;
  partial: string;
  absent: string;
}

const COPIES: Record<Locale, Copies> = {
  en: {
    targetOnly: target => `Stored daily target: ${target}.`,
    registeredOnly: (date, registered) => `Registered for ${date}: ${registered}.`,
    remaining: (target, registered, diff, date) => `Stored daily target ${target}, ${registered} registered for ${date}: ${diff} remaining against recorded totals`,
    exceed: (target, registered, diff, date) => `Stored daily target ${target}, ${registered} registered for ${date}: ${diff} over the stored target (registered exceeds target)`,
    partial: ' (partial records)',
    absent: 'No stored targets or registered totals are available for this summary.',
  },
  es: {
    targetOnly: target => `Objetivo diario guardado: ${target}.`,
    registeredOnly: (date, registered) => `Registrado el ${date}: ${registered}.`,
    remaining: (target, registered, diff, date) => `Objetivo diario guardado ${target}; ${registered} registradas el ${date}: quedan ${diff} frente a lo registrado`,
    exceed: (target, registered, diff, date) => `Objetivo diario guardado ${target}; ${registered} registradas el ${date}: ${diff} por encima del objetivo (lo registrado supera el objetivo)`,
    partial: ' (registros parciales)',
    absent: 'No hay objetivos guardados ni totales registrados disponibles para este resumen.',
  },
  el: {
    targetOnly: target => `Αποθηκευμένος ημερήσιος στόχος: ${target}.`,
    registeredOnly: (date, registered) => `Καταγεγραμμένα για ${date}: ${registered}.`,
    remaining: (target, registered, diff, date) => `Αποθηκευμένος ημερήσιος στόχος ${target}, ${registered} καταγεγραμμένα για ${date}: υπολείπονται ${diff} σε σχέση με τα καταγεγραμμένα`,
    exceed: (target, registered, diff, date) => `Αποθηκευμένος ημερήσιος στόχος ${target}, ${registered} καταγεγραμμένα για ${date}: ${diff} πάνω από τον στόχο (τα καταγεγραμμένα υπερβαίνουν τον στόχο)`,
    partial: ' (μερικά δεδομένα)',
    absent: 'Δεν υπάρχουν αποθηκευμένοι στόχοι ή καταγεγραμμένα σύνολα για αυτή τη σύνοψη.',
  },
};

export function renderAdviceContextSummary(evidence: CoachEvidence[], window: CoachWindow, language: string): AdviceContextSummary {
  const locale = localeOf(language);
  const copy = COPIES[locale];
  const date = window.start;
  const lines: string[] = [];
  const evidenceRefs: string[] = [];
  for (const spec of METRICS) {
    const target = resolve(evidence, spec.targetId, spec.unit, window, false);
    const registered = resolve(evidence, spec.registeredId, spec.unit, window, true);
    // Registered totals are only usable as a daily figure for the same single day.
    const registeredFact = window.days === 1 ? registered.fact : null;
    const registeredValue = registeredFact ? registered.value! : null;
    if (target.fact && registeredFact && registeredValue !== null) {
      const targetText = amount(locale, spec.protein, target.value!);
      const registeredText = amount(locale, spec.protein, registeredValue);
      const difference = target.value! - registeredValue;
      const partial = registeredFact.completeness === 'partial' ? copy.partial : '';
      lines.push((difference < 0
        ? copy.exceed(targetText, registeredText, amount(locale, spec.protein, Math.abs(difference)), date)
        : copy.remaining(targetText, registeredText, amount(locale, spec.protein, difference), date)) + partial + '.');
      evidenceRefs.push(target.fact.id, registeredFact.id);
    } else if (target.fact) {
      lines.push(copy.targetOnly(amount(locale, spec.protein, target.value!)));
      evidenceRefs.push(target.fact.id);
    } else if (registeredFact && registeredValue !== null) {
      lines.push(copy.registeredOnly(date, amount(locale, spec.protein, registeredValue)) + (registeredFact.completeness === 'partial' ? copy.partial : ''));
      evidenceRefs.push(registeredFact.id);
    }
  }
  return { text: lines.length ? lines.join('\n') : copy.absent, evidenceRefs };
}
