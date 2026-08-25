import type { WeightUnit } from '@/lib/workout/units';

export type PlateLoadInput = { total: number; bar: number; /** Plate denominations available for each side. */ plates: number[] };
export type PlateLoad = { exact: boolean; /** One mirrored side's ordered stack. */ perSide: number[]; achievedTotal: number };
export type WarmupSet = { percentage: number; reps: number; weight: number };
export type WarmupRampInput = { workingWeight: number; bar: number; plates: number[]; unit: WeightUnit };

const EPSILON = 1e-6;

function decimalScale(values: number[]): number {
  const decimals = values.reduce((largest, value) => {
    const text = value.toString().toLowerCase();
    const exponent = text.indexOf('e');
    if (exponent >= 0) return Math.max(largest, Number(text.slice(exponent + 1)) * -1);
    const point = text.indexOf('.');
    return Math.max(largest, point >= 0 ? text.length - point - 1 : 0);
  }, 0);
  return 10 ** Math.min(3, Math.max(0, decimals));
}

function normalizedPlates(plates: number[]): number[] {
  return [...new Set(plates.filter((plate) => Number.isFinite(plate) && plate > 0))].sort((a, b) => b - a);
}

/** Finds the heaviest safe (never above target) symmetric loading. */
export function calculatePlateLoad({ total, bar, plates }: PlateLoadInput): PlateLoad {
  if (!Number.isFinite(total) || !Number.isFinite(bar) || total < bar || bar < 0) return { exact: false, perSide: [], achievedTotal: 0 };
  const available = normalizedPlates(plates);
  const targetPerSide = (total - bar) / 2;
  if (Math.abs(targetPerSide) < EPSILON) return { exact: true, perSide: [], achievedTotal: bar };
  if (available.length === 0) return { exact: false, perSide: [], achievedTotal: bar };

  const scale = decimalScale([targetPerSide, bar, ...available]);
  const targetTicks = Math.max(0, Math.floor(targetPerSide * scale + EPSILON));
  const plateTicks = available.map((plate) => Math.round(plate * scale)).filter((plate) => plate > 0);
  const reachable = new Uint8Array(targetTicks + 1);
  const previous = new Int32Array(targetTicks + 1).fill(-1);
  reachable[0] = 1;
  for (let current = 0; current <= targetTicks; current += 1) {
    if (!reachable[current]) continue;
    for (let index = 0; index < plateTicks.length; index += 1) {
      const next = current + plateTicks[index];
      if (next <= targetTicks && !reachable[next]) { reachable[next] = 1; previous[next] = index; }
    }
  }
  let achievedTicks = targetTicks;
  while (achievedTicks > 0 && !reachable[achievedTicks]) achievedTicks -= 1;
  const perSide: number[] = [];
  for (let current = achievedTicks; current > 0;) {
    const index = previous[current];
    if (index < 0) break;
    perSide.push(available[index]);
    current -= plateTicks[index];
  }
  const achievedTotal = Math.round((bar + (achievedTicks / scale) * 2) * scale) / scale;
  return { exact: Math.abs(achievedTotal - total) < EPSILON, perSide: perSide.sort((a, b) => b - a), achievedTotal };
}

/** Alias that makes nearest-load intent explicit at call sites. */
export function nearestPlateLoad(input: PlateLoadInput): PlateLoad { return calculatePlateLoad(input); }

/** Builds conservative 40/60/80% warm-up suggestions for the chosen rack. */
export function buildWarmupRamp({ workingWeight, bar, plates }: WarmupRampInput): WarmupSet[] {
  return [{ percentage: 40, reps: 10 }, { percentage: 60, reps: 6 }, { percentage: 80, reps: 3 }].map(({ percentage, reps }) => {
    const target = workingWeight * (percentage / 100);
    const weight = target < bar ? bar : nearestPlateLoad({ total: target, bar, plates }).achievedTotal;
    return { percentage, reps, weight };
  });
}
