import type { AtlasManifest, AtlasChunk, AtlasElement } from "./types";
import { safeAtlasUrl } from "./validation";

export interface AuthoredSupplement {
  version: "trophe.authored-atlas/1";
  baseRelease: string;
  recipeSha256: string;
  author: string;
  license: string;
  chunk: AtlasChunk;
  muscles: {
    id: "rectus-abdominis" | "latissimus-dorsi";
    label: string;
    elements: AtlasElement[];
  }[];
}
export function validateAuthored(s: AuthoredSupplement) {
  const hash = /^[a-f0-9]{64}$/;
  const bounds = (b: number[][]) =>
    Array.isArray(b) &&
    b.length === 2 &&
    b.every(
      (v) =>
        Array.isArray(v) &&
        v.length === 3 &&
        v.every((n) => Number.isFinite(n) && Math.abs(n) < 2),
    ) &&
    b[0].every((n, i) => n <= b[1][i]);
  if (
    s.version !== "trophe.authored-atlas/1" ||
    !hash.test(s.baseRelease) ||
    !hash.test(s.recipeSha256) ||
    !s.author ||
    s.author.length > 200 ||
    !s.license ||
    s.license.length > 200
  )
    throw Error("Authored atlas provenance");
  const c = s.chunk;
  if (
    !c ||
    c.id !== "authored-core" ||
    !safeAtlasUrl(c.url) ||
    !c.url.endsWith("/authored-core.glb") ||
    !hash.test(c.sha256) ||
    c.system !== "muscles" ||
    !bounds(c.bounds) ||
    !Number.isInteger(c.bytes) ||
    c.bytes < 20 ||
    c.bytes > 4 * 1024 * 1024 ||
    !Number.isInteger(c.vertices) ||
    c.vertices < 3 ||
    !Number.isInteger(c.triangles) ||
    c.triangles < 1 ||
    c.vertices * 24 + c.triangles * 12 > 2 * 1024 * 1024
  )
    throw Error("Authored atlas chunk");
  if (
    !Array.isArray(s.muscles) ||
    !s.muscles.length ||
    s.muscles.length > 2 ||
    new Set(s.muscles.map((m) => m.id)).size !== s.muscles.length
  )
    throw Error("Authored atlas muscles");
  const ids: string[] = [];
  for (const m of s.muscles) {
    if (
      !["rectus-abdominis", "latissimus-dorsi"].includes(m.id) ||
      typeof m.label !== "string" ||
      m.label.length > 100 ||
      !Array.isArray(m.elements) ||
      m.elements.length !== 2
    )
      throw Error("Authored atlas membership");
    for (const e of m.elements) {
      if (
        !/^AG2_authored_[A-Za-z0-9_]+$/.test(e.id) ||
        e.system !== "muscles" ||
        e.concept_ids.length ||
        e.availability !== "available" ||
        !bounds(e.bounds!) ||
        !e.fragments?.length ||
        e.fragments.some((f) => f.chunk !== c.id || f.node !== e.id)
      )
        throw Error("Authored atlas element");
      ids.push(e.id);
    }
  }
  if (
    new Set(ids).size !== ids.length ||
    [...ids].sort().join() !== [...c.element_ids].sort().join()
  )
    throw Error("Authored atlas element coverage");
  return s;
}

/** Compose a validated private illustration without rewriting source identity or coverage. */
export function withAuthored(
  base: AtlasManifest,
  input?: AuthoredSupplement,
): AtlasManifest {
  if (!input) return base;
  const s = validateAuthored(input);
  if (
    s.baseRelease !== base.release ||
    base.chunks.some((c) => c.id === s.chunk.id)
  )
    throw Error("Authored atlas base mismatch");
  const elements = { ...base.elements },
    concepts = { ...base.concepts };
  const muscleElements: Record<string, string[]> = {};
  for (const m of s.muscles) {
    const cid = `AUTHORED_${m.id.replaceAll("-", "_")}`;
    const ids = m.elements.map((e) => e.id);
    if (concepts[cid] || ids.some((id) => elements[id]))
      throw Error("Authored atlas identity collision");
    muscleElements[m.id] = ids;
    concepts[cid] = {
      id: cid,
      source_names: [m.label],
      representations: [],
      elements: ids,
      memberships: {},
      trees: [],
      missing_elements: [],
      laterality: "bilateral",
      availability: "available",
    };
    for (const e of m.elements) elements[e.id] = { ...e, concept_ids: [cid] };
  }
  return {
    ...base,
    elements,
    concepts,
    chunks: [...base.chunks, s.chunk],
    authored: {
      author: s.author,
      license: s.license,
      recipeSha256: s.recipeSha256,
      muscleElements,
    },
  };
}
