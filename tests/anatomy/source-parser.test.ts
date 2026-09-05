import { execFileSync } from "node:child_process";
import { it, expect } from "vitest";
it("runs the real Python source and archive boundary suite in the existing CI runner", () => {
  const output = execFileSync(
    "python3",
    ["-m", "unittest", "discover", "-s", "tests/anatomy", "-p", "test_*.py"],
    { encoding: "utf8", timeout: 10000, stdio: ["ignore", "pipe", "pipe"] },
  );
  expect(output).toBe("");
});
