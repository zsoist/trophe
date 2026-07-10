'use client';

/**
 * Weight-unit preference (kg | lb) — display/input conversion only.
 *
 * Storage is ALWAYS kg (workout_sets.weight_kg). Conversion happens at the
 * UI boundary: values are parsed in the user's unit and converted once to kg
 * on save; stored kg is converted for display. Never round-trip a displayed
 * value back through the display unit (rounding drift).
 */

import { useSyncExternalStore } from 'react';

export type WeightUnit = 'kg' | 'lb';

const STORAGE_KEY = 'trophe_weight_unit';
const CHANGE_EVENT = 'trophe-unit-change';
const KG_PER_LB = 0.45359237;

export function getWeightUnit(): WeightUnit {
  if (typeof window === 'undefined') return 'kg';
  return window.localStorage.getItem(STORAGE_KEY) === 'lb' ? 'lb' : 'kg';
}

export function setWeightUnit(unit: WeightUnit): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, unit);
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: unit }));
}

/** Stored kg → display number in the user's unit (1 decimal, trailing .0 dropped). */
export function kgToDisplay(kg: number, unit: WeightUnit): number {
  const v = unit === 'lb' ? kg / KG_PER_LB : kg;
  return Math.round(v * 10) / 10;
}

/** User-typed value in their unit → kg for storage (2 decimals). */
export function displayToKg(value: number, unit: WeightUnit): number {
  const kg = unit === 'lb' ? value * KG_PER_LB : value;
  return Math.round(kg * 100) / 100;
}

/** Format stored kg for display with its unit suffix, e.g. "225 lb" / "102.5 kg". */
export function formatWeight(kg: number, unit: WeightUnit): string {
  return `${kgToDisplay(kg, unit)} ${unit}`;
}

function subscribeUnit(callback: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, callback);
  return () => window.removeEventListener(CHANGE_EVENT, callback);
}

/**
 * Reactive unit preference — localStorage is an external store, so
 * useSyncExternalStore keeps every consumer in sync (and SSR renders 'kg').
 */
export function useWeightUnit(): [WeightUnit, (u: WeightUnit) => void] {
  const unit = useSyncExternalStore(subscribeUnit, getWeightUnit, () => 'kg' as WeightUnit);
  return [unit, setWeightUnit];
}
