import { expect, it } from "vitest";
import { partitionGeometry } from "../../tools/anatomy/partition.mjs";
it("partitions triangles without changing positions, winding or element identity", () => {
  const g = {
    positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0],
    normals: Array(12).fill(1),
    indices: [0, 1, 2, 1, 3, 2],
    bounds: [
      [0, 0, 0],
      [1, 1, 0],
    ],
  };
  const parts = partitionGeometry(g, 1);
  expect(parts).toHaveLength(2);
  const expanded = (x: typeof g) =>
    x.indices.flatMap((i) => x.positions.slice(i * 3, i * 3 + 3));
  expect(parts.flatMap(expanded)).toEqual(expanded(g));
});
