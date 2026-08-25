import type { WeightUnit } from '@/lib/workout/units';

export type PlateLoadInput = { total: number; bar: number; plates: number[] };
export type PlateLoad = { exact: boolean; perSide: number[]; achievedTotal: number };
export type WarmupSet = { percentage: number; achievedPercentage: number; reps: number; weight: number };
export type WarmupRampInput = { workingWeight: number; bar: number; plates: number[]; unit: WeightUnit };

const SCALE = 100;
const MAX_TOTAL = 2_000;
const MAX_BAR = 100;
const MAX_DENOMINATION = 100;
const MAX_DENOMINATIONS = 12;
const MAX_PLATES_PER_SIDE = 32;
const MAX_SIDE_TICKS = (MAX_TOTAL * SCALE) / 2;
const EPSILON = 1e-6;

function normalizedPlates(plates: number[]): number[] {
  if (plates.length > MAX_DENOMINATIONS) return [];
  return [...new Set(plates.filter((plate) => Number.isFinite(plate) && plate > 0 && plate <= MAX_DENOMINATION).map((plate) => Math.round(plate * SCALE) / SCALE))].sort((a, b) => b - a);
}

function invalid(input: PlateLoadInput): boolean {
  return !Number.isFinite(input.total) || !Number.isFinite(input.bar) || input.total < 0 || input.total > MAX_TOTAL || input.bar < 0 || input.bar > MAX_BAR;
}

/**
 * Bounded rack search. Its memory is fixed by realistic rack limits, never by
 * a typed target, and evaluates both lower and higher achievable totals.
 */
export function calculatePlateLoad(input: PlateLoadInput): PlateLoad {
  if (invalid(input)) return { exact: false, perSide: [], achievedTotal: 0 };
  const plates = normalizedPlates(input.plates);
  const barTicks = Math.round(input.bar * SCALE);
  const totalTicks = Math.round(input.total * SCALE);
  if (!plates.length || totalTicks <= barTicks) return { exact: totalTicks === barTicks, perSide: [], achievedTotal: input.bar };

  const plateTicks = plates.map((plate) => Math.round(plate * SCALE));
  const seen = new Uint8Array(MAX_SIDE_TICKS + 1);
  const count = new Uint8Array(MAX_SIDE_TICKS + 1);
  const previous = new Int32Array(MAX_SIDE_TICKS + 1).fill(-1);
  const queue = [0];
  seen[0] = 1;
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (count[current] >= MAX_PLATES_PER_SIDE) continue;
    for (let index = 0; index < plateTicks.length; index += 1) {
      const next = current + plateTicks[index];
      if (next <= MAX_SIDE_TICKS && !seen[next]) { seen[next] = 1; count[next] = count[current] + 1; previous[next] = index; queue.push(next); }
    }
  }
  let bestSide = 0;
  let bestDistance = Math.abs(barTicks - totalTicks);
  for (let side = 1; side <= MAX_SIDE_TICKS; side += 1) {
    if (!seen[side]) continue;
    const achieved = barTicks + side * 2;
    const distance = Math.abs(achieved - totalTicks);
    if (distance < bestDistance || (distance === bestDistance && achieved < barTicks + bestSide * 2)) { bestSide = side; bestDistance = distance; }
  }
  const perSide: number[] = [];
  for (let current = bestSide; current > 0;) { const index = previous[current]; if (index < 0) break; perSide.push(plates[index]); current -= plateTicks[index]; }
  const achievedTotal = Math.round((barTicks + bestSide * 2)) / SCALE;
  return { exact: Math.abs(achievedTotal - input.total) < EPSILON, perSide: perSide.sort((a, b) => b - a), achievedTotal };
}

export function nearestPlateLoad(input: PlateLoadInput): PlateLoad { return calculatePlateLoad(input); }

/** Returns only unique, non-increasing-load suggestions that can be inserted safely. */
export function buildWarmupRamp({ workingWeight, bar, plates }: WarmupRampInput): WarmupSet[] {
  if (!Number.isFinite(workingWeight) || workingWeight <= bar || invalid({ total: workingWeight, bar, plates })) return [];
  const seenWeights = new Set<number>();
  return [{ percentage: 40, reps: 10 }, { percentage: 60, reps: 6 }, { percentage: 80, reps: 3 }].flatMap(({ percentage, reps }) => {
    const load = nearestPlateLoad({ total: workingWeight * (percentage / 100), bar, plates });
    if (load.achievedTotal <= 0 || load.achievedTotal > workingWeight || seenWeights.has(load.achievedTotal)) return [];
    seenWeights.add(load.achievedTotal);
    return [{ percentage, achievedPercentage: Math.round((load.achievedTotal / workingWeight) * 1000) / 10, reps, weight: load.achievedTotal }];
  });
}
