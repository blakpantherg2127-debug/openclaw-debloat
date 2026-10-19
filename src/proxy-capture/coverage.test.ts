// Proxy capture coverage tests cover capture coverage accounting and summaries.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildDebugProxyCoverageReport } from "./coverage.js";

describe("debug proxy coverage report", () => {
  it("reports existing source modules for every transport seam", () => {
    for (const { id, modulePath } of buildDebugProxyCoverageReport().entries) {
      const sourcePath = fileURLToPath(new URL(`../../${modulePath}`, import.meta.url));
      expect(existsSync(sourcePath), `${id}: ${modulePath}`).toBe(true);
    }
  });
});
