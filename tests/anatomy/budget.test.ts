import { expect, it } from "vitest";
import {
  fitsAtlasMemory,
  ATLAS_GEOMETRY_BUDGET,
} from "../../lib/anatomy/budget";
import type { AtlasManifest } from "../../lib/anatomy/types";
it("bounds the combined selected layers while retaining each full layer independently", () => {
  const m = {
    chunks: [
      { system: "skeleton", vertices: 2000000, triangles: 0 },
      { system: "muscles", vertices: 3000000, triangles: 0 },
    ],
  } as AtlasManifest;
  expect(fitsAtlasMemory(m, ["skeleton"])).toBe(true);
  expect(fitsAtlasMemory(m, ["muscles"])).toBe(true);
  expect(fitsAtlasMemory(m, ["skeleton", "muscles"])).toBe(false);
  expect(ATLAS_GEOMETRY_BUDGET).toBe(96 * 1024 * 1024);
});
