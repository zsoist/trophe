import { expect, it } from "vitest";
import { browseConcepts } from "../../lib/anatomy/browse";
import type { AtlasManifest } from "../../lib/anatomy/types";
const manifest = {
  elements: {
    L: { system: "skeleton", concept_ids: ["FMA9611", "LEFT"] },
    R: { system: "skeleton", concept_ids: ["FMA9611", "RIGHT"] },
  },
  concepts: {
    FMA9611: {
      id: "FMA9611",
      source_names: ["femur"],
      elements: ["L", "R"],
      laterality: "bilateral",
    },
    LEFT: {
      id: "LEFT",
      source_names: ["left femur"],
      elements: ["L"],
      laterality: "left",
    },
    RIGHT: {
      id: "RIGHT",
      source_names: ["right femur"],
      elements: ["R"],
      laterality: "right",
    },
    META: {
      id: "META",
      source_names: ["source concept without geometry"],
      elements: [],
      laterality: "unspecified",
    },
  },
} as unknown as AtlasManifest;
const options = {
  query: "",
  system: "",
  side: "",
  group: "",
  fullCatalogue: false,
};
it("browses concrete represented identities but keeps all source concepts searchable", () => {
  expect(browseConcepts(manifest, options).map((c) => c.id)).toEqual([
    "LEFT",
    "RIGHT",
  ]);
  expect(
    browseConcepts(manifest, { ...options, query: " FMA9611 " }),
  ).toHaveLength(1);
  expect(browseConcepts(manifest, { ...options, query: "META" })).toHaveLength(
    1,
  );
  expect(
    browseConcepts(manifest, { ...options, fullCatalogue: true }),
  ).toHaveLength(4);
});
it("combines pinned group membership with side and system without replacing identity", () => {
  expect(
    browseConcepts(manifest, {
      ...options,
      group: "femur",
      side: "left",
      system: "skeleton",
    }).map((c) => c.id),
  ).toEqual(["LEFT"]);
  expect(
    browseConcepts(manifest, { ...options, group: "femur", system: "muscles" }),
  ).toEqual([]);
});
