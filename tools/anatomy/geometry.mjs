import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
export const sourceToAtlas = ([x, y, z]) => [
  x / 1000,
  z / 1000,
  -y / 1000 || 0,
];
export function readObjGeometry(text) {
  // Explicit validation before the established parser; never accept NaN/out-of-range faces.
  let vertices = 0,
    faces = 0;
  for (const line of text.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] === "v") {
      if (
        parts.length < 4 ||
        parts.slice(1, 4).some((x) => !Number.isFinite(Number(x)))
      )
        throw Error("Nonfinite vertex");
      vertices++;
    }
    if (parts[0] === "f") {
      faces++;
      if (parts.length !== 4)
        throw Error("Only triangulated source faces supported");
      for (const p of parts.slice(1)) {
        const n = Number(p.split("/")[0]);
        if (!Number.isInteger(n) || n === 0 || n > vertices || n < -vertices)
          throw Error("Invalid face index");
      }
    }
  }
  if (!vertices || !faces) throw Error("Empty geometry");
  const obj = new OBJLoader().parse(text);
  const children = obj.children.filter((x) => x.isMesh);
  if (children.length !== 1) throw Error("Expected one ELEMENT mesh");
  const original = children[0].geometry;
  original.deleteAttribute("normal");
  original.deleteAttribute("uv");
  // Exact positional indexing only (source precision), not smoothing or simplification.
  const g = mergeVertices(original, 1e-8);
  const pos = g.getAttribute("position");
  for (let i = 0; i < pos.count; i++)
    pos.setXYZ(i, ...sourceToAtlas([pos.getX(i), pos.getY(i), pos.getZ(i)]));
  g.computeVertexNormals();
  g.computeBoundingBox();
  const result = {
    positions: new Float32Array(pos.array),
    normals: new Float32Array(g.getAttribute("normal").array),
    indices: new Uint32Array(g.index.array),
    bounds: [g.boundingBox.min.toArray(), g.boundingBox.max.toArray()],
  };
  g.dispose();
  original.dispose();
  return result;
}
