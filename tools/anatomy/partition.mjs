/** Lossless triangle partition. Boundary vertices may repeat; no triangle is removed. */
export function partitionGeometry(g, maxTriangles = 14000) {
  if (!Number.isInteger(maxTriangles) || maxTriangles < 1)
    throw Error("Invalid partition cap");
  if (g.indices.length <= maxTriangles * 3) return [g];
  const result = [];
  for (let start = 0; start < g.indices.length; start += maxTriangles * 3) {
    const remap = new Map(),
      positions = [],
      normals = [],
      indices = [],
      bounds = [
        [Infinity, Infinity, Infinity],
        [-Infinity, -Infinity, -Infinity],
      ];
    for (const old of g.indices.slice(start, start + maxTriangles * 3)) {
      if (!remap.has(old)) {
        remap.set(old, positions.length / 3);
        for (let k = 0; k < 3; k++) {
          const v = g.positions[old * 3 + k];
          positions.push(v);
          normals.push(g.normals[old * 3 + k]);
          bounds[0][k] = Math.min(bounds[0][k], v);
          bounds[1][k] = Math.max(bounds[1][k], v);
        }
      }
      indices.push(remap.get(old));
    }
    result.push({ positions, normals, indices, bounds });
  }
  return result;
}
