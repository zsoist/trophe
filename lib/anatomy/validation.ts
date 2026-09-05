import type { AtlasManifest } from "./types";
export const safeAtlasUrl = (url: string) =>
  /^\/anatomy\/[a-f0-9]{64}\/[a-z0-9-]+\.(glb|json|webp|png|jpg)$/.test(url);
export function validateChunkBytes(buffer: ArrayBuffer): void {
  if (buffer.byteLength < 20 || buffer.byteLength > 4 * 1024 * 1024)
    throw Error("Atlas chunk size");
  const view = new DataView(buffer);
  if (
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== buffer.byteLength ||
    view.getUint32(16, true) !== 0x4e4f534a
  )
    throw Error("Invalid GLB");
  const len = view.getUint32(12, true);
  if (len > buffer.byteLength - 20) throw Error("Invalid GLB JSON");
  const json = JSON.parse(new TextDecoder().decode(buffer.slice(20, 20 + len)));
  if (
    (json.buffers ?? []).reduce(
      (n: number, b: { byteLength: number }) => n + b.byteLength,
      0,
    ) >
      32 * 1024 * 1024 ||
    (json.buffers ?? []).some(
      (b: { byteLength: number }) =>
        !Number.isInteger(b.byteLength) || b.byteLength < 0,
    ) ||
    json.nodes?.length > 15000 ||
    (json.extensionsRequired ?? []).some(
      (e: string) => e !== "EXT_meshopt_compression",
    )
  )
    throw Error("Atlas decoded geometry cap");
  if (
    [...(json.buffers ?? []), ...(json.images ?? [])].some(
      (x: { uri?: string }) => x.uri,
    ) ||
    json.animations?.length ||
    json.skins?.length
  )
    throw Error("Static embedded atlas only");
}
const SYSTEMS = new Set([
  "skeleton",
  "muscles",
  "connective",
  "vascular",
  "nervous",
  "organs",
  "other",
]);
const id = (value: unknown, pattern: RegExp) =>
  typeof value === "string" && pattern.test(value);
const finiteBounds = (b: unknown) =>
  Array.isArray(b) &&
  b.length === 2 &&
  b.every(
    (v) =>
      Array.isArray(v) &&
      v.length === 3 &&
      v.every(
        (n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 10,
      ),
  ) &&
  b[0].every((n: number, i: number) => n <= b[1][i]);
const stringList = (
  value: unknown,
  pattern: RegExp,
  cap = 15000,
): value is string[] =>
  Array.isArray(value) &&
  value.length <= cap &&
  value.every((v) => id(v, pattern)) &&
  new Set(value).size === value.length;
export function validateAtlas(value: unknown): AtlasManifest {
  const m = value as AtlasManifest;
  if (
    !m ||
    m.version !== "trophe.static-atlas/1" ||
    !id(m.release, /^[a-f0-9]{64}$/) ||
    !m.concepts ||
    !m.elements ||
    !Array.isArray(m.chunks) ||
    m.chunks.length > 2000 ||
    Object.keys(m.concepts).length > 15000 ||
    Object.keys(m.elements).length > 15000 ||
    !Array.isArray(m.relations) ||
    m.relations.length > 40000
  )
    throw Error("Atlas manifest limits");
  if (
    !finiteBounds(m.bounds) ||
    m.license?.id !== "CC-BY-4.0" ||
    m.license.url !== "https://creativecommons.org/licenses/by/4.0/" ||
    !Array.isArray(m.license.modifications) ||
    m.license.modifications.some(
      (x) => typeof x !== "string" || x.length > 2000,
    ) ||
    typeof m.license.attribution !== "string" ||
    m.license.attribution.length > 1000 ||
    !id(m.source?.sha256, /^[a-f0-9]{64}$/) ||
    m.source.name !== "BodyParts3D" ||
    typeof m.source.release !== "string" ||
    m.source.release.length > 100
  )
    throw Error("Atlas provenance");
  if (
    m.transform?.source_units !== "millimeters" ||
    m.transform.output_units !== "meters" ||
    JSON.stringify(m.transform.matrix) !==
      JSON.stringify([
        0.001, 0, 0, 0, 0, 0, -0.001, 0, 0, 0.001, 0, 0, 0, 0, 0, 1,
      ])
  )
    throw Error("Atlas global transform");
  for (const [cid, c] of Object.entries(m.concepts)) {
    if (
      cid !== c.id ||
      !id(cid, /^FMA\d+$/) ||
      !Array.isArray(c.source_names) ||
      !c.source_names.length ||
      c.source_names.length > 10 ||
      c.source_names.some(
        (n) => typeof n !== "string" || !n || n.length > 500,
      ) ||
      !stringList(c.representations, /^BP\d+$/) ||
      !stringList(c.elements, /^[A-Z]+\d+M?$/) ||
      !stringList(c.missing_elements, /^[A-Z]+\d+M?$/) ||
      !["left", "right", "bilateral", "unspecified"].includes(c.laterality) ||
      !["available", "partial", "missing", "unmapped"].includes(
        c.availability,
      ) ||
      !c.memberships ||
      !stringList(c.trees, /^(isa|partof)$/, 2)
    )
      throw Error("Atlas concept");
    for (const tree of c.trees) {
      const membership = c.memberships[tree];
      if (
        !membership ||
        !stringList(membership.representations, /^BP\d+$/) ||
        !stringList(membership.elements, /^[A-Z]+\d+M?$/) ||
        membership.elements.some((e) => !c.elements.includes(e))
      )
        throw Error("Atlas typed membership");
    }
    if (c.elements.some((e) => !m.elements[e]?.concept_ids.includes(cid)))
      throw Error("Atlas concept/element correspondence");
  }
  if (
    m.poster &&
    (!safeAtlasUrl(m.poster.url) ||
      m.poster.url !==
        `/anatomy/${m.release}/${m.poster.mime === "image/jpeg" ? "poster.jpg" : "poster.png"}` ||
      !id(m.poster.sha256, /^[a-f0-9]{64}$/) ||
      m.poster.bytes < 24 ||
      m.poster.bytes > 1024 * 1024 ||
      m.poster.width < 1 ||
      m.poster.width > 2048 ||
      m.poster.height < 1 ||
      m.poster.height > 2048)
  )
    throw Error("Atlas poster");
  const chunkIds = new Set<string>(),
    nodeIds = new Set<string>();
  for (const c of m.chunks) {
    if (
      !id(c.id, /^[a-z0-9-]+$/) ||
      chunkIds.has(c.id) ||
      !safeAtlasUrl(c.url) ||
      c.url !== `/anatomy/${m.release}/${c.id}.glb` ||
      !SYSTEMS.has(c.system) ||
      !finiteBounds(c.bounds) ||
      !Number.isInteger(c.bytes) ||
      c.bytes <= 0 ||
      c.bytes > 4 * 1024 * 1024 ||
      !id(c.sha256, /^[a-f0-9]{64}$/) ||
      !stringList(c.element_ids, /^[A-Z]+\d+M?$/) ||
      !c.element_ids.length ||
      !Number.isInteger(c.vertices) ||
      c.vertices < 3 ||
      !Number.isInteger(c.triangles) ||
      c.triangles < 1 ||
      !c.element_ids.every(
        (eid) =>
          m.elements[eid]?.system === c.system &&
          m.elements[eid]?.fragments?.some((f) => f.chunk === c.id),
      )
    )
      throw Error("Atlas chunk identity");
    chunkIds.add(c.id);
  }
  for (const [eid, e] of Object.entries(m.elements)) {
    if (
      eid !== e.id ||
      !id(eid, /^[A-Z]+\d+M?$/) ||
      !SYSTEMS.has(e.system) ||
      !stringList(e.concept_ids, /^FMA\d+$/) ||
      e.concept_ids.some((c) => !m.concepts[c]?.elements.includes(eid)) ||
      !["available", "missing", "rejected"].includes(e.availability)
    )
      throw Error("Atlas element");
    if (
      e.availability === "available" &&
      (!finiteBounds(e.bounds) ||
        !Array.isArray(e.fragments) ||
        !e.fragments.length)
    )
      throw Error("Atlas available geometry");
    for (const f of e.fragments ?? []) {
      if (
        !chunkIds.has(f.chunk) ||
        !id(f.node, /^[A-Z]+\d+M?-\d+$/) ||
        !f.node.startsWith(eid + "-") ||
        nodeIds.has(f.node) ||
        !m.chunks.find((c) => c.id === f.chunk)?.element_ids.includes(eid)
      )
        throw Error("Atlas fragment identity");
      nodeIds.add(f.node);
    }
  }
  if (
    m.relations.some(
      (r) =>
        !m.concepts[r.parent] ||
        !m.concepts[r.child] ||
        !["isa", "partof"].includes(r.type),
    )
  )
    throw Error("Atlas hierarchy");
  if (
    !m.coverage ||
    m.coverage.source_elements !== Object.keys(m.elements).length ||
    m.coverage.concepts !== Object.keys(m.concepts).length ||
    m.coverage.converted !==
      Object.values(m.elements).filter((e) => e.availability === "available")
        .length
  )
    throw Error("Atlas coverage");
  return m;
}
export async function fetchAtlasChunk(
  url: string,
  bytes: number,
  sha256: string,
  signal: AbortSignal,
): Promise<ArrayBuffer> {
  if (!safeAtlasUrl(url)) throw Error("Invalid atlas URL");
  const response = await fetch(url, { signal, credentials: "same-origin" });
  if (!response.ok || !response.body) throw Error("Atlas chunk unavailable");
  const reader = response.body.getReader();
  const pieces: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > bytes || size > 4 * 1024 * 1024)
        throw Error("Atlas response cap");
      pieces.push(value);
    }
  } catch (e) {
    await reader.cancel();
    throw e;
  }
  if (size !== bytes) throw Error("Atlas size mismatch");
  const all = new Uint8Array(size);
  let offset = 0;
  for (const part of pieces) {
    all.set(part, offset);
    offset += part.length;
  }
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", all))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (hash !== sha256) throw Error("Atlas hash mismatch");
  validateChunkBytes(all.buffer);
  return all.buffer;
}

/** Streaming cap applies before decoding/parsing untrusted manifest text. */
export async function fetchAtlasManifest(
  url: string,
  signal: AbortSignal,
): Promise<AtlasManifest> {
  if (!safeAtlasUrl(url) || !url.endsWith("/manifest.json"))
    throw Error("Invalid manifest URL");
  const response = await fetch(url, { signal, credentials: "same-origin" });
  if (!response.ok || !response.body) throw Error("Atlas unavailable");
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let size = 0,
    text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8 * 1024 * 1024) throw Error("Manifest cap");
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    await reader.cancel();
    throw error;
  }
  const manifest = validateAtlas(JSON.parse(text));
  if (url !== `/anatomy/${manifest.release}/manifest.json`)
    throw Error("Manifest release mismatch");
  return manifest;
}
