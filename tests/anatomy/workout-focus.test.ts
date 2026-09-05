import { expect, it } from "vitest";
import type { AtlasManifest } from "../../lib/anatomy/types";
import {
  workoutContext,
  workoutFocus,
  isWorkoutFocusGroup,
} from "../../lib/anatomy/workout-focus";
import { workoutAtlasFilter } from "../../lib/anatomy/workout-navigation";
import { ATLAS_GEOMETRY_BUDGET } from "../../lib/anatomy/budget";
const chunk = (id: string, system: string, vertices: number, y = 0) => ({
  id,
  system,
  vertices,
  triangles: 0,
  element_ids: [id],
  bounds: [
    [0, y, 0],
    [1, y + 1, 1],
  ],
});
const manifest = {
  concepts: {},
  chunks: [
    chunk("muscle", "muscles", 2_800_000),
    chunk("bone", "skeleton", 500_000),
    chunk("nerve", "nervous", 100_000),
    chunk("near", "vascular", 600_000),
    chunk("far", "vascular", 600_000, 10),
    chunk("organ", "organs", 1),
  ],
  bounds: [
    [0, 0, 0],
    [1, 1, 1],
  ],
} as unknown as AtlasManifest;
it("keeps all core workout layers and selects only vascular context that fits without mutating source", () => {
  const before = JSON.stringify(manifest);
  const result = workoutContext(manifest, ["muscle"]);
  expect(result.bytes).toBeLessThanOrEqual(ATLAS_GEOMETRY_BUDGET);
  expect(result.manifest.chunks.map((c) => c.id)).toEqual([
    "muscle",
    "bone",
    "nerve",
    "near",
  ]);
  expect(result.vascularChunks).toBe(1);
  expect(result.totalVascularChunks).toBe(2);
  expect(JSON.stringify(manifest)).toBe(before);
});
it("never invents missing neck or abdominal geometry", () => {
  expect(workoutFocus(manifest, "neck")).toMatchObject({
    elements: [],
    partial: true,
  });
  expect(workoutFocus(manifest, "core")).toMatchObject({
    elements: [],
    partial: true,
  });
  expect(isWorkoutFocusGroup("__proto__")).toBe(false);
});
it("maps workout links only to existing exercise-library categories", () => {
  expect(workoutAtlasFilter("biceps")).toEqual({
    area: "arms",
    muscle: "biceps",
  });
  expect(workoutAtlasFilter("glutes")).toEqual({
    area: "legs",
    muscle: "glutes",
  });
  expect(workoutAtlasFilter("neck")).toBeNull();
  expect(workoutAtlasFilter("__proto__")).toBeNull();
});
