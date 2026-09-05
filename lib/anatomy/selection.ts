import type { AtlasManifest } from "./types";
export function selectionElements(
  manifest: AtlasManifest,
  ids: readonly string[],
): string[] {
  return [
    ...new Set(ids.flatMap((id) => manifest.concepts[id]?.elements ?? [])),
  ].sort();
}
/** Prefer the most specific represented concept; ties stable by source ID, alternatives retained. */
export function conceptForElement(
  manifest: AtlasManifest,
  element: string,
): string | null {
  return (
    [...(manifest.elements[element]?.concept_ids ?? [])].sort(
      (a, b) =>
        (manifest.concepts[a]?.elements.length ?? Infinity) -
          (manifest.concepts[b]?.elements.length ?? Infinity) ||
        a.localeCompare(b),
    )[0] ?? null
  );
}
export function visibleSelection(
  manifest: AtlasManifest,
  id: string,
  systems: ReadonlySet<string>,
  hidden: ReadonlySet<string>,
) {
  const visible: string[] = [],
    invisible: string[] = [];
  for (const eid of selectionElements(manifest, [id]))
    (systems.has(manifest.elements[eid]?.system) && !hidden.has(eid)
      ? visible
      : invisible
    ).push(eid);
  return { visible, hidden: invisible };
}
