import { expect, it } from "vitest";
import source from "./catalogue.fixture.json";
import supplement from "./authored.fixture.json";
import {
  withAuthored,
  validateAuthored,
  type AuthoredSupplement,
} from "../../lib/anatomy/authored";
import { validateAtlas } from "../../lib/anatomy/validation";
import { workoutContext, workoutFocus } from "../../lib/anatomy/workout-focus";
import {
  conceptForElement,
  selectionElements,
} from "../../lib/anatomy/selection";
const base = validateAtlas(source);
const authored = {
  ...supplement,
  baseRelease: base.release,
} as unknown as AuthoredSupplement;
it("keeps source coverage and identities intact while admitting selectable authored muscles", () => {
  const before = JSON.stringify(base);
  const result = withAuthored(base, authored);
  expect(withAuthored(base)).toBe(base);
  expect(JSON.stringify(base)).toBe(before);
  expect(result.coverage).toBe(base.coverage);
  expect(result.source).toBe(base.source);
  const rectus = workoutFocus(result, "core").subgroups.find(
    (g) => g.id === "rectus-abdominis",
  )!;
  expect(rectus.elements).toHaveLength(2);
  const identity = conceptForElement(result, rectus.elements[0])!;
  expect(identity).toBe("AUTHORED_rectus_abdominis");
  expect(selectionElements(result, [identity])).toEqual(
    [...rectus.elements].sort(),
  );
  expect(
    workoutFocus(result, "back").subgroups.find(
      (g) => g.id === "latissimus-dorsi",
    )?.elements,
  ).toHaveLength(2);
  expect(
    workoutContext(result, []).bytes - workoutContext(base, []).bytes,
  ).toBe(380160);
  expect(() => validateAtlas(result)).toThrow();
  expect(validateAtlas(base)).toBe(base);
});
it("rejects an unmatched base, source-ID impersonation and oversized supplements", () => {
  expect(() =>
    withAuthored(base, { ...authored, baseRelease: "0".repeat(64) }),
  ).toThrow();
  const bad = structuredClone(authored);
  bad.muscles[0].elements[0].id = "FJ3259";
  expect(() => validateAuthored(bad)).toThrow();
  expect(() =>
    validateAuthored({
      ...authored,
      chunk: { ...authored.chunk, vertices: 1000000 },
    }),
  ).toThrow();
  expect(() =>
    validateAuthored({
      ...authored,
      chunk: { ...authored.chunk, url: "https://example.com/model.glb" },
    }),
  ).toThrow();
});
