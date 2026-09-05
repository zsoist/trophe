import type { AtlasManifest } from "./types";
/** Geometry buffers only; GPU copies, JS and temporary decode memory are additional. */
export const ATLAS_GEOMETRY_BUDGET = 96 * 1024 * 1024;
export function estimatedAtlasBytes(
  m: AtlasManifest,
  systems: readonly string[],
) {
  return m.chunks
    .filter((c) => systems.includes(c.system))
    .reduce((n, c) => n + c.vertices * 24 + c.triangles * 12, 0);
}
export function fitsAtlasMemory(m: AtlasManifest, systems: readonly string[]) {
  return estimatedAtlasBytes(m, systems) <= ATLAS_GEOMETRY_BUDGET;
}
