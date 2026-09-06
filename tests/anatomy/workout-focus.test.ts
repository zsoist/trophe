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

it("loads curated arm heads classified as other, without admitting unrelated nodes or understating memory", () => {
  const source = {
    ...manifest,
    concepts: {
      FMA37682: { elements: ["FJ1512", "FJ1512M"] },
      FMA37683: { elements: ["FJ1478", "FJ1478M"] },
      FMA37692: { elements: ["FJ1479", "FJ1479M"] },
      FMA37693: { elements: ["FJ1480", "FJ1480M"] },
      FMA37694: { elements: ["FJ1477", "FJ1477M"] },
    },
    elements: Object.fromEntries(
      [
        "FJ1512",
        "FJ1512M",
        "FJ1478",
        "FJ1478M",
        "FJ1479",
        "FJ1479M",
        "FJ1480",
        "FJ1480M",
        "FJ1477",
        "FJ1477M",
      ].map((id) => [id, { id, system: "other" }]),
    ),
  } as unknown as AtlasManifest;
  const heads = Object.keys(source.elements);
  source.chunks = [
    ...manifest.chunks,
    {
      ...chunk("other-middle-0", "other", 100_000),
      element_ids: [...heads, "unrelated"],
    } as AtlasManifest["chunks"][number],
  ];
  const before = JSON.stringify(source);
  const context = workoutContext(source, []);
  const extra = context.manifest.chunks.find((c) => c.id === "other-middle-0")!;
  expect(extra.system).toBe("muscles");
  expect(extra.element_ids).toEqual(heads);
  expect(extra.vertices).toBe(100_000);
  expect(workoutFocus(context.manifest, "biceps").elements).toHaveLength(4);
  expect(workoutFocus(context.manifest, "triceps").elements).toHaveLength(6);
  expect(context.manifest.elements.FJ1477.system).toBe("muscles");
  expect(context.bytes).toBe(
    context.manifest.chunks.reduce(
      (n, c) => n + c.vertices * 24 + c.triangles * 12,
      0,
    ),
  );
  expect(context.bytes).toBeLessThanOrEqual(ATLAS_GEOMETRY_BUDGET);
  expect(JSON.stringify(source)).toBe(before);
});
