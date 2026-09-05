/** Static atlas only. IDs never imply patient anatomy or exercise-role evidence. */
export type AtlasSystem =
  | "skeleton"
  | "muscles"
  | "connective"
  | "vascular"
  | "nervous"
  | "organs"
  | "other";
export interface AtlasConcept {
  id: string;
  source_names: string[];
  representations: string[];
  elements: string[];
  memberships: Partial<
    Record<"isa" | "partof", { representations: string[]; elements: string[] }>
  >;
  trees: ("isa" | "partof")[];
  laterality: "left" | "right" | "bilateral" | "unspecified";
  availability: "available" | "partial" | "missing" | "unmapped";
  missing_elements: string[];
}
export interface AtlasElement {
  id: string;
  concept_ids: string[];
  availability: "available" | "missing" | "rejected";
  system: AtlasSystem;
  region: string;
  fragments?: { chunk: string; node: string }[];
  source_sha256?: string;
  bounds?: [number[], number[]];
  vertices?: number;
  triangles?: number;
  reason?: string;
}
export interface AtlasChunk {
  id: string;
  url: string;
  sha256: string;
  bytes: number;
  system: AtlasSystem;
  region: string;
  element_ids: string[];
  bounds: [number[], number[]];
  vertices: number;
  triangles: number;
}
export interface AtlasManifest {
  version: "trophe.static-atlas/1";
  poster?: {
    url: string;
    sha256: string;
    bytes: number;
    width: number;
    height: number;
    provenance: string;
  };
  release: string;
  source: {
    name: string;
    release: string;
    sha256: string;
    url: string;
    retrieved_at: string;
    generic: string;
  };
  license: {
    id: string;
    url: string;
    attribution: string;
    modifications: string[];
  };
  transform: {
    matrix: number[];
    source_units: string;
    output_units: string;
    evidence: string;
    verified: boolean;
  };
  concepts: Record<string, AtlasConcept>;
  elements: Record<string, AtlasElement>;
  relations: { parent: string; child: string; type: "isa" | "partof" }[];
  chunks: AtlasChunk[];
  bounds: [number[], number[]];
  coverage: {
    concepts: number;
    source_elements: number;
    converted: number;
    rejected: number;
    missing: number;
    unmapped: number;
  };
  curation: { systems: string; regions: string; mapping: string };
}
