import type { ShoppingItem } from '@/agents/schemas/shopping-extract';

export type { ShoppingItem };

/** One consolidated shopping-list line after merging occurrences. */
export interface AggregatedItem extends ShoppingItem {
  /** How many meal occurrences rolled into this line (powers "×3" hints / "see N meals"). */
  occurrences: number;
  /**
   * When the same ingredient shows up in incompatible units (e.g. "2 piece"
   * chicken vs "150 g" chicken) we can't sum them — keep the un-mergeable
   * extras here so the UI can still show "+ 150 g" without losing data.
   */
  extras?: string[];
}

/**
 * Consolidate the flat, per-occurrence ingredient list (as returned by the
 * shopping_extract LLM task) into a clean shopping list: ideally one line per
 * distinct ingredient with quantities merged.
 *
 * The current body is a graceful passthrough — every occurrence becomes its own
 * line (occurrences: 1, no merging) so the feature renders before the real merge
 * logic lands.
 */
export function aggregateIngredients(items: ShoppingItem[]): AggregatedItem[] {
  const byName = new Map<string, AggregatedItem>();
  // Per line, sum same-unit quantities; stash other-unit amounts in `extras`.
  const unit = (u: string) => u.trim().toLowerCase();
  for (const it of items) {
    const key = it.name.trim().toLowerCase();
    if (!key) continue;
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, { ...it, name: key, occurrences: 1, extras: [] });
      continue;
    }
    existing.occurrences += 1;
    if (it.quantity > 0) {
      if (unit(it.unit) === unit(existing.unit)) {
        existing.quantity += it.quantity;            // same unit → sum
      } else {
        (existing.extras ??= []).push(`${it.quantity} ${it.unit}`.trim()); // can't sum → list
      }
    }
  }
  return Array.from(byName.values())
    .map((it) => ({ ...it, extras: it.extras?.length ? it.extras : undefined }))
    .sort((a, b) => b.occurrences - a.occurrences || a.name.localeCompare(b.name));
}

/** Group a consolidated list by category, preserving each group's order. */
export function groupByCategory(items: AggregatedItem[]): Record<string, AggregatedItem[]> {
  const out: Record<string, AggregatedItem[]> = {};
  for (const it of items) {
    (out[it.category] ??= []).push(it);
  }
  return out;
}
