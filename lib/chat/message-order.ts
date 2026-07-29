export function chronologicalFromNewest<T>(newestFirst: readonly T[]): T[] {
  return [...newestFirst].reverse();
}
