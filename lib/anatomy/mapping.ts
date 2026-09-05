import type { AnatomyMuscleId } from "../workout/anatomy";
import type { AtlasManifest } from "./types";
export interface AtlasMuscleMapping {
  concepts: readonly string[];
  scope: "named" | "group" | "partial" | "unresolved";
  note: string;
}
/** Trophē curation against BodyParts3D4.0 source names. No exercise roles or percentages. */
export const ATLAS_MUSCLE_MAPPING: Record<AnatomyMuscleId, AtlasMuscleMapping> =
  {
    "pectoralis-major": {
      concepts: ["FMA34687", "FMA34696", "FMA34699"],
      scope: "group",
      note: "Clavicular, sternocostal and abdominal source portions; union of both sides.",
    },
    "serratus-anterior": {
      concepts: ["FMA13397"],
      scope: "named",
      note: "Named source compound, both sides.",
    },
    "anterior-deltoid": {
      concepts: ["FMA34677"],
      scope: "named",
      note: "Clavicular source portion.",
    },
    "middle-deltoid": {
      concepts: ["FMA34678"],
      scope: "named",
      note: "Acromial source portion.",
    },
    "posterior-deltoid": {
      concepts: ["FMA34679"],
      scope: "named",
      note: "Spinal source portion.",
    },
    "rotator-cuff": {
      concepts: ["FMA9629", "FMA32546", "FMA32550", "FMA13413"],
      scope: "group",
      note: "Supraspinatus, infraspinatus, teres minor and subscapularis; a curated group, not one source mesh.",
    },
    "upper-trapezius": {
      concepts: ["FMA32557"],
      scope: "named",
      note: "Descending source portion.",
    },
    "lower-trapezius": {
      concepts: ["FMA32555"],
      scope: "named",
      note: "Ascending source portion.",
    },
    "latissimus-dorsi": {
      concepts: [],
      scope: "unresolved",
      note: "No matching named concept found in the pinned English source catalogue; no substitute.",
    },
    rhomboids: {
      concepts: ["FMA13379", "FMA13380"],
      scope: "group",
      note: "Rhomboid major and minor.",
    },
    "erector-spinae": {
      concepts: ["FMA77177", "FMA77178", "FMA77179"],
      scope: "group",
      note: "Iliocostalis, longissimus and spinalis source groups.",
    },
    "biceps-brachii": {
      concepts: ["FMA37682", "FMA37683"],
      scope: "group",
      note: "Short and long heads.",
    },
    "triceps-brachii": {
      concepts: ["FMA37692", "FMA37693", "FMA37694"],
      scope: "group",
      note: "Long, medial and lateral heads.",
    },
    brachialis: {
      concepts: ["FMA37667"],
      scope: "named",
      note: "Named source compound.",
    },
    "forearm-flexors": {
      concepts: ["FMA38459", "FMA38615", "FMA38616", "FMA38469", "FMA38478"],
      scope: "partial",
      note: "Available wrist/digit flexors; not an exhaustive forearm compartment definition.",
    },
    "forearm-extensors": {
      concepts: ["FMA38494", "FMA38497", "FMA38506", "FMA38500"],
      scope: "partial",
      note: "Available wrist/digit extensors; not an exhaustive forearm compartment definition.",
    },
    "rectus-abdominis": {
      concepts: [],
      scope: "unresolved",
      note: "No matching named concept found in the pinned English source catalogue; no substitute.",
    },
    obliques: {
      concepts: ["FMA13335"],
      scope: "partial",
      note: "External oblique present; internal oblique mapping unresolved.",
    },
    "gluteus-maximus": {
      concepts: ["FMA22314"],
      scope: "named",
      note: "Named source compound.",
    },
    "gluteus-medius": {
      concepts: ["FMA22315"],
      scope: "named",
      note: "Named source compound.",
    },
    quadriceps: {
      concepts: ["FMA22430", "FMA22431", "FMA22432", "FMA22433"],
      scope: "group",
      note: "Rectus femoris and three vasti; explicit union.",
    },
    hamstrings: {
      concepts: ["FMA45887", "FMA45890", "FMA22357", "FMA22438"],
      scope: "group",
      note: "Biceps femoris heads, semitendinosus and semimembranosus; broad product group, not an exercise-role claim.",
    },
    adductors: {
      concepts: ["FMA22441", "FMA22442", "FMA22443", "FMA43885"],
      scope: "partial",
      note: "Named adductor longus, brevis, magnus and minimus; broader product group may include other muscles.",
    },
    gastrocnemius: {
      concepts: ["FMA45956", "FMA45959"],
      scope: "group",
      note: "Medial and lateral source heads.",
    },
    soleus: {
      concepts: ["FMA22542"],
      scope: "named",
      note: "Named source compound.",
    },
    "tibialis-anterior": {
      concepts: ["FMA22532"],
      scope: "named",
      note: "Named source compound.",
    },
  };
export function mappingForMuscle(id: string) {
  return Object.hasOwn(ATLAS_MUSCLE_MAPPING, id)
    ? ATLAS_MUSCLE_MAPPING[id as AnatomyMuscleId]
    : null;
}
export function mappingCoverage(manifest: AtlasManifest) {
  return Object.entries(ATLAS_MUSCLE_MAPPING).map(([id, mapping]) => ({
    id,
    ...mapping,
    unavailable: mapping.concepts.filter(
      (cid) => manifest.concepts[cid]?.availability !== "available",
    ),
  }));
}
