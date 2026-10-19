import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as buildAll from "../../scripts/build-all.mts";
import { acquireDistArtifactOwnership } from "../../scripts/lib/dist-artifact-lock.mts";
import * as artifactOwnership from "../../scripts/lib/dist-artifact-ownership.mts";
import { prepareVitestRuntime } from "../../scripts/lib/vitest-build-prerequisites.mts";
import { prepareTestRuntime } from "../../scripts/prepare-vitest-runtime.mts";
import * as sourceRunner from "../../scripts/run-node.mts";
import * as postbuild from "../../scripts/runtime-postbuild.mts";
import * as gatewayBindings from "../../src/daemon/managed-gateway-bindings.js";
import * as serviceOperation from "../../src/daemon/service-operation-lock.js";
import * as gatewayService from "../../src/daemon/service.js";
import * as systemdFiles from "../../src/daemon/systemd-service-files.js";
import { createDeferred } from "../helpers/promise.js";
import { useAutoCleanupTempDirTracker } from "../helpers/temp-dir.js";

const commands = vi.hoisted(() => ({ prepare: vi.fn() }));
vi.mock("../../scripts/lib/managed-child-process.mts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../scripts/lib/managed-child-process.mts")>()),
  runManagedCommand: commands.prepare,
}));
const tempDirs = useAutoCleanupTempDirTracker(afterEach);
let root: string;
let env: NodeJS.ProcessEnv;

beforeEach(async () => {
  root = tempDirs.make("test-runtime-preparation-");
  env = { HOME: root, OPENCLAW_STATE_DIR: path.join(root, "state"), OPENCLAW_RUNNER_LOG: "0" };
  // Keep artifact ownership inside the fixture even when TMPDIR is in another checkout.
  await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ name: "openclaw" }));
  await fs.writeFile(path.join(root, "pnpm-workspace.yaml"), "packages: []\n");
  await fs.mkdir(path.join(root, "dist"));
  await fs.writeFile(path.join(root, "dist", "entry.js"), "original\n");
  vi.spyOn(gatewayBindings, "discoverManagedGatewayBindings").mockImplementation(
    async (bindingEnv, options) => (options?.includeInvoking ? [{ env: bindingEnv }] : []),
  );
  vi.spyOn(gatewayService, "readGatewayServiceState").mockResolvedValue({
    installed: false,
    loadState: { status: "not-loaded" },
    running: false,
    env: {},
    command: null,
    runtime: { status: "stopped", missingUnit: true },
  });
  vi.spyOn(gatewayBindings, "readManagedGatewayBindingState").mockImplementation((binding) =>
    gatewayService.readGatewayServiceState(gatewayService.resolveGatewayService(), {
      env: binding.env,
    }),
  );
  vi.spyOn(systemdFiles, "readSystemdServiceCommandLocation").mockRejectedValue(
    new Error("native service metadata unavailable"),
  );
  // Old automatic CLI preparation must reach the modeled EACCES, not a host service lock.
  vi.spyOn(serviceOperation, "withGatewayServiceOperationLock").mockImplementation(
    async (_env, callback) => callback(() => {}),
  );
  commands.prepare.mockReset().mockImplementation(async ({ args, env: commandEnv }) => {
    if (args[0] === "scripts/run-node.mjs") {
      return sourceRunner.runNodeMain({ cwd: root, args: args.slice(1), env: commandEnv });
    }
    if (args[0] !== "scripts/prepare-vitest-runtime.mjs") {
      throw new Error(`Unexpected prerequisite command: ${args.join(" ")}`);
    }
    return prepareTestRuntime(root, commandEnv);
  });
});
afterEach(() => vi.restoreAllMocks());

it.each(["current artifacts", "immutable deployment"])("does not rebuild %s", async (state) => {
  const build = vi.spyOn(buildAll, "runBuildAllSteps");
  if (state === "current artifacts") {
    vi.spyOn(artifactOwnership, "withDistArtifactOwnership").mockRejectedValue(
      Object.assign(new Error("read-only checkout"), { code: "EROFS" }),
    );
    vi.spyOn(sourceRunner, "resolveRunNodePreparation").mockReturnValue({
      build: false,
      runtime: false,
      immutable: false,
    });
    expect(await prepareTestRuntime(root, env)).toBe(0);
    expect(gatewayService.readGatewayServiceState).not.toHaveBeenCalled();
  } else {
    await fs.writeFile(
      path.join(root, "deployment.json"),
      JSON.stringify({ kind: "git", sourceHead: "a".repeat(40) }),
    );
    await expect(prepareTestRuntime(root, env)).rejects.toThrow("immutable deployment");
  }
  expect(build).not.toHaveBeenCalled();
  expect(await fs.readFile(path.join(root, "dist", "entry.js"), "utf8")).toBe("original\n");
});

it.each(["success", "failure", "unverified service"])(
  "does not compile when only postbuild is stale: %s",
  async (outcome) => {
    vi.spyOn(sourceRunner, "resolveRunNodePreparation").mockReturnValue({
      build: false,
      runtime: true,
      immutable: false,
    });
    const build = vi.spyOn(buildAll, "runBuildAllSteps");
    const sync = vi.spyOn(postbuild, "runRuntimePostBuild");
    if (outcome === "unverified service") {
      vi.mocked(gatewayService.readGatewayServiceState).mockRejectedValue(new Error("unavailable"));
    } else {
      sync.mockImplementation(() => {
        if (outcome === "failure") {
          throw new Error("postbuild failed");
        }
      });
    }
    if (outcome === "failure") {
      await expect(prepareTestRuntime(root, env)).rejects.toThrow("postbuild failed");
    } else {
      expect(await prepareTestRuntime(root, env)).toBe(outcome === "unverified service" ? 1 : 0);
    }
    if (outcome !== "success") {
      await expect(
        fs.access(path.join(root, "dist", ".runtime-postbuildstamp")),
      ).rejects.toMatchObject({ code: "ENOENT" });
    }
    if (outcome === "unverified service") {
      expect(sync).not.toHaveBeenCalled();
      expect(await fs.readFile(path.join(root, "dist", "entry.js"), "utf8")).toBe("original\n");
    } else {
      expect(sync).toHaveBeenCalledOnce();
    }
    expect(build).not.toHaveBeenCalled();
  },
);

it("joins a canceled compiler before releasing checkout ownership", async () => {
  const controller = new AbortController();
  const started = createDeferred();
  const finish = createDeferred();
  const runBuild = buildAll.runBuildAllSteps;
  const finalize = vi.fn(() => true);
  vi.spyOn(buildAll, "runBuildAllSteps").mockImplementation((profile, params) =>
    runBuild(profile, {
      ...params,
      logger: { error() {}, warn() {} },
      steps: [{ label: "fixture-compiler", args: [] }],
      resolveCacheState: () => ({ cacheable: false, fresh: false, reason: "no-cache" }),
      finalizeCache: finalize,
      runStep: async () => {
        started.resolve();
        await finish.promise;
        return { status: 0 };
      },
    }),
  );
  const attempt = prepareTestRuntime(root, env, controller.signal);
  try {
    await Promise.race([started.promise, attempt]);
    controller.abort();
    expect(
      await fs.readFile(path.join(root, ".artifacts", "dist-artifacts.lock", "owner.json"), "utf8"),
    ).toContain(String(process.pid));
  } finally {
    finish.resolve();
    await expect(attempt).rejects.toMatchObject({ name: "AbortError" });
  }
  expect(finalize).not.toHaveBeenCalled();
  const next = await acquireDistArtifactOwnership(root);
  await next.release();
});

it("keeps UI preparation current-head even after another runtime group was prepared", async () => {
  commands.prepare.mockResolvedValueOnce(7);
  expect(
    await prepareVitestRuntime([{ configs: ["test/vitest/vitest.ui-e2e.config.ts"] }], env, {
      runtimePrepared: true,
    }),
  ).toBe(7);
  expect(commands.prepare).toHaveBeenCalledWith(
    expect.objectContaining({
      args: ["scripts/prepare-vitest-runtime.mjs", "--require-current-head"],
    }),
  );
});
