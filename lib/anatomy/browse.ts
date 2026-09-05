import type { AtlasManifest } from "./types";
import { ATLAS_MUSCLE_MAPPING } from "./mapping";
import { conceptForElement } from "./selection";

/** Navigation shortcuts, not exercise roles. IDs refer to the pinned source. */
export const BROWSE_GROUPS = [
  { id: "skull", system: "skeleton", concepts: ["FMA46565"] },
  { id: "spine", system: "skeleton", concepts: ["FMA13478"] },
  { id: "ribs", system: "skeleton", concepts: ["FMA7574"] },
  { id: "femur", system: "skeleton", concepts: ["FMA9611"] },
  { id: "humerus", system: "skeleton", concepts: ["FMA13303"] },
  { id: "tibia", system: "skeleton", concepts: ["FMA24476"] },
  ...(
    [
      "pectoralis-major",
      "biceps-brachii",
      "triceps-brachii",
      "quadriceps",
      "hamstrings",
      "gluteus-maximus",
      "gastrocnemius",
    ] as const
  ).map((id) => ({
    id,
    system: "muscles",
    concepts: ATLAS_MUSCLE_MAPPING[id].concepts,
  })),
];

export function browseConcepts(
  manifest: AtlasManifest,
  options: {
    query: string;
    system: string;
    side: string;
    group: string;
    fullCatalogue: boolean;
  },
) {
  const query = options.query.trim().toLowerCase();
  const group = BROWSE_GROUPS.find((g) => g.id === options.group);
  const members = group
    ? new Set(
        group.concepts.flatMap((id) => manifest.concepts[id]?.elements ?? []),
      )
    : null;
  // Prefer concrete source structures over ontology bookkeeping during browsing.
  // Explicit search and the full catalogue still reach every source concept.
  const concrete =
    !query && !options.fullCatalogue
      ? new Set(
          Object.keys(manifest.elements).map((id) =>
            conceptForElement(manifest, id),
          ),
        )
      : null;
  return Object.values(manifest.concepts)
    .filter(
      (c) =>
        (!concrete || concrete.has(c.id)) &&
        (!options.system ||
          c.elements.some(
            (id) => manifest.elements[id]?.system === options.system,
          )) &&
        (!options.side || c.laterality === options.side) &&
        (!members ||
          (c.elements.length > 0 &&
            c.elements.every((id) => members.has(id)))) &&
        (!query ||
          `${c.id} ${c.source_names.join(" ")}`.toLowerCase().includes(query)),
    )
    .sort((a, b) => a.source_names[0].localeCompare(b.source_names[0]));
}
