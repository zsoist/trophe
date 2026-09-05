import { describe, it, expect } from "vitest";
import {
  selectionElements,
  conceptForElement,
  visibleSelection,
} from "../../lib/anatomy/selection";
import type { AtlasManifest } from "../../lib/anatomy/types";
const manifest = {
  concepts: {
    FMA1: { id: "FMA1", elements: ["FJ1", "FJ2"] },
    FMA2: { id: "FMA2", elements: ["FJ1"] },
  },
  elements: {
    FJ1: { concept_ids: ["FMA1", "FMA2"], system: "muscles" },
    FJ2: { concept_ids: ["FMA1"], system: "skeleton" },
  },
} as unknown as AtlasManifest;
describe("canonical atlas selection", () => {
  it("deduplicates compound geometry and preserves canonical picking", () => {
    expect(selectionElements(manifest, ["FMA1", "FMA2"])).toEqual([
      "FJ1",
      "FJ2",
    ]);
    expect(conceptForElement(manifest, "FJ1")).toBe("FMA2");
  });
  it("reports hidden target without changing selection", () => {
    expect(
      visibleSelection(manifest, "FMA2", new Set(["skeleton"]), new Set()),
    ).toEqual({ visible: [], hidden: ["FJ1"] });
  });
  it("handles unmapped selection explicitly", () => {
    expect(selectionElements(manifest, ["FMA404"])).toEqual([]);
    expect(conceptForElement(manifest, "FJ404")).toBeNull();
  });
});
