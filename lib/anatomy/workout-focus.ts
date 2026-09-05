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
  core: ["rectus-abdominis", "obliques"],
  neck: [],
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
) {
  const muscles: AnatomyMuscleId[] = group ? WORKOUT_FOCUS_GROUPS[group] : [];
  const subgroups = muscles.map((id, index) => {
    const mapping = ATLAS_MUSCLE_MAPPING[id];
    return {
      id,
      scope: mapping.scope,
      color: SUBGROUP_COLORS[index % SUBGROUP_COLORS.length],
      elements: [
        ...new Set(
          mapping.concepts.flatMap((c) => manifest.concepts[c]?.elements ?? []),
        ),
      ],
    };
  });
  return {
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
  const core = manifest.chunks.filter((c) =>
    ["muscles", "skeleton", "nervous"].includes(c.system),
  );
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
    manifest: { ...manifest, chunks: selected },
    bytes: used,
    vascularChunks: selected.length - core.length,
    totalVascularChunks: vascular.length,
  };
}
