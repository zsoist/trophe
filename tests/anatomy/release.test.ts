import { it, expect } from "vitest";
import { activeAtlasRelease } from "../../lib/anatomy/release";
it("fails closed unless both explicit flag and pinned release exist", () => {
  expect(activeAtlasRelease("true")).toBeNull();
  expect(activeAtlasRelease(undefined, "a".repeat(64))).toBeNull();
  expect(activeAtlasRelease("true", "https://other/manifest")).toBeNull();
  expect(activeAtlasRelease("true", "a".repeat(64))).toBe("a".repeat(64));
});
