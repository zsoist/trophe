export interface SupersetLink {
  linkedBelow?: boolean;
}

/**
 * Stable database group id: the one-based position where a linked chain starts.
 */
export function supersetGroupFor(
  list: SupersetLink[],
  index: number,
): number | null {
  const inChain = list[index]?.linkedBelow || (index > 0 && list[index - 1]?.linkedBelow);
  if (!inChain) return null;
  let start = index;
  while (start > 0 && list[start - 1]?.linkedBelow) start--;
  return start + 1;
}

/** Human label by group order, independent of exercise-list position. */
export function supersetLabelFor(
  list: SupersetLink[],
  index: number,
): string | null {
  const group = supersetGroupFor(list, index);
  if (group === null) return null;

  const orderedGroups: number[] = [];
  for (let current = 0; current < list.length; current++) {
    const candidate = supersetGroupFor(list, current);
    if (candidate !== null && !orderedGroups.includes(candidate)) {
      orderedGroups.push(candidate);
    }
  }
  const ordinal = orderedGroups.indexOf(group);
  return String.fromCharCode('A'.charCodeAt(0) + ordinal);
}
