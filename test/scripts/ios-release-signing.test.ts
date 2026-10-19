// iOS release signing tests cover checked-in Fastlane-managed profile pinning.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = path.join(process.cwd(), "scripts", "ios-release-signing.mjs");

function runSigningResult(args: string[]) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

describe("scripts/ios-release-signing.mjs", () => {
  it.each([
    ["--mode", "--manifest"],
    ["--mode", "-h"],
    ["--manifest", "-h"],
  ])("rejects missing values for %s before reading signing manifests", (...args) => {
    const result = runSigningResult(args);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Missing value for ${args[0]}.`);
    expect(result.stderr).not.toContain("ENOENT");
    expect(result.stdout).toBe("");
  });
});
