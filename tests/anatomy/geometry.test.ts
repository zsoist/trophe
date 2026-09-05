import { expect, it } from "vitest";
import {
  readObjGeometry,
  sourceToAtlas,
} from "../../tools/anatomy/geometry.mjs";
it("applies one global mm Zup to meter Yup transform preserving left/right", () => {
  expect(sourceToAtlas([100, -200, 1500])).toEqual([0.1, 1.5, 0.2]);
});
it("reads real triangles without per-part centering", () => {
  const g = readObjGeometry("v 100 0 0\nv 100 0 100\nv 200 0 0\nf 1 2 3\n");
  expect([...g.positions]).toEqual([
    expect.closeTo(0.1),
    0,
    0,
    expect.closeTo(0.1),
    expect.closeTo(0.1),
    0,
    expect.closeTo(0.2),
    0,
    0,
  ]);
  expect([...g.indices]).toEqual([0, 1, 2]);
});
it("rejects invalid geometry rather than hiding it", () => {
  expect(() => readObjGeometry("v NaN 0 0\nf 1 2 3")).toThrow();
  expect(() => readObjGeometry("v 1 2 3\nf 1 2 8")).toThrow();
});
