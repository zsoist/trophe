import type { AtlasManifest } from "./types";

export type CameraView = "front" | "back" | "side";
export type Bounds = [number[], number[]];
export function focusBounds(
  manifest: AtlasManifest,
  ids: readonly string[],
  group?: string,
): Bounds | null {
  let boxes = ids.flatMap((id) =>
    manifest.elements[id]?.bounds ? [manifest.elements[id].bounds!] : [],
  );
  // A side close-up makes bilateral arm/shoulder groups readable. Both sides remain highlighted.
  if (["shoulders", "arms", "biceps", "triceps"].includes(group ?? "")) {
    const side = boxes.filter(([min, max]) => (min[0] + max[0]) / 2 > 0);
    if (side.length) boxes = side;
  }
  if (!boxes.length) return null;
  return [
    [0, 1, 2].map((i) => Math.min(...boxes.map((b) => b[0][i]))),
    [0, 1, 2].map((i) => Math.max(...boxes.map((b) => b[1][i]))),
  ];
}
export function cameraAngle(view: CameraView, group?: string) {
  if (view === "side") return Math.PI / 2;
  if (view === "back") return group === "triceps" ? Math.PI * 0.7 : Math.PI;
  if (group === "neck") return Math.PI / 5;
  if (group === "shoulders") return Math.PI / 3;
  if (["arms", "biceps"].includes(group ?? "")) return Math.PI / 5;
  return 0;
}
/** Fits all eight corners with margin, including narrow phone aspect ratios. */
export function fitCamera(bounds: Bounds, aspect: number, theta: number) {
  const center = bounds[0].map((n, i) => (n + bounds[1][i]) / 2);
  const half = bounds[0].map((n, i) => Math.max(0.035, (bounds[1][i] - n) / 2));
  const horizontal =
    Math.abs(Math.cos(theta)) * half[0] + Math.abs(Math.sin(theta)) * half[2];
  const depth =
    Math.abs(Math.sin(theta)) * half[0] + Math.abs(Math.cos(theta)) * half[2];
  const distance =
    (Math.max(half[1], horizontal / Math.max(0.2, aspect)) /
      Math.tan((16 * Math.PI) / 180)) *
      1.3 +
    depth;
  return { center, distance: Math.max(0.3, Math.min(5, distance)), theta };
}
export function shortestAngle(from: number, to: number) {
  return from + Math.atan2(Math.sin(to - from), Math.cos(to - from));
}
export function cameraEase(progress: number) {
  return 1 - Math.pow(1 - Math.max(0, Math.min(1, progress)), 5);
}
