/** Sequential, resumable OBJ→GLB conversion. No decimation or per-part transform. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { Document, NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression } from "@gltf-transform/extensions";
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";
import { reorder } from "@gltf-transform/functions";
import { readObjGeometry } from "./geometry.mjs";
import sharp from "sharp";
import { partitionGeometry } from "./partition.mjs";
const [
  inventoryPath,
  sourceRecordPath,
  output,
  assemblyReportPath,
  posterPath,
] = process.argv.slice(2);
if (!output || !assemblyReportPath)
  throw Error(
    "Usage: node tools/anatomy/convert.mjs INVENTORY SOURCE_RECORD OUTPUT ASSEMBLY_REPORT [POSTER_IMAGE]",
  );
const hash = (b) => createHash("sha256").update(b).digest("hex");
const inv = JSON.parse(await readFile(inventoryPath)),
  source = JSON.parse(await readFile(sourceRecordPath));
const config = {
  version: 4,
  compression: "EXT_meshopt lossless float buffers; reorder only",
  three: "0.185.1",
  gltfTransform: "4.5.0",
  meshoptimizer: "1.0.1",
  matrix: [0.001, 0, 0, 0, 0, 0, -0.001, 0, 0, 0.001, 0, 0, 0, 0, 0, 1],
  chunkSoftBytes: 2700000,
  partitionTriangles: 14000,
};
const geometryCode = await readFile(new URL("./geometry.mjs", import.meta.url));
const assemblyBytes = await readFile(assemblyReportPath),
  assembly = JSON.parse(assemblyBytes);
if (
  assembly.source_sha256 !== source.sha256 ||
  assembly.geometry_code_sha256 !== hash(geometryCode) ||
  assembly.checked_elements < 8 ||
  !assembly.positions_exact_after_reorder ||
  !assembly.triangle_count_preserved ||
  !assembly.landmarks?.skull ||
  !assembly.landmarks?.["left femur"]
)
  throw Error("Verified same-source assembly required before bulk conversion");
const posterBytes = posterPath ? await readFile(posterPath) : null;
const posterMeta = posterBytes
  ? await sharp(posterBytes, { limitInputPixels: 2048 * 2048 }).metadata()
  : null;
if (
  posterBytes &&
  (posterBytes.length > 1024 * 1024 ||
    !["png", "jpeg"].includes(posterMeta.format) ||
    !posterMeta.width ||
    !posterMeta.height)
)
  throw Error("Bounded PNG/JPEG poster required");
const posterName = posterMeta?.format === "jpeg" ? "poster.jpg" : "poster.png";
const portableInventory = JSON.stringify(inv, (k, v) =>
  k === "source_path" ? undefined : v,
);
const key = hash(
  Buffer.concat([
    Buffer.from(
      portableInventory + JSON.stringify(source) + JSON.stringify(config),
    ),
    geometryCode,
    assemblyBytes,
    posterBytes ?? Buffer.alloc(0),
    await readFile(new URL("./convert.mjs", import.meta.url)),
    await readFile(new URL("./partition.mjs", import.meta.url)),
  ]),
);
await mkdir(output, { recursive: true });
await mkdir(join(output, "cache"), { recursive: true });
const colors = {
  skeleton: [0.82, 0.77, 0.64, 1],
  muscles: [0.55, 0.23, 0.2, 1],
  connective: [0.74, 0.72, 0.59, 1],
  vascular: [0.48, 0.24, 0.28, 1],
  nervous: [0.71, 0.57, 0.3, 1],
  organs: [0.5, 0.34, 0.34, 1],
  other: [0.46, 0.5, 0.51, 1],
};
const bounds = [
    [Infinity, Infinity, Infinity],
    [-Infinity, -Infinity, -Infinity],
  ],
  prepared = [];
function extend(target, b) {
  for (let k = 0; k < 3; k++) {
    target[0][k] = Math.min(target[0][k], b[0][k]);
    target[1][k] = Math.max(target[1][k], b[1][k]);
  }
}
for (const e of Object.values(inv.elements).sort((a, b) =>
  a.id.localeCompare(b.id),
)) {
  if (!e.source_path) continue;
  try {
    const raw = await readFile(e.source_path),
      cacheKey = hash(
        Buffer.concat([geometryCode, Buffer.from(config.three), raw]),
      ),
      cacheFile = join(output, "cache", cacheKey + ".json");
    let g;
    try {
      g = JSON.parse(await readFile(cacheFile));
    } catch {
      const p = readObjGeometry(raw.toString());
      g = {
        positions: [...p.positions],
        normals: [...p.normals],
        indices: [...p.indices],
        bounds: p.bounds,
      };
      await writeFile(cacheFile, JSON.stringify(g));
    }
    const y = (g.bounds[0][1] + g.bounds[1][1]) / 2;
    e.region = y >= 1.35 ? "upper" : y >= 0.82 ? "middle" : "lower";
    e.bounds = g.bounds;
    e.vertices = g.positions.length / 3;
    e.triangles = g.indices.length / 3;
    e.source_sha256 = hash(raw);
    e.fragments = [];
    prepared.push({ e, cacheFile });
    extend(bounds, e.bounds);
  } catch (error) {
    e.availability = "rejected";
    e.reason = String(error);
  }
  delete e.source_path;
  if (prepared.length % 200 === 0)
    console.log(
      JSON.stringify({
        prepared: prepared.length,
        rss: process.memoryUsage().rss,
      }),
    );
  await new Promise((resolve) => setTimeout(resolve, 2));
}
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions([EXTMeshoptCompression])
  .registerDependencies({
    "meshopt.encoder": MeshoptEncoder,
    "meshopt.decoder": MeshoptDecoder,
  });
let doc,
  scene,
  buffer,
  material,
  bytes = 0,
  items = [],
  system = "",
  region = "",
  chunks = [];
function init(s, r) {
  system = s;
  region = r;
  doc = new Document();
  buffer = doc.createBuffer();
  scene = doc.createScene("whole-body");
  material = doc
    .createMaterial(s)
    .setBaseColorFactor(colors[s])
    .setRoughnessFactor(0.75)
    .setMetallicFactor(0)
    .setDoubleSided(true);
  bytes = 0;
  items = [];
}
async function flush() {
  if (!items.length) return;
  const id = `${system}-${region}-${chunks.filter((c) => c.system === system && c.region === region).length}`;
  await doc.transform(reorder({ encoder: MeshoptEncoder, target: "size" }));
  // QUANTIZE is the encoder mode name: no quantize transform is invoked. Float32
  // positions remain exact; check-assembly roundtrips the actual compressed GLBs.
  doc
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({
      method: EXTMeshoptCompression.EncoderMethod.QUANTIZE,
    });
  const binary = await io.writeBinary(doc);
  if (binary.byteLength > 4 * 1024 * 1024)
    throw Error(`Chunk exceeds budget: ${id}`);
  await writeFile(join(output, id + ".glb"), binary);
  const b = [
    [Infinity, Infinity, Infinity],
    [-Infinity, -Infinity, -Infinity],
  ];
  for (const { e, node, g } of items) {
    extend(b, g.bounds);
    e.fragments.push({ chunk: id, node });
  }
  chunks.push({
    id,
    url: `/anatomy/${key}/${id}.glb`,
    sha256: hash(binary),
    bytes: binary.byteLength,
    system,
    region,
    element_ids: [...new Set(items.map((i) => i.e.id))],
    bounds: b,
    vertices: items.reduce((n, i) => n + i.g.positions.length / 3, 0),
    triangles: items.reduce((n, i) => n + i.g.indices.length / 3, 0),
  });
}
for (const { e, cacheFile } of prepared.sort(
  (a, b) =>
    a.e.system.localeCompare(b.e.system) ||
    a.e.region.localeCompare(b.e.region) ||
    a.e.id.localeCompare(b.e.id),
)) {
  const g = JSON.parse(await readFile(cacheFile));
  const parts = partitionGeometry(g, config.partitionTriangles);
  for (const [index, part] of parts.entries()) {
    const estimate =
      (part.positions.length + part.normals.length + part.indices.length) * 4 +
      3000;
    if (!doc) init(e.system, e.region);
    if (
      system !== e.system ||
      region !== e.region ||
      bytes + estimate > config.chunkSoftBytes
    ) {
      await flush();
      init(e.system, e.region);
    }
    const pos = doc
        .createAccessor()
        .setType("VEC3")
        .setArray(new Float32Array(part.positions))
        .setBuffer(buffer),
      norm = doc
        .createAccessor()
        .setType("VEC3")
        .setArray(new Float32Array(part.normals))
        .setBuffer(buffer),
      idx = doc
        .createAccessor()
        .setType("SCALAR")
        .setArray(new Uint32Array(part.indices))
        .setBuffer(buffer);
    const node = `${e.id}-${index}`,
      mesh = doc
        .createMesh(node)
        .addPrimitive(
          doc
            .createPrimitive()
            .setAttribute("POSITION", pos)
            .setAttribute("NORMAL", norm)
            .setIndices(idx)
            .setMaterial(material),
        );
    scene.addChild(
      doc
        .createNode(node)
        .setMesh(mesh)
        .setExtras({ elementId: e.id, conceptIds: e.concept_ids }),
    );
    items.push({ e, node, g: part });
    bytes += estimate;
  }
}
await flush();
const els = Object.values(inv.elements);
for (const c of Object.values(inv.concepts)) {
  c.missing_elements = c.elements.filter(
    (id) => !inv.elements[id]?.fragments?.length,
  );
  c.availability = !c.elements.length
    ? "unmapped"
    : c.missing_elements.length === c.elements.length
      ? "missing"
      : c.missing_elements.length
        ? "partial"
        : "available";
}
const coverage = {
  concepts: Object.keys(inv.concepts).length,
  source_elements: els.length,
  converted: els.filter((e) => e.fragments?.length).length,
  rejected: els.filter((e) => e.availability === "rejected").length,
  missing: els.filter((e) => e.availability === "missing").length,
  unmapped: Object.values(inv.concepts).filter(
    (c) => c.availability === "unmapped",
  ).length,
};
const manifest = {
  version: "trophe.static-atlas/1",
  pipeline: {
    config,
    geometry_code_sha256: hash(geometryCode),
    assembly_report_sha256: hash(assemblyBytes),
    inventory_sha256: hash(portableInventory),
  },
  ...(posterBytes
    ? {
        poster: {
          url: `/anatomy/${key}/${posterName}`,
          mime: posterMeta.format === "jpeg" ? "image/jpeg" : "image/png",
          sha256: hash(posterBytes),
          bytes: posterBytes.length,
          width: posterMeta.width,
          height: posterMeta.height,
          provenance:
            "Screenshot of verified source skeleton in actual consumer; same global transform, no image generation.",
        },
      }
    : {}),
  release: key,
  source,
  license: {
    id: "CC-BY-4.0",
    url: "https://creativecommons.org/licenses/by/4.0/",
    attribution:
      "BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International",
    modifications: [
      "OBJ converted to GLB; millimeter Z-up to meter Y-up rotation; normals recomputed; shared materials; lossless meshopt compression/reordering and triangle partition; no simplification or coordinate quantization.",
    ],
  },
  transform: {
    matrix: config.matrix,
    source_units: "millimeters",
    output_units: "meters",
    evidence:
      "official coordinate_system.png; check-assembly verifies exact positions, count, skull/femur/humerus/talus/sternum landmarks before bulk",
    verified: true,
  },
  concepts: inv.concepts,
  elements: inv.elements,
  relations: inv.relations,
  chunks,
  bounds,
  coverage,
  curation: inv.curation,
};
if (posterBytes) await writeFile(join(output, posterName), posterBytes);
await writeFile(join(output, "manifest.json"), JSON.stringify(manifest));
await writeFile(
  join(output, "coverage.json"),
  JSON.stringify(
    {
      coverage,
      systems: Object.fromEntries(
        Object.keys(colors).map((s) => [
          s,
          {
            elements: els.filter((e) => e.system === s && e.fragments?.length)
              .length,
            bytes: chunks
              .filter((c) => c.system === s)
              .reduce((n, c) => n + c.bytes, 0),
          },
        ]),
      ),
      laterality: Object.fromEntries(
        ["left", "right", "bilateral", "unspecified"].map((l) => [
          l,
          Object.values(inv.concepts).filter((c) => c.laterality === l).length,
        ]),
      ),
      rejected: els.filter((e) => e.availability === "rejected"),
      missing: els.filter((e) => e.availability === "missing"),
      config,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    key,
    coverage,
    chunks: chunks.length,
    bytes: chunks.reduce((n, c) => n + c.bytes, 0),
  }),
);
