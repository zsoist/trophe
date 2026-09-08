import {
  ATLAS_GEOMETRY,
  atlasPathsFor,
  silhouettePathsFor,
} from "@/lib/workout/atlas-geometry";
import type { AnatomyMuscleId } from "@/lib/workout/anatomy";

/** Small location references from the app's licensed 2D atlas, not new 3D meshes. */
export function MusclePreview({ id, color }: { id: string; color: string }) {
  const alias = id.startsWith("pectoral-")
    ? "pectoralis-major"
    : id.startsWith("triceps-")
      ? "triceps-brachii"
      : id;
  const geometry = Object.hasOwn(ATLAS_GEOMETRY, alias)
    ? ATLAS_GEOMETRY[alias as AnatomyMuscleId]
    : null;
  const view = geometry?.view ?? "front";
  const paths = silhouettePathsFor(view);
  let highlighted =
    geometry?.sourceKind === "licensed-surface"
      ? atlasPathsFor(alias as AnatomyMuscleId)
      : [];
  if (id === "pectoral-clavicular")
    highlighted = highlighted.filter((p) => p.id.includes("upper"));
  if (id === "triceps-long" || id === "triceps-lateral")
    highlighted = highlighted.filter((p) => p.id.includes(id));
  // Neck and deep muscles have no surface outline in this 2D source. Show context only.
  if (id === "triceps-medial") highlighted = [];
  const lower = [
    "quadriceps",
    "hamstrings",
    "adductors",
    "gastrocnemius",
    "soleus",
    "tibialis-anterior",
    "gluteus-maximus",
    "gluteus-medius",
  ].includes(id);
  return (
    <svg
      className="anatomy-muscle-preview"
      viewBox={`${view === "front" ? -2 : 35} ${lower ? 39 : 8} 39 52`}
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" stroke="var(--atlas-preview-line)" strokeWidth=".3">
        {paths.map((p) => (
          <path key={p.id} d={p.path} />
        ))}
      </g>
      <g fill={color} stroke="none">
        {highlighted.map((p) => (
          <path key={p.id} d={p.path} />
        ))}
      </g>
      {geometry?.sourceKind === "deep-location-guide" && (
        <path
          d={geometry.guidePath}
          fill="none"
          stroke={color}
          strokeWidth="1"
          strokeDasharray="1 1"
        />
      )}
    </svg>
  );
}

export function MuscleColorsIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="25"
      height="25"
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
      focusable="false"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path
        d="M10 3v3L5 9l-2 8 3 1 2-5 1 11h10l1-11 2 5 3-1-2-8-5-3V3"
        stroke="currentColor"
      />
      <path
        d="M9 10l5 2 5-2M14 12v3"
        stroke={active ? "#edc987" : "currentColor"}
      />
      <path d="M10 16h8" stroke={active ? "#78bed2" : "currentColor"} />
      <path d="M11 20h6" stroke={active ? "#e6a6b6" : "currentColor"} />
    </svg>
  );
}
