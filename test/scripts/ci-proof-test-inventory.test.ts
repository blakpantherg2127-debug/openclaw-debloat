import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  isPrExemptRuntimeTestFile,
  listPrExemptRuntimeTestFiles,
} from "../../scripts/lib/ci-proof-test-inventory.mts";
import { useAutoCleanupTempDirTracker } from "../helpers/temp-dir.js";

const tempDirs = useAutoCleanupTempDirTracker(afterEach);

it("defers unmapped Control UI E2E files while preserving existing inventory classifications", () => {
  const cwd = tempDirs.make("ui-pr-exempt-inventory-");
  const file = "ui/src/e2e/new-route-flow.e2e.test.ts";
  mkdirSync(dirname(join(cwd, file)), { recursive: true });
  writeFileSync(join(cwd, file), "");

  expect(isPrExemptRuntimeTestFile(file)).toBe(true);
  expect(listPrExemptRuntimeTestFiles(cwd)).toEqual([file]);
  // The UI selector retains this smoke file independently of its older exemption.
  expect(isPrExemptRuntimeTestFile("ui/src/e2e/control-ui-route-readiness.e2e.test.ts")).toBe(true);
  expect(
    isPrExemptRuntimeTestFile("ui/src/e2e/activity-run-inspector.real-gateway.e2e.test.ts"),
  ).toBe(false);
});
