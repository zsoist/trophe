import type { AnatomyMuscleId } from "../workout/anatomy";
import type { AtlasManifest } from "./types";
import { ATLAS_MUSCLE_MAPPING } from "./mapping";
import { ATLAS_GEOMETRY_BUDGET } from "./budget";
export const WORKOUT_FOCUS_GROUPS = {
  chest: ["pectoralis-major", "serratus-anterior"],
  back: [
    "upper-trapezius",
    "lower-trapezius",
    "rhomboids",
    "erector-spinae",
    "latissimus-dorsi",
  ],
  shoulders: [
    "anterior-deltoid",
    "middle-deltoid",
    "posterior-deltoid",
    "rotator-cuff",
  ],
  arms: [
    "biceps-brachii",
    "triceps-brachii",
    "brachialis",
    "forearm-flexors",
    "forearm-extensors",
  ],
  biceps: ["biceps-brachii", "brachialis"],
  triceps: ["triceps-brachii"],
  legs: [
    "quadriceps",
    "hamstrings",
    "adductors",
    "gastrocnemius",
    "soleus",
    "tibialis-anterior",
  ],
  glutes: ["gluteus-maximus", "gluteus-medius"],
  core: ["rectus-abdominis", "obliques", "erector-spinae"],
  neck: [
    "upper-trapezius",
    "anterior-deltoid",
    "middle-deltoid",
    "posterior-deltoid",
  ],
} satisfies Record<string, AnatomyMuscleId[]>;
export type WorkoutFocusGroup = keyof typeof WORKOUT_FOCUS_GROUPS;
export const WORKOUT_SYSTEMS = ["muscles", "skeleton", "vascular", "nervous"];
export const SUBGROUP_COLORS = [
  "#e8b85e",
  "#78bed2",
  "#e6a1b0",
  "#a7c885",
  "#b1a5db",
  "#d4a17c",
  "#8ac6b9",
];
export function isWorkoutFocusGroup(value: string): value is WorkoutFocusGroup {
  return Object.prototype.hasOwnProperty.call(WORKOUT_FOCUS_GROUPS, value);
}
export function workoutFocus(
  manifest: AtlasManifest,
  group: WorkoutFocusGroup | "",
  legRegion: "all" | "upper" | "lower" = "all",
) {
  let muscles: AnatomyMuscleId[] = group ? WORKOUT_FOCUS_GROUPS[group] : [];
  if (group === "legs" && legRegion !== "all")
    muscles = muscles.filter((id) =>
      legRegion === "upper"
        ? ["quadriceps", "hamstrings", "adductors"].includes(id)
        : ["gastrocnemius", "soleus", "tibialis-anterior"].includes(id),
    );
  const definitions = muscles.map((id) => ({
    id: id as string,
    labelKey: `workout.atlas_muscle_${id.replaceAll("-", "_")}`,
    ...ATLAS_MUSCLE_MAPPING[id],
  }));
  // Source-only display subdivisions; these do not create workout muscle IDs or roles.
  if (group === "chest")
    definitions.splice(
      0,
      1,
      {
        id: "pectoral-clavicular",
        labelKey: "anatomy.pectoral_clavicular",
        concepts: ["FMA34687"],
        scope: "named",
        note: "Clavicular source portion",
      },
      {
        id: "pectoral-sternocostal",
        labelKey: "anatomy.pectoral_sternocostal",
        concepts: ["FMA34696"],
        scope: "named",
        note: "Sternocostal source portion",
      },
      {
        id: "pectoral-abdominal",
        labelKey: "anatomy.pectoral_abdominal",
        concepts: ["FMA34699"],
        scope: "named",
        note: "Abdominal source portion, not rectus abdominis",
      },
    );
  if (group === "neck")
    definitions.push(
      {
        id: "sternocleidomastoid",
        labelKey: "anatomy.neck_scm",
        concepts: ["FMA13407"],
        scope: "named",
        note: "Both sides",
      },
      {
        id: "scalenes",
        labelKey: "anatomy.neck_scalenes",
        concepts: ["FMA64829"],
        scope: "group",
        note: "Source scalene group",
      },
      {
        id: "posterior-rectus-capitis",
        labelKey: "anatomy.neck_posterior",
        concepts: ["FMA32525", "FMA32526"],
        scope: "partial",
        note: "Posterior rectus capitis major/minor only; not complete suboccipital coverage",
      },
    );
  if (group === "triceps")
    definitions.splice(
      0,
      1,
      {
        id: "triceps-long",
        labelKey: "anatomy.triceps_long",
        concepts: ["FMA37692"],
        scope: "named",
        note: "Long source head",
      },
      {
        id: "triceps-lateral",
        labelKey: "anatomy.triceps_lateral",
        concepts: ["FMA37694"],
        scope: "named",
        note: "Lateral source head",
      },
      {
        id: "triceps-medial",
        labelKey: "anatomy.triceps_medial",
        concepts: ["FMA37693"],
        scope: "named",
        note: "Medial source head",
      },
    );
  if (group === "core") {
    const oblique = definitions.find((d) => d.id === "obliques");
    if (oblique) oblique.labelKey = "anatomy.external_obliques";
  }
  const chestColors = ["#edc987", "#dbab5c", "#bc986c", "#78bed2"];
  const subgroups = definitions.map((mapping, index) => ({
    id: mapping.id,
    labelKey: mapping.labelKey,
    concepts: mapping.concepts,
    scope: mapping.scope,
    color: (group === "chest" ? chestColors : SUBGROUP_COLORS)[
      index % SUBGROUP_COLORS.length
    ],
    elements: manifest.authored?.muscleElements[mapping.id] ?? [
      ...new Set(
        mapping.concepts.flatMap((c) => manifest.concepts[c]?.elements ?? []),
      ),
    ],
  }));
  return {
    superficialElements:
      group === "neck" ? (manifest.concepts.FMA45738?.elements ?? []) : [],
    subgroups,
    elements: [...new Set(subgroups.flatMap((s) => s.elements))],
    partial:
      !!group &&
      (!subgroups.length ||
        subgroups.some(
          (s) =>
            s.scope === "partial" ||
            s.scope === "unresolved" ||
            !s.elements.length,
        )),
  };
}
/** Full muscles/bones/nerves plus a explicitly partial vascular context under the unchanged cap.
 * Chunk proximity is spatial context, never a claim about innervation or blood supply. */
export function workoutContext(
  manifest: AtlasManifest,
  focusElements: readonly string[],
) {
  // Curated muscle membership takes precedence in this consumer view only.
  // Some source heads are partitioned under "other". Keep original files/hashes
  // and charge the ENTIRE fetched chunk, while displaying only curated elements.
  const curated = new Set(
    Object.values(ATLAS_MUSCLE_MAPPING).flatMap((mapping) =>
      mapping.concepts.flatMap((id) => manifest.concepts[id]?.elements ?? []),
    ),
  );
  const supplemental = manifest.chunks
    .filter(
      (c) =>
        c.system === "other" && c.element_ids.some((id) => curated.has(id)),
    )
    .map((c) => ({
      ...c,
      system: "muscles" as const,
      element_ids: c.element_ids.filter((id) => curated.has(id)),
    }));
  const core = [
    ...manifest.chunks.filter((c) =>
      ["muscles", "skeleton", "nervous"].includes(c.system),
    ),
    ...supplemental,
  ];
  const elements = { ...manifest.elements };
  for (const chunk of supplemental)
    for (const id of chunk.element_ids)
      elements[id] = { ...elements[id], system: "muscles" };
  const bytes = (c: AtlasManifest["chunks"][number]) =>
    c.vertices * 24 + c.triangles * 12;
  let used = core.reduce((n, c) => n + bytes(c), 0);
  const focus = new Set(focusElements);
  const targets = manifest.chunks.filter(
    (c) => c.system === "muscles" && c.element_ids.some((id) => focus.has(id)),
  );
  const center = (bounds: [number[], number[]]) =>
    bounds[0].map((n, i) => (n + bounds[1][i]) / 2);
  const targetCenters = (
    targets.length ? targets.map((c) => c.bounds) : [manifest.bounds]
  ).map(center);
  const vascular = manifest.chunks
    .filter((c) => c.system === "vascular")
    .sort((a, b) => {
      const distance = (c: typeof a) =>
        Math.min(
          ...targetCenters.map((t) =>
            center(c.bounds).reduce((n, v, i) => n + (v - t[i]) ** 2, 0),
          ),
        );
      return distance(a) - distance(b) || a.id.localeCompare(b.id);
    });
  const selected = [...core];
  for (const chunk of vascular)
    if (used + bytes(chunk) <= ATLAS_GEOMETRY_BUDGET) {
      selected.push(chunk);
      used += bytes(chunk);
    }
  return {
    manifest: { ...manifest, elements, chunks: selected },
    bytes: used,
    vascularChunks: selected.length - core.length,
    totalVascularChunks: vascular.length,
  };
}

/** Fitness presentation only: ocular structures were partitioned under skeleton in the source. */
export function workoutOcularElements(manifest: AtlasManifest) {
  return [
    ...new Set(
      ["FMA12514", "FMA12515"].flatMap(
        (id) => manifest.concepts[id]?.elements ?? [],
      ),
    ),
  ];
}
