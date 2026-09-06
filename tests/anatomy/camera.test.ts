import { expect, it } from "vitest";
import {
  cameraAngle,
  cameraEase,
  fitCamera,
  focusBounds,
  shortestAngle,
} from "../../lib/anatomy/camera";
import type { AtlasManifest } from "../../lib/anatomy/types";

it("frames the real selected bounds and preserves a safe margin on phone and desktop", () => {
  const bounds: [number[], number[]] = [
    [-0.2, 0.8, -0.04],
    [0.2, 1.3, 0.2],
  ];
  for (const aspect of [390 / 520, 1440 / 700])
    for (const theta of [0, Math.PI / 3, Math.PI]) {
      const pose = fitCamera(bounds, aspect, theta);
      expect(pose.center).toEqual([0, 1.05, 0.08]);
      for (const x of bounds.map((b) => b[0]))
        for (const y of bounds.map((b) => b[1]))
          for (const z of bounds.map((b) => b[2])) {
            const dx = x - pose.center[0],
              dz = z - pose.center[2];
            const cameraDepth =
              pose.distance - (Math.sin(theta) * dx + Math.cos(theta) * dz);
            const halfHeight = cameraDepth * Math.tan((16 * Math.PI) / 180);
            expect(Math.abs(y - pose.center[1])).toBeLessThan(halfHeight);
            expect(
              Math.abs(Math.cos(theta) * dx - Math.sin(theta) * dz),
            ).toBeLessThan(halfHeight * aspect);
          }
    }
});

it("does not invent bounds for an unmapped group and frames one side only for arm close-ups", () => {
  const manifest = {
    elements: {
      a: {
        bounds: [
          [-0.4, 0.7, 0],
          [-0.2, 1.2, 0.1],
        ],
      },
      b: {
        bounds: [
          [0.2, 0.7, 0],
          [0.4, 1.2, 0.1],
        ],
      },
    },
  } as unknown as AtlasManifest;
  expect(focusBounds(manifest, ["missing"], "neck")).toBeNull();
  expect(focusBounds(manifest, ["a", "b"], "arms")).toEqual(
    manifest.elements.b.bounds,
  );
  expect(focusBounds(manifest, ["a", "b"])).toEqual([
    [-0.4, 0.7, 0],
    [0.4, 1.2, 0.1],
  ]);
});

it("uses the short orbit path without crossing through the model, and finishes exactly", () => {
  const from = (179 * Math.PI) / 180,
    to = (-179 * Math.PI) / 180;
  expect(shortestAngle(from, to) - from).toBeCloseTo((2 * Math.PI) / 180);
  expect(cameraAngle("back", "triceps")).toBeGreaterThan(Math.PI / 2);
  expect(cameraEase(0)).toBe(0);
  expect(cameraEase(1)).toBe(1);
  expect(cameraEase(0.5)).toBeGreaterThan(0.5);
});
