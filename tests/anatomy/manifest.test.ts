import { expect, it } from "vitest";
import { safeAtlasUrl, validateChunkBytes } from "../../lib/anatomy/validation";
it("only serves release-scoped local atlas paths", () => {
  expect(safeAtlasUrl("/anatomy/" + "a".repeat(64) + "/bones-0.glb")).toBe(
    true,
  );
  for (const u of [
    "https://evil/a.glb",
    "/anatomy/../secret",
    "//evil/a.glb",
    "/anatomy/a/x?key=z",
  ])
    expect(safeAtlasUrl(u)).toBe(false);
});
it("rejects non-GLB and external buffer references", () => {
  expect(() => validateChunkBytes(new ArrayBuffer(4))).toThrow();
});
const glb = (json: object) => {
  const raw = new TextEncoder().encode(JSON.stringify(json));
  const n = Math.ceil(raw.length / 4) * 4;
  const b = new ArrayBuffer(20 + n),
    v = new DataView(b);
  v.setUint32(0, 0x46546c67, true);
  v.setUint32(4, 2, true);
  v.setUint32(8, b.byteLength, true);
  v.setUint32(12, n, true);
  v.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(b, 20).fill(32);
  new Uint8Array(b, 20, raw.length).set(raw);
  return b;
};
it("rejects external URI, animations, skins and decompression declarations beyond the cap", () => {
  for (const j of [
    { buffers: [{ uri: "https://other.test/private.bin" }] },
    { images: [{ uri: "data:image/png;base64,AA" }] },
    { animations: [{}] },
    { skins: [{}] },
    { buffers: [{ byteLength: 1024 ** 3 }] },
  ])
    expect(() => validateChunkBytes(glb(j))).toThrow();
});
import fixture from "./catalogue.fixture.json";
import { validateAtlas } from "../../lib/anatomy/validation";
it("checks typed membership and fragment correspondence independently of URL hashes", () => {
  expect(validateAtlas(fixture).coverage.converted).toBe(2);
  const broken = structuredClone(fixture);
  Object.values(broken.elements)[0].fragments[0].node = "FJ999999-0";
  expect(() => validateAtlas(broken)).toThrow();
  const wrongTree = structuredClone(fixture);
  Object.values(wrongTree.concepts)[0].memberships.isa.elements = ["FJ999999"];
  expect(() => validateAtlas(wrongTree)).toThrow();
});
