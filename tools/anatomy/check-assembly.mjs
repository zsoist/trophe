import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { readObjGeometry } from "./geometry.mjs";
const [dir, inventoryPath, out] = process.argv.slice(2);
const manifest = JSON.parse(await readFile(join(dir, "manifest.json")));
const inv = JSON.parse(await readFile(inventoryPath));
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions([EXTMeshoptCompression])
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder });
let checked = 0;
// Compare unordered vertex tuples because lossless compression reorders vertices.
for (const c of manifest.chunks) {
  const doc = await io.read(join(dir, c.id + ".glb"));
  for (const node of doc.getRoot().listNodes()) {
    if (!node.getMesh()) continue;
    const eid = node.getExtras().elementId;
    const source = readObjGeometry(
      await readFile(inv.elements[eid].source_path, "utf8"),
    );
    const p = node.getMesh().listPrimitives()[0];
    const a = p.getAttribute("POSITION").getArray();
    const tuples = (v) => {
      let x = [];
      for (let k = 0; k < v.length; k += 3)
        x.push(`${v[k]},${v[k + 1]},${v[k + 2]}`);
      return x.sort();
    };
    if (
      JSON.stringify(tuples(a)) !== JSON.stringify(tuples(source.positions)) ||
      p.getIndices().getCount() !== source.indices.length
    )
      throw Error("Geometry changed " + eid);
    checked++;
  }
}
const landmarks = {};
for (const name of [
  "skull",
  "left femur",
  "right femur",
  "left humerus",
  "right humerus",
  "left talus",
  "right talus",
  "sternum",
]) {
  const c = Object.values(manifest.concepts).find((c) =>
    c.source_names.includes(name),
  );
  const bs = c.elements
    .map((id) => manifest.elements[id]?.bounds)
    .filter(Boolean);
  landmarks[name] = {
    concept: c.id,
    elements: c.elements,
    bounds: [
      Array.from({ length: 3 }, (_, i) => Math.min(...bs.map((b) => b[0][i]))),
      Array.from({ length: 3 }, (_, i) => Math.max(...bs.map((b) => b[1][i]))),
    ],
  };
}
for (const part of ["femur", "humerus", "talus"])
  if (
    landmarks["left " + part].bounds[0][0] <= 0 ||
    landmarks["right " + part].bounds[1][0] >= 0
  )
    throw Error("Chirality failed");
if (
  landmarks.skull.bounds[0][1] < 1.3 ||
  landmarks["left talus"].bounds[1][1] > 0.12
)
  throw Error("Scale/orientation failed");
await writeFile(
  out,
  JSON.stringify(
    {
      release: manifest.release,
      source_sha256: manifest.source.sha256,
      geometry_code_sha256: createHash("sha256")
        .update(await readFile(new URL("./geometry.mjs", import.meta.url)))
        .digest("hex"),
      checked_elements: checked,
      positions_exact_after_reorder: true,
      triangle_count_preserved: true,
      units: "source documented millimeters → meters",
      transform: "(x,z,-y)/1000; proper rotation, determinant +1 before scale",
      landmarks,
      visual_observation:
        "AG1 actual consumer front view: skull superior, long bones bilateral, talus inferior; sparse assembly only, not full-body deliverable",
      limits: "Landmark and coordinate validation, not clinical verification",
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ checked, landmarks }));
