import { expect, it } from "vitest";
import {
  ATLAS_MUSCLE_MAPPING,
  mappingForMuscle,
} from "../../lib/anatomy/mapping";
it("keeps all 26 stable product IDs and unresolved mappings explicit", () => {
  expect(Object.keys(ATLAS_MUSCLE_MAPPING)).toHaveLength(26);
  expect(mappingForMuscle("rotator-cuff")?.concepts).toHaveLength(4);
  expect(mappingForMuscle("latissimus-dorsi")).toMatchObject({
    scope: "unresolved",
    concepts: [],
  });
  expect(mappingForMuscle("__proto__")).toBeNull();
});
it("does not derive exercise roles or numerical activations from geometry", () => {
  for (const m of Object.values(ATLAS_MUSCLE_MAPPING)) {
    expect(m).not.toHaveProperty("role");
    expect(m).not.toHaveProperty("activation");
    expect(new Set(m.concepts).size).toBe(m.concepts.length);
  }
});
