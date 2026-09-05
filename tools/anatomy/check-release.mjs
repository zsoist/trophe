/** Read-only real-geometry checks for a generated release, including split elements. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { tsImport } from "tsx/esm/api";
import { readObjGeometry } from "./geometry.mjs";
const [dir, inventoryPath, out] = process.argv.slice(2);
const manifestBytes = await readFile(join(dir, "manifest.json")),
  m = JSON.parse(manifestBytes),
  inv = JSON.parse(await readFile(inventoryPath));
const { validateAtlas, validateChunkBytes } = await tsImport(
  "../../lib/anatomy/validation.ts",
  import.meta.url,
);
const { mappingCoverage } = await tsImport(
  "../../lib/anatomy/mapping.ts",
  import.meta.url,
);
validateAtlas(m);
const hash = (b) => createHash("sha256").update(b).digest("hex");
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions([EXTMeshoptCompression])
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const seen = new Map(),
  nodes = new Set();
let triangles = 0,
  vertices = 0;
for (const c of m.chunks) {
  const bytes = await readFile(join(dir, c.id + ".glb"));
  if (hash(bytes) !== c.sha256 || bytes.length !== c.bytes)
    throw Error("Chunk identity");
  validateChunkBytes(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
  );
  const doc = await io.readBinary(bytes);
  let ct = 0,
    cv = 0;
  for (const node of doc.getRoot().listNodes()) {
    if (!node.getMesh()) continue;
    const eid = node.getExtras().elementId,
      e = m.elements[eid];
    if (
      !e?.fragments.some(
        (f) => f.chunk === c.id && f.node === node.getName(),
      ) ||
      nodes.has(node.getName())
    )
      throw Error("Node mapping");
    nodes.add(node.getName());
    const g = readObjGeometry(
      await readFile(inv.elements[eid].source_path, "utf8"),
    );
    const allowed = new Set();
    for (let i = 0; i < g.positions.length; i += 3)
      allowed.add(
        `${g.positions[i]},${g.positions[i + 1]},${g.positions[i + 2]}`,
      );
    const record = seen.get(eid) ?? {
      triangles: 0,
      positions: new Set(),
      expectedVertices: allowed.size,
      fragments: 0,
    };
    for (const p of node.getMesh().listPrimitives()) {
      const positions = p.getAttribute("POSITION").getArray();
      for (let i = 0; i < positions.length; i += 3) {
        const tuple = `${positions[i]},${positions[i + 1]},${positions[i + 2]}`;
        if (!allowed.has(tuple)) throw Error("Position changed " + eid);
        record.positions.add(tuple);
      }
      const count = p.getIndices().getCount() / 3;
      record.triangles += count;
      ct += count;
      cv += positions.length / 3;
    }
    record.fragments++;
    if (record.fragments === e.fragments.length) {
      record.position_count = record.positions.size;
      if (
        record.triangles !== e.triangles ||
        record.position_count !== record.expectedVertices
      )
        throw Error("Element coverage changed " + eid);
      delete record.positions;
    }
    seen.set(eid, record);
  }
  if (ct !== c.triangles || cv !== c.vertices) throw Error("Chunk counts");
  triangles += ct;
  vertices += cv;
}
for (const [eid, r] of seen)
  if (
    r.triangles !== m.elements[eid].triangles ||
    r.position_count !== r.expectedVertices
  )
    throw Error("Element coverage changed " + eid);
if (seen.size !== m.coverage.source_elements)
  throw Error("Not every source element verified");
if (m.poster) {
  const b = await readFile(join(dir, "poster.png"));
  if (hash(b) !== m.poster.sha256 || b.length !== m.poster.bytes)
    throw Error("Poster identity");
}
const mappings = mappingCoverage(m);
if (mappings.some((m) => m.unavailable.length))
  throw Error("Mapped source concept unavailable");
const report = {
  release: m.release,
  manifest_sha256: hash(manifestBytes),
  source_sha256: m.source.sha256,
  checked_elements: seen.size,
  chunks: m.chunks.length,
  nodes: nodes.size,
  triangles,
  render_vertices_including_partition_boundaries: vertices,
  source_positions_exact: true,
  source_triangle_counts_preserved: true,
  source_paths_exposed: manifestBytes.includes(Buffer.from("source_path")),
  mapping: mappings,
  initial_skeleton_glb_bytes: m.chunks
    .filter((c) => c.system === "skeleton")
    .reduce((n, c) => n + c.bytes, 0),
  limits:
    "Exact coordinate-set and triangle-count preservation; partition unit test checks winding/connectivity. Not a clinical or geometric defect certification.",
};
await writeFile(out, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({
    release: m.release,
    checked_elements: seen.size,
    chunks: m.chunks.length,
    triangles,
    mapping_count: mappings.length,
  }),
);
