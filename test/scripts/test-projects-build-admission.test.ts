import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setImmediate as nextTurn } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveVitestCliEntry } from "../../scripts/lib/vitest-build-prerequisites.mts";
import { createPatternFileHelper } from "../helpers/pattern-file.js";
import { createDeferred, withTestTimeout } from "../helpers/promise.js";
import { useAutoCleanupTempDirTracker } from "../helpers/temp-dir.js";

const commands = vi.hoisted(() => ({
  prepare: vi.fn(),
  prepareE2e: vi.fn(),
  reader: vi.fn(),
  uiAssets: vi.fn(),
  sourceLoader: vi.fn(),
  runtimeBuildId: "fixture-runtime",
}));
vi.mock("../../scripts/lib/managed-child-process.mts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../scripts/lib/managed-child-process.mts")>()),
  runManagedCommand: commands.prepare,
}));
vi.mock("../../scripts/lib/vitest-build-prerequisites.mts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../scripts/lib/vitest-build-prerequisites.mts")>()),
  prepareE2eVitestRuntime: commands.prepareE2e,
}));
vi.mock("../../scripts/run-vitest.mts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../scripts/run-vitest.mts")>()),
  spawnWatchedVitestProcess: commands.reader,
}));
vi.mock("../../scripts/lib/vitest-shard-timings.mts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../scripts/lib/vitest-shard-timings.mts")>()),
  readShardTimings: () => new Map(),
  writeShardTimings: () => {},
}));
vi.mock("../../src/infra/control-ui-assets.ts", () => ({
  inspectControlUiRootAssets: commands.uiAssets,
}));
// Vitest owns source transforms here; native CLI cases cover tooling registration.
vi.mock("../../scripts/lib/tsx-cli-shim.mjs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../scripts/lib/tsx-cli-shim.mjs")>()),
  registerToolingTsx: commands.sourceLoader,
}));

const modelTarget = "src/agents/embedded-agent-runner/model-resolution-consistency.test.ts";
const patternFiles = createPatternFileHelper("plugin-build-selection-");
const tempDirs = useAutoCleanupTempDirTracker(afterEach);
const e2eTarget = "test/openclaw-launcher-version.e2e.test.ts";
const nativeHostTarget = "extensions/browser/src/browser/extension-install.native-host.e2e.test.ts";
const e2eConfig = "test/vitest/vitest.e2e.config.ts";
let originalArgv: string[];
let originalExitCode: typeof process.exitCode;
let terminal: ReturnType<typeof createDeferred<unknown>>;
const testProjectsUrl = new URL("../../scripts/test-projects.mts", import.meta.url).href;
let startCount = 0;

beforeEach(() => {
  commands.prepare.mockReset().mockResolvedValue(0);
  commands.prepareE2e.mockReset().mockResolvedValue({ OPENCLAW_E2E_USE_PREBUILT_DIST: "1" });
  commands.uiAssets.mockReset().mockReturnValue({ kind: "ready", indexPath: "fixture-index" });
  commands.sourceLoader.mockReset().mockResolvedValue(undefined);
  commands.runtimeBuildId = "fixture-runtime";
  const readFileSync = fs.readFileSync;
  const buildInfoPath = path.resolve(import.meta.dirname, "../../dist/build-info.json");
  vi.spyOn(fs, "readFileSync").mockImplementation(
    (file, options?: BufferEncoding | fs.ReadFileSyncOptions | null) => {
      const readOptions = typeof options === "string" ? { encoding: options } : (options ?? {});
      // Mocked builders publish fixture metadata, never borrow the checkout's dist.
      if (file === buildInfoPath && readOptions.encoding === "utf8") {
        return JSON.stringify({ buildId: commands.runtimeBuildId });
      }
      return readFileSync(file, readOptions);
    },
  );
  commands.reader.mockReset().mockImplementation(() => ({
    completion: Promise.resolve({
      code: 0,
      signal: null,
      groupJoined: process.platform !== "win32",
    }),
    getForwardedSignal: () => undefined,
  }));
  originalArgv = process.argv;
  originalExitCode = process.exitCode;
  process.exitCode = 0;
  vi.stubEnv("OPENCLAW_TEST_PROJECTS_PARALLEL", "");
  vi.stubEnv("OPENCLAW_NODE_TEST_PLAN_CONTINUE_ON_FAILURE", "");
  vi.stubEnv("OPENCLAW_BUILD_PRIVATE_QA", "");
  vi.stubEnv("OPENCLAW_E2E_SKIP_BUILD", "");
  vi.stubEnv("OPENCLAW_E2E_USE_PREBUILT_DIST", "");
  vi.stubEnv("OPENCLAW_UI_E2E_SKIP_REAL_GATEWAY", "");
  vi.stubEnv("OPENCLAW_VITEST_INCLUDE_FILE", "");
  terminal = createDeferred<unknown>();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation((value: unknown) => {
    if (value instanceof Error || /^\[test\] (passed|failed|skipped) /u.test(String(value))) {
      terminal.resolve(value);
    }
  });
});

afterEach(() => {
  patternFiles.cleanup();
  process.argv = originalArgv;
  process.exitCode = originalExitCode ?? 0;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function start(args: string[]) {
  process.argv = [process.execPath, "scripts/test-projects.mts", ...args];
  // Replay the command entry while retaining its immutable planner dependencies.
  const entryUrl = `${testProjectsUrl}?case=${startCount}`;
  startCount += 1;
  await import(entryUrl);
}

describe("full-suite timing metadata", () => {
  it("records inherited include selections without replacing whole-config history", async () => {
    vi.stubEnv("OPENCLAW_TEST_PROJECTS_TIMINGS", "1");
    const timings = await import("../../scripts/lib/vitest-shard-timings.mts");
    const actual = await vi.importActual<
      typeof import("../../scripts/lib/vitest-shard-timings.mts")
    >("../../scripts/lib/vitest-shard-timings.mts");
    const { runTestProjects } = await import("../../scripts/test-projects-run.mts");
    const root = tempDirs.make("inherited-timing-");
    const timingFile = path.join(root, "timings.json");
    vi.stubEnv("OPENCLAW_TEST_PROJECTS_TIMINGS_PATH", timingFile);
    vi.stubEnv("OPENCLAW_VITEST_SHARD_NAME", "same-parent");
    const config = "test/vitest/vitest.tooling.config.ts";
    actual.writeShardTimings([actual.createShardTimingSample({ config }, 999_999)], root);
    const writeTimings = vi
      .spyOn(timings, "writeShardTimings")
      .mockImplementation(actual.writeShardTimings);
    commands.prepare.mockResolvedValue(0);
    commands.reader.mockImplementation(() => ({
      completion: Promise.resolve({ code: 0, signal: null, groupJoined: true }),
      getForwardedSignal: () => undefined,
    }));
    const files = ["test/scripts/run-with-env.test.ts", "test/scripts/run-node.test.ts"];
    for (const file of files) {
      const includeFile = patternFiles.writePatternFile("timing-include.json", [file]);
      vi.stubEnv("OPENCLAW_VITEST_INCLUDE_FILE", includeFile);
      await runTestProjects(async () => {}, [config]);
      expect(fs.existsSync(includeFile)).toBe(true);
      expect(commands.reader.mock.lastCall?.[0].env.OPENCLAW_VITEST_INCLUDE_FILE).toBe(includeFile);
    }
    const inheritedFile = process.env.OPENCLAW_VITEST_INCLUDE_FILE;
    fs.writeFileSync(inheritedFile!, "{}");
    await runTestProjects(async () => {}, [files[0]!]);
    const inlineFile = commands.reader.mock.lastCall?.[0].env.OPENCLAW_VITEST_INCLUDE_FILE;
    expect(inlineFile).not.toBe(inheritedFile);
    expect(fs.existsSync(inheritedFile!)).toBe(true);
    expect(fs.existsSync(inlineFile)).toBe(false);
    const planner = await import("../../scripts/test-projects.test-support.mts");
    const empty = vi.spyOn(planner, "buildFullSuiteVitestRunPlans").mockReturnValue([]);
    await runTestProjects(async () => {}, []);
    empty.mockRestore();
    expect(commands.reader).toHaveBeenCalledTimes(3);
    const samples = writeTimings.mock.calls.flatMap(([entries]) => entries);
    expect(samples).toHaveLength(3);
    expect(new Set(samples.map((sample) => sample?.config)).size).toBe(3);
    expect(samples.every((sample) => sample?.includePatternCount === 1)).toBe(true);
    const stored = JSON.parse(fs.readFileSync(timingFile, "utf8")).configs;
    expect(stored[config].averageMs).toBe(999_999);
    expect(Object.keys(stored)).toHaveLength(4);
    vi.stubEnv("OPENCLAW_VITEST_INCLUDE_FILE", "");
    const cliConfig = "test/vitest/vitest.cli.config.ts";
    await runTestProjects(async () => {}, [cliConfig]);
    expect(writeTimings.mock.lastCall?.[0]).toEqual([
      expect.objectContaining({ config: cliConfig, includePatternCount: 0 }),
    ]);
  });

  it.each([false, true])(
    "carries chunk targets without changing launch selection (inherited=%s)",
    async (inherited) => {
      vi.stubEnv("OPENCLAW_TEST_PROJECTS_PARALLEL", "2");
      vi.stubEnv("OPENCLAW_VITEST_MAX_WORKERS", "1");
      vi.stubEnv("OPENCLAW_VITEST_SHARD_NAME", "same-parent");
      vi.stubEnv("OPENCLAW_VITEST_ENABLE_MAGLEV", "0");
      const planner = await import("../../scripts/test-projects.test-support.mts");
      const timings = await import("../../scripts/lib/vitest-shard-timings.mts");
      const { runTestProjects } = await import("../../scripts/test-projects-run.mts");
      const files = ["test/scripts/run-with-env.test.ts", "test/scripts/run-node.test.ts"];
      const includeFile = inherited
        ? patternFiles.writePatternFile("chunk-include.json", [files[0]!])
        : undefined;
      if (includeFile) {
        vi.stubEnv("OPENCLAW_VITEST_INCLUDE_FILE", includeFile);
      }
      const config = "test/vitest/vitest.tooling.config.ts";
      vi.spyOn(planner, "buildFullSuiteVitestRunPlans").mockReturnValue(
        files.map((file) => ({
          config,
          forwardedArgs: [file],
          timingTargets: [file],
          includePatterns: null,
          watchMode: false,
        })),
      );
      const writeTimings = vi.spyOn(timings, "writeShardTimings");
      commands.prepare.mockResolvedValue(0);
      commands.reader.mockImplementation(() => ({
        completion: Promise.resolve({ code: 0, signal: null, groupJoined: true }),
        getForwardedSignal: () => undefined,
      }));

      await runTestProjects(async () => {}, []);

      expect(commands.reader).toHaveBeenCalledTimes(2);
      const launches = commands.reader.mock.calls.map(([input]) => input);
      expect(launches.map((input) => input.pnpmArgs)).toEqual(
        files.map((file) => [
          "exec",
          "node",
          "--no-maglev",
          "--no-concurrent-sparkplug",
          resolveVitestCliEntry(),
          "run",
          "--config",
          config,
          file,
        ]),
      );
      for (const input of launches) {
        if (includeFile) {
          expect(input.env.OPENCLAW_VITEST_INCLUDE_FILE).toBe(includeFile);
        } else {
          expect(input.env.OPENCLAW_VITEST_INCLUDE_FILE).toBeFalsy();
        }
        expect(input.env.OPENCLAW_VITEST_MAX_WORKERS).toBe("1");
      }
      expect(writeTimings).toHaveBeenCalledTimes(1);
      const samples = writeTimings.mock.calls[0]?.[0] ?? [];
      expect(samples).toHaveLength(2);
      expect(new Set(samples.map((sample) => sample?.config)).size).toBe(2);
      for (const sample of samples) {
        expect(sample).toMatchObject({ baseConfig: config, includePatternCount: 1 });
      }
    },
  );
});

describe("packed CI config continuation", () => {
  const configs = ["test/vitest/vitest.logging.config.ts", "test/vitest/vitest.process.config.ts"];
  it.each([
    { name: "default failure", enabled: false, code: 1, expected: 1 },
    { name: "requested ordinary failure", enabled: true, code: 1, expected: 2 },
    { name: "unknown exit", enabled: true, code: null, expected: 1 },
    { name: "timeout", enabled: true, code: 1, timeout: true, expected: 1 },
    { name: "signal", enabled: true, code: 1, signaled: true, expected: 1 },
    { name: "unjoined child", enabled: true, code: 1, unjoined: true, expected: 1 },
    { name: "rejected child", enabled: true, code: 1, rejected: true, expected: 1 },
  ])("preserves complete selection and failure status for $name", async (scenario) => {
    vi.spyOn(process, "platform", "get").mockReturnValue("linux");
    vi.stubEnv("CI", "1");
    vi.stubEnv("OPENCLAW_TEST_PROJECTS_PARALLEL", "1");
    vi.stubEnv("OPENCLAW_VITEST_SHARD_NAME", "serial-fixture");
    vi.stubEnv("OPENCLAW_VITEST_FS_MODULE_CACHE_ROOT", "");
    vi.stubEnv("OPENCLAW_VITEST_FS_MODULE_CACHE_PATH", "");
    vi.stubEnv("OPENCLAW_NODE_TEST_PLAN_CONTINUE_ON_FAILURE", scenario.enabled ? "1" : "");
    const { runTestProjects } = await import("../../scripts/test-projects-run.mts");
    const selected: string[] = [];
    commands.reader.mockImplementation(({ pnpmArgs, onNoOutputTimeout }) => {
      const first = selected.length === 0;
      selected.push(pnpmArgs[pnpmArgs.indexOf("--config") + 1]);
      if (first && scenario.timeout) {
        onNoOutputTimeout();
      }
      return {
        completion:
          first && scenario.rejected
            ? Promise.reject(new Error("child completion rejected"))
            : Promise.resolve({
                code: first ? scenario.code : 0,
                signal: first && scenario.signaled ? "SIGTERM" : null,
                groupJoined: !(first && scenario.unjoined),
              }),
        getForwardedSignal: () => undefined,
      };
    });
    const exit = vi.fn(async () => {});
    const running = runTestProjects(exit, configs);
    if (scenario.rejected) {
      await expect(running).rejects.toThrow("child completion rejected");
    } else {
      await running;
    }
    expect(console.error).toHaveBeenCalledWith("[test] inner parallelism 1");
    expect(selected).toEqual(configs.slice(0, scenario.expected));
    if (scenario.signaled) {
      expect(exit).toHaveBeenCalledWith("SIGTERM");
    } else if (!scenario.rejected) {
      expect(process.exitCode).toBe(scenario.code === null || scenario.timeout ? 2 : 1);
    }
  });
});

describe("automatic exact-target admission", () => {
  const outputArgs = ["--reporter=dot", "--coverage.enabled=false"];
  const files = [
    modelTarget,
    "test/scripts/run-node-lifecycle.test.ts",
    "extensions/memory-lancedb/config.test.ts",
  ];
  beforeEach(async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("linux");
    vi.stubEnv("CI", "1");
    vi.stubEnv("GITHUB_ACTIONS", "");
    vi.stubEnv("OPENCLAW_TEST_PROJECTS_SERIAL", "");
    vi.stubEnv("OPENCLAW_VITEST_FS_MODULE_CACHE_ROOT", "");
    vi.stubEnv("OPENCLAW_VITEST_FS_MODULE_CACHE_PATH", "");
    vi.stubEnv("OPENCLAW_VITEST_MAX_WORKERS", "2");
    vi.spyOn(os, "availableParallelism").mockReturnValue(8);
    vi.spyOn(os, "totalmem").mockReturnValue(24 * 1024 ** 3);
    commands.prepare.mockResolvedValue(0);
    const planner = await import("../../scripts/test-projects.test-support.mts");
    expect(planner.findUnmatchedExplicitTestTargets(files, process.cwd())).toEqual([]);
  });

  it.each([
    { name: "CI=1", expected: 2 },
    { name: "changed targets", changed: true, expected: 2 },
    { name: "changed targets with serial override", changed: true, serial: "1", expected: 1 },
    { name: "CI=true", ci: "true", expected: 2 },
    { name: "unresolved config outputs", args: [], expected: 1 },
    { name: "console reporter without coverage override", args: ["--reporter=dot"], expected: 1 },
    { name: "coverage override without reporter", args: ["--coverage.enabled=false"], expected: 1 },
    {
      name: "JSON without owner",
      args: ["--reporter=json", "--coverage.enabled=false"],
      expected: 1,
    },
    {
      name: "GitHub summary",
      args: ["--reporter=github-actions", "--coverage.enabled=false"],
      expected: 1,
    },
    { name: "coverage destination", args: ["--coverage"], expected: 1 },
    { name: "file destination", args: ["--outputFile=report.json"], expected: 1 },
    { name: "file reporter", args: ["--reporter=html"], expected: 1 },
    { name: "plural file reporter", args: ["--reporters=html"], expected: 1 },
    { name: "custom reporter", args: ["--reporter=./custom-reporter.mjs"], expected: 1 },
    { name: "local", ci: "", expected: 1 },
    { name: "constrained CPU", cpus: 4, expected: 1 },
    { name: "unknown memory", gib: Number.NaN, expected: 1 },
    { name: "explicit parallel", parallel: "3", expected: 3 },
    { name: "explicit serial", serial: "1", expected: 1 },
    { name: "portable", portable: true, expected: 1 },
    { name: "caller cache leaf", callerLeaf: true, expected: 1 },
  ])(
    "preserves resolved specs and policy for $name",
    async ({ ci, cpus, gib, parallel, serial, portable, callerLeaf, args, changed, expected }) => {
      vi.stubEnv("CI", ci ?? "1");
      vi.stubEnv("OPENCLAW_TEST_PROJECTS_PARALLEL", parallel ?? "");
      vi.stubEnv("OPENCLAW_TEST_PROJECTS_SERIAL", serial ?? "");
      if (portable) {
        vi.spyOn(process, "platform", "get").mockReturnValue("win32");
      }
      if (callerLeaf) {
        const root = tempDirs.make("caller-cache-");
        vi.stubEnv("OPENCLAW_VITEST_FS_MODULE_CACHE_ROOT", root);
        vi.stubEnv("OPENCLAW_VITEST_FS_MODULE_CACHE_PATH", path.join(root, "leaf"));
      }
      vi.mocked(os.availableParallelism).mockReturnValue(cpus ?? 8);
      vi.mocked(os.totalmem).mockReturnValue((gib ?? 24) * 1024 ** 3);
      const planner = await import("../../scripts/test-projects.test-support.mts");
      if (changed) {
        const lanes = await import("../../scripts/changed-lanes.mts");
        vi.spyOn(lanes, "listChangedPathsFromGit").mockReturnValue(files);
      }
      const produced = vi.spyOn(planner, "createVitestRunSpecs");
      const { runTestProjects } = await import("../../scripts/test-projects-run.mts");
      const selections: Array<{ config: string; include: string[] | null; workers: string }> = [];
      let active = 0;
      let peak = 0;
      commands.reader.mockImplementation(({ env, pnpmArgs }) => {
        selections.push({
          config: pnpmArgs[pnpmArgs.indexOf("--config") + 1],
          include: env.OPENCLAW_VITEST_INCLUDE_FILE
            ? JSON.parse(fs.readFileSync(env.OPENCLAW_VITEST_INCLUDE_FILE, "utf8"))
            : null,
          workers: env.OPENCLAW_VITEST_MAX_WORKERS,
        });
        active += 1;
        peak = Math.max(peak, active);
        return {
          completion: nextTurn().then(() => {
            active -= 1;
            return { code: 0, signal: null, groupJoined: !portable };
          }),
          getForwardedSignal: () => undefined,
        };
      });
      await runTestProjects(async () => {}, [
        ...(changed ? ["--changed", "origin/main"] : files),
        ...(args ?? outputArgs),
      ]);
      const specs = produced.mock.results[0]!.value as ReturnType<
        typeof planner.createVitestRunSpecs
      >;
      expect(specs.length).toBeGreaterThanOrEqual(3);
      if (changed) {
        expect(specs.some((spec) => spec.pnpmArgs.includes("--passWithNoTests=false"))).toBe(false);
      }
      expect(peak).toBe(expected);
      const actual = selections.map(({ config, include }) => ({ config, include }));
      const planned = specs.map((spec) => ({ config: spec.config, include: spec.includePatterns }));
      // Explicit parallelism retains its timing order; automatic admission keeps native plan order.
      expect(
        parallel ? actual.toSorted((a, b) => a.config.localeCompare(b.config)) : actual,
      ).toEqual(parallel ? planned.toSorted((a, b) => a.config.localeCompare(b.config)) : planned);
      expect(selections.every(({ workers }) => workers === "2")).toBe(true);
      expect(process.exitCode).toBe(0);
    },
  );

  it.each([
    { outcome: "success", mode: "automatic" },
    { outcome: "failure", mode: "automatic" },
    { outcome: "SIGTERM", mode: "automatic" },
    { outcome: "success", mode: "explicit parallel" },
    { outcome: "success", mode: "full suite" },
  ])(
    "joins the real Gateway plan barrier before later admission and disposal ($mode, $outcome)",
    async ({ outcome, mode }) => {
      const workerOwner = await import("../../scripts/lib/vitest-worker-run.mts");
      const original = workerOwner.createVitestWorkerRun;
      const events: string[] = [];
      vi.spyOn(workerOwner, "createVitestWorkerRun").mockImplementation((...args) => {
        const worker = original(...args);
        const dispose = worker.dispose.bind(worker);
        vi.spyOn(worker, "dispose").mockImplementation(async () => {
          events.push("dispose");
          await dispose();
          events.push("disposed");
        });
        return worker;
      });
      const { runTestProjects } = await import("../../scripts/test-projects-run.mts");
      const gatewayFile =
        mode === "automatic"
          ? "src/gateway/call.test.ts"
          : "src/gateway/server.sessions.fixture-lifecycle.test.ts";
      const barrierFiles = ["src/utils.test.ts", gatewayFile, modelTarget];
      const configs = [
        "test/vitest/vitest.unit-fast-fake-timers.config.ts",
        mode === "automatic"
          ? "test/vitest/vitest.gateway.config.ts"
          : "test/vitest/vitest.gateway-server.config.ts",
        "test/vitest/vitest.agents-embedded-agent.config.ts",
      ];
      const planner = await import("../../scripts/test-projects.test-support.mts");
      expect(planner.findUnmatchedExplicitTestTargets(barrierFiles, process.cwd())).toEqual([]);
      expect(
        planner.buildVitestRunPlans([...barrierFiles, ...outputArgs]).map(({ config }) => config),
      ).toEqual(configs);
      if (mode !== "automatic") {
        vi.stubEnv("OPENCLAW_TEST_PROJECTS_PARALLEL", "3");
        // Hold the ordinary/Gateway/ordinary order; timing weights have separate coverage.
        vi.spyOn(planner, "orderFullSuiteSpecsForParallelRun").mockImplementation((specs) => specs);
      }
      if (mode === "full suite") {
        vi.spyOn(planner, "buildFullSuiteVitestRunPlans").mockReturnValue(
          configs.map((config, index) => ({
            config,
            forwardedArgs: [...outputArgs, barrierFiles[index]!],
            timingTargets: [barrierFiles[index]!],
            includePatterns: null,
            watchMode: false,
          })),
        );
      }
      const releases = configs.map(() => createDeferred());
      const admissions = configs.map(() => createDeferred());
      const selected: string[] = [];
      commands.reader.mockImplementation(({ pnpmArgs }) => {
        const config = pnpmArgs[pnpmArgs.indexOf("--config") + 1];
        const index = configs.indexOf(config);
        expect(index).toBeGreaterThanOrEqual(0);
        selected.push(config);
        events.push(`start:${index}`);
        admissions[index]!.resolve();
        return {
          completion: releases[index]!.promise.then(() => {
            events.push(`joined:${index}`);
            return {
              code: index === 1 && outcome === "failure" ? 1 : 0,
              signal: index === 1 && outcome === "SIGTERM" ? "SIGTERM" : null,
              groupJoined: true,
            };
          }),
          getForwardedSignal: () => undefined,
        };
      });
      const exit = vi.fn(async () => {});
      const running = runTestProjects(
        exit,
        mode === "full suite" ? outputArgs : [...barrierFiles, ...outputArgs],
      );
      try {
        for (let index = 0; index < 2; index++) {
          await withTestTimeout(
            Promise.race([admissions[index]!.promise, running]),
            5_000,
            "barrier admission",
          );
          expect(selected).toEqual(configs.slice(0, index + 1));
          expect(events).not.toContain("dispose");
          releases[index]!.resolve();
        }
        if (outcome === "success") {
          await withTestTimeout(
            Promise.race([admissions[2]!.promise, running]),
            5_000,
            "post-barrier admission",
          );
          expect(events).toEqual(["start:0", "joined:0", "start:1", "joined:1", "start:2"]);
        }
      } finally {
        releases.forEach((release) => release.resolve());
        await running;
      }
      expect(selected).toEqual(outcome === "success" ? configs : configs.slice(0, 2));
      expect(events.slice(-3)).toEqual([
        `joined:${outcome === "success" ? 2 : 1}`,
        "dispose",
        "disposed",
      ]);
      expect(exit.mock.calls).toEqual(outcome === "SIGTERM" ? [["SIGTERM"]] : []);
      expect(process.exitCode).toBe(outcome === "SIGTERM" ? 143 : outcome === "failure" ? 1 : 0);
    },
  );

  it.each(["failure", "unjoined", "rejection", "signal"])(
    "drains peers and stops later exact-target specs after %s",
    async (outcome) => {
      const { runTestProjects } = await import("../../scripts/test-projects-run.mts");
      const first = createDeferred<{
        code: number;
        signal: NodeJS.Signals | null;
        groupJoined: boolean;
      }>();
      const peer = createDeferred<{ code: number; signal: null; groupJoined: boolean }>();
      const admitted = createDeferred();
      let settled = false;
      commands.reader.mockImplementation(() => {
        if (commands.reader.mock.calls.length === 2) {
          admitted.resolve();
        }
        return {
          completion: commands.reader.mock.calls.length === 1 ? first.promise : peer.promise,
          getForwardedSignal: () => undefined,
        };
      });
      const running = runTestProjects(async () => {}, [...files, ...outputArgs]).finally(() => {
        settled = true;
      });
      const checked =
        outcome === "unjoined" || outcome === "rejection"
          ? expect(running).rejects.toThrow()
          : running;
      try {
        await withTestTimeout(
          Promise.race([admitted.promise, running]),
          5_000,
          "automatic admission",
        );
        expect(commands.reader).toHaveBeenCalledTimes(2);
        if (outcome === "rejection") {
          first.reject(new Error("child join rejected"));
        } else {
          first.resolve({
            code: outcome === "unjoined" ? 0 : 1,
            signal: outcome === "signal" ? "SIGTERM" : null,
            groupJoined: outcome !== "unjoined",
          });
        }
        await nextTurn();
        expect(commands.reader).toHaveBeenCalledTimes(2);
        expect(settled).toBe(false);
      } finally {
        first.resolve({ code: 0, signal: null, groupJoined: true });
        peer.resolve({ code: 0, signal: null, groupJoined: true });
        await checked;
      }
      expect(commands.reader).toHaveBeenCalledTimes(2);
      if (outcome === "failure") {
        expect(process.exitCode).toBe(1);
        expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/^\[test\] failed 2 /u));
      }
      if (outcome === "signal") {
        expect(process.exitCode).toBe(143);
      }
    },
  );
});

describe("cache lease completion", () => {
  beforeEach(() => {
    // The enclosing CI test worker owns its PATH; these fixtures exercise a new scheduler.
    vi.stubEnv("OPENCLAW_VITEST_FS_MODULE_CACHE_ROOT", "");
    vi.stubEnv("OPENCLAW_VITEST_FS_MODULE_CACHE_PATH", "");
  });

  it.each(["linux", "win32"] as const)(
    "preserves %s policy after an unverified preflight completion",
    async (platform) => {
      vi.spyOn(process, "platform", "get").mockReturnValue(platform);
      vi.stubEnv("OPENCLAW_TEST_PROJECTS_PARALLEL", "2");
      const { runTestProjects } = await import("../../scripts/test-projects-run.mts");
      let preflights = 0;
      let attempts = 0;
      commands.reader.mockImplementation(({ pnpmArgs }) => {
        if (pnpmArgs.includes("scripts/ensure-playwright-chromium.mts")) {
          preflights += 1;
        } else if (pnpmArgs.includes("test/vitest/vitest.ui-e2e.config.ts")) {
          attempts += 1;
        }
        return {
          completion: Promise.resolve({ code: 0, signal: null, groupJoined: false }),
          getForwardedSignal: () => undefined,
        };
      });
      const running = runTestProjects(async () => {}, [
        "test/vitest/vitest.ui-e2e.config.ts",
        "test/vitest/vitest.cli.config.ts",
      ]);
      if (platform === "win32") {
        await expect(running).resolves.toBeUndefined();
        expect(attempts).toBe(1);
      } else {
        await expect(running).rejects.toMatchObject({
          errors: [
            expect.objectContaining({
              message: "Cannot continue a Vitest cache lease without verified group completion",
            }),
          ],
        });
        expect(attempts).toBe(0);
      }
      expect(preflights).toBe(1);
    },
  );

  it.each([
    { signal: "SIGTERM", code: 143 },
    { signal: null, code: 143 },
    { signal: null, code: 0 },
    { signal: null, code: 1 },
  ] as const)(
    "fails on the first no-output timeout without retrying (signal=$signal, code=$code)",
    async ({ signal, code }) => {
      vi.stubEnv("CI", "true");
      vi.stubEnv("OPENCLAW_VITEST_NO_OUTPUT_RETRY", "1");
      const { runTestProjects } = await import("../../scripts/test-projects-run.mts");
      const exitBySignal = vi.fn(async () => {});
      commands.reader
        .mockImplementationOnce(({ onNoOutputTimeout }) => {
          onNoOutputTimeout();
          return {
            completion: Promise.resolve({ code, signal, groupJoined: true }),
            getForwardedSignal: () => undefined,
          };
        })
        .mockImplementation(() => ({
          completion: Promise.resolve({ code: 0, signal: null, groupJoined: true }),
          getForwardedSignal: () => undefined,
        }));

      await runTestProjects(exitBySignal, ["test/vitest/vitest.cli.config.ts"]);

      expect(process.exitCode).toBe(code === 0 || code === 1 ? 2 : 143);
      expect(commands.reader).toHaveBeenCalledTimes(1);
      expect(exitBySignal).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/^\[test\] failed /u));
      expect(console.error).not.toHaveBeenCalledWith(expect.stringMatching(/^\[test\] passed /u));
    },
  );

  it.each([
    { platform: "linux", concurrency: 1 },
    { platform: "linux", concurrency: 2 },
    { platform: "win32", concurrency: 1 },
    { platform: "win32", concurrency: 2 },
  ] as const)(
    "preserves $platform cache ownership through preflight and execution (concurrency=$concurrency)",
    async ({ platform, concurrency }) => {
      vi.spyOn(process, "platform", "get").mockReturnValue(platform);
      const cacheRoot = tempDirs.make("cache-policy-");
      vi.stubEnv("OPENCLAW_VITEST_FS_MODULE_CACHE_ROOT", cacheRoot);
      vi.stubEnv("OPENCLAW_TEST_PROJECTS_PARALLEL", String(concurrency));
      const planner = await import("../../scripts/test-projects.test-support.mts");
      const { runTestProjects } = await import("../../scripts/test-projects-run.mts");
      if (concurrency === 1) {
        vi.spyOn(planner, "buildFullSuiteVitestRunPlans").mockReturnValue(
          [
            "test/vitest/vitest.ui-e2e.config.ts",
            "test/vitest/vitest.cli.config.ts",
            "test/vitest/vitest.ui-e2e.config.ts",
          ].map((config) => ({
            config,
            forwardedArgs: [],
            includePatterns: null,
            watchMode: false,
          })),
        );
      }
      const firstPreflight = createDeferred<{ code: number; signal: null; groupJoined: boolean }>();
      const firstExecution = createDeferred<{ code: number; signal: null; groupJoined: boolean }>();
      const peer = createDeferred<{ code: number; signal: null; groupJoined: boolean }>();
      const started = createDeferred();
      const executionStarted = createDeferred();
      const paths: string[] = [];
      const uiPaths: string[] = [];
      let peerPath: string | undefined;
      let preflights = 0;
      let attempts = 0;
      const joined = { code: 0, signal: null, groupJoined: platform !== "win32" };
      commands.reader.mockImplementation(({ env, pnpmArgs }) => {
        const cache = env.OPENCLAW_VITEST_FS_MODULE_CACHE_PATH;
        paths.push(cache);
        let completion;
        if (pnpmArgs.includes("scripts/ensure-playwright-chromium.mts")) {
          uiPaths.push(cache);
          preflights += 1;
          completion = preflights === 1 ? firstPreflight.promise : Promise.resolve(joined);
        } else if (pnpmArgs.includes("test/vitest/vitest.ui-e2e.config.ts")) {
          uiPaths.push(cache);
          attempts += 1;
          completion = attempts === 1 ? firstExecution.promise : Promise.resolve(joined);
          executionStarted.resolve();
        } else {
          peerPath = cache;
          completion = peer.promise;
        }
        if (paths.length === (concurrency === 1 ? 1 : 2)) {
          started.resolve();
        }
        return { completion, getForwardedSignal: () => undefined };
      });
      const running = runTestProjects(
        async () => {},
        concurrency === 1
          ? []
          : ["test/vitest/vitest.ui-e2e.config.ts", "test/vitest/vitest.cli.config.ts"],
      );
      try {
        await withTestTimeout(started.promise, 5_000, "preflight and peer admission");
        expect(new Set(paths).size).toBe(concurrency);
        for (const cache of paths) {
          const relative = path.relative(cacheRoot, cache);
          expect(relative).not.toBe("");
          expect(path.isAbsolute(relative)).toBe(false);
          expect(relative.split(path.sep)).not.toContain("..");
        }
        firstPreflight.resolve(joined);
        await withTestTimeout(executionStarted.promise, 5_000, "execution admission");
        expect(uiPaths).toHaveLength(2);
        expect(new Set(uiPaths).size).toBe(1);
        expect(uiPaths).not.toContain(peerPath);
        expect(attempts).toBe(1);
      } finally {
        firstPreflight.resolve(joined);
        firstExecution.resolve(joined);
        peer.resolve(joined);
        await running;
      }
      expect(uiPaths).toHaveLength(concurrency === 1 ? 4 : 2);
      expect(new Set(uiPaths.slice(0, 2)).size).toBe(1);
      if (concurrency === 1) {
        expect(new Set(uiPaths.slice(2)).size).toBe(1);
        if (platform === "win32") {
          expect(uiPaths[2]).not.toBe(uiPaths[0]);
        } else {
          expect(uiPaths[2]).toBe(uiPaths[0]);
        }
      }
      expect(uiPaths).not.toContain(peerPath);
      expect(preflights).toBe(concurrency === 1 ? 2 : 1);
      expect(attempts).toBe(concurrency === 1 ? 2 : 1);
      expect(process.exitCode).toBe(0);
    },
  );

  it.each([
    { outcome: "failure", scope: "local", expected: 3 },
    { outcome: "infrastructure", scope: "local", expected: 2 },
    { outcome: "infrastructure", scope: "ci-continued", expected: 2 },
    { outcome: "signal", scope: "local", expected: 2 },
    { outcome: "rejection", scope: "local", expected: 2 },
    { outcome: "failure", scope: "ci-focused", expected: 2 },
    { outcome: "failure", scope: "ci-continued", expected: process.platform === "win32" ? 2 : 3 },
    { outcome: "failure", scope: "ci-full-suite", expected: 3 },
  ])(
    "joins admitted work after $outcome without confusing failure with cleanup ($scope)",
    async ({ outcome, scope, expected }) => {
      const groupJoined = process.platform !== "win32";
      const focused = scope === "ci-focused" || scope === "ci-continued";
      const configs = [
        "test/vitest/vitest.unit-fast.config.ts",
        "test/vitest/vitest.unit-fast-fake-timers.config.ts",
        "test/vitest/vitest.cli.config.ts",
      ];
      const databaseConfig = "test/vitest/vitest.extension-database-workers.config.ts";
      const files = [
        "extensions/telegram/src/polling-session.test.ts",
        "extensions/telegram/src/telegram-ingress-drain.test.ts",
        "extensions/telegram/src/webhook.test.ts",
      ];
      vi.stubEnv("CI", scope === "local" ? "" : "1");
      vi.stubEnv("GITHUB_ACTIONS", "");
      vi.stubEnv("OPENCLAW_VITEST_SHARD_NAME", scope === "local" ? "" : "selected-envelope");
      vi.stubEnv("OPENCLAW_TEST_PROJECTS_PARALLEL", "2");
      vi.stubEnv(
        "OPENCLAW_NODE_TEST_PLAN_CONTINUE_ON_FAILURE",
        scope === "ci-continued" ? "1" : "",
      );
      if (focused) {
        vi.stubEnv(
          "OPENCLAW_VITEST_INCLUDE_FILE",
          patternFiles.writePatternFile("focused-ci.json", files),
        );
      }
      if (scope === "ci-full-suite") {
        const planner = await import("../../scripts/test-projects.test-support.mts");
        vi.spyOn(planner, "buildFullSuiteVitestRunPlans").mockReturnValue(
          configs.map((config) => ({
            config,
            forwardedArgs: [],
            includePatterns: null,
            watchMode: false,
          })),
        );
      }
      commands.prepare.mockResolvedValue(0);
      const { runTestProjects } = await import("../../scripts/test-projects-run.mts");
      const first = createDeferred<{
        code: number;
        signal: NodeJS.Signals | null;
        groupJoined: boolean;
      }>();
      const second = createDeferred<{ code: number; signal: null; groupJoined: boolean }>();
      const admitted = createDeferred();
      const settled = { value: false };
      const selections: unknown[] = [];
      commands.reader.mockImplementation(({ env, pnpmArgs }) => {
        if (focused) {
          expect(pnpmArgs[pnpmArgs.indexOf("--config") + 1]).toBe(databaseConfig);
          selections.push(JSON.parse(fs.readFileSync(env.OPENCLAW_VITEST_INCLUDE_FILE, "utf8")));
        }
        const index = commands.reader.mock.calls.length;
        if (index === 2) {
          admitted.resolve();
        }
        return {
          completion:
            index === 1
              ? first.promise
              : index === 2
                ? second.promise
                : Promise.resolve({ code: 0, signal: null, groupJoined }),
          getForwardedSignal: () => undefined,
        };
      });
      const running = runTestProjects(
        async () => {},
        focused ? [databaseConfig] : scope === "ci-full-suite" ? [] : configs,
      ).finally(() => {
        settled.value = true;
      });
      const checked = outcome === "rejection" ? expect(running).rejects.toThrow() : running;
      try {
        await withTestTimeout(
          Promise.race([admitted.promise, running]),
          5_000,
          "scheduler admission",
        );
        expect(commands.reader).toHaveBeenCalledTimes(2);
        if (outcome === "rejection") {
          first.reject(new Error("unverified group completion"));
        } else {
          first.resolve({
            code: outcome === "infrastructure" ? 2 : 1,
            signal: outcome === "signal" ? "SIGTERM" : null,
            groupJoined,
          });
        }
        await new Promise<void>((resolve) => {
          setImmediate(resolve);
        });
        expect(settled.value).toBe(false);
        expect(commands.reader).toHaveBeenCalledTimes(expected);
      } finally {
        first.resolve({ code: 0, signal: null, groupJoined });
        second.resolve({ code: 0, signal: null, groupJoined });
        await checked;
      }
      expect(commands.reader).toHaveBeenCalledTimes(expected);
      if (focused) {
        expect(console.error).toHaveBeenCalledWith("[test] inner parallelism 2");
        const selected = selections.flat();
        expect(
          selections.every((selection) => Array.isArray(selection) && selection.length === 1),
        ).toBe(true);
        expect(new Set(selected).size).toBe(expected);
        expect(files).toEqual(expect.arrayContaining(selected));
        if (expected === files.length) {
          expect(selected).toEqual(expect.arrayContaining(files));
        }
      }
      if (outcome !== "rejection") {
        expect(process.exitCode).toBe(
          outcome === "signal" ? 143 : outcome === "infrastructure" ? 2 : 1,
        );
      }
    },
  );
});

function createPreparationGate<T>(prepare: typeof commands.prepare) {
  const started = createDeferred();
  const result = createDeferred<T>();
  prepare.mockImplementation(() => {
    started.resolve();
    return result.promise;
  });
  // Import completion does not imply admission; observe the preparation owner.
  return { ...result, started: started.promise };
}

describe("test-projects build admission", () => {
  const avatarTarget = "ui/src/e2e/chat-agent-avatar.real-gateway.e2e.test.ts";

  it.each([false, true])(
    "holds Gateway readers behind the matching UI build (mixed E2E=%s)",
    async (mixed) => {
      const runtime = createPreparationGate<number | NodeJS.ProcessEnv>(
        mixed ? commands.prepareE2e : commands.prepare,
      );
      let assetBuildId = "previous-runtime";
      commands.runtimeBuildId = assetBuildId;
      commands.uiAssets.mockImplementation((_root, expectedBuildId) =>
        assetBuildId === expectedBuildId
          ? { kind: "ready", indexPath: "fixture-index" }
          : { kind: "stale", indexPath: "fixture-index", buildId: assetBuildId },
      );
      const entry = start(mixed ? [e2eTarget, avatarTarget] : [avatarTarget]);
      let ui: ReturnType<typeof createPreparationGate<number>> | undefined;
      try {
        await Promise.race([runtime.started, entry]);
        ui = createPreparationGate<number>(commands.prepare);
        if (mixed) {
          // E2E reuse still needs the UI's stricter current-head preparation.
          commands.prepare.mockResolvedValueOnce(0);
        }
        expect(commands.reader).not.toHaveBeenCalled();
        expect(commands.uiAssets).not.toHaveBeenCalled();
        commands.runtimeBuildId = "rebuilt-runtime";
        runtime.resolve(mixed ? { OPENCLAW_E2E_USE_PREBUILT_DIST: "1" } : 0);
        await Promise.race([ui.started, entry]);
        expect(commands.reader).not.toHaveBeenCalled();
        expect(commands.prepare.mock.lastCall?.[0]).toMatchObject({
          args: ["scripts/ui.js", "build"],
        });
        expect(commands.uiAssets).toHaveBeenCalledWith(
          path.resolve("dist/control-ui"),
          "rebuilt-runtime",
        );
        assetBuildId = commands.prepare.mock.lastCall?.[0].env.OPENCLAW_CONTROL_UI_BUILD_ID;
      } finally {
        runtime.resolve(mixed ? { OPENCLAW_E2E_USE_PREBUILT_DIST: "1" } : 0);
        ui?.resolve(0);
        await entry;
      }
      const outcome = await terminal.promise;
      if (outcome instanceof Error) {
        throw outcome;
      }
      expect(outcome).toMatch(/^\[test\] passed /u);
      expect(commands.prepareE2e).toHaveBeenCalledTimes(mixed ? 1 : 0);
      expect(commands.prepare.mock.calls.map(([command]) => command.args)).toEqual([
        ["scripts/prepare-vitest-runtime.mjs", "--require-current-head"],
        ["scripts/ui.js", "build"],
      ]);
      expect(commands.uiAssets).toHaveBeenCalledTimes(2);
      expect(process.exitCode).toBe(0);
    },
  );

  it.each(["nonzero", "still stale"])(
    "admits no UI readers after a %s UI build",
    async (outcome) => {
      commands.uiAssets.mockReturnValue({
        kind: "stale",
        indexPath: "fixture-index",
        buildId: "previous-runtime",
      });
      commands.prepare.mockImplementation(async ({ args }) =>
        args[0] === "scripts/ui.js" && outcome === "nonzero" ? 7 : 0,
      );
      await start([avatarTarget]);
      await terminal.promise;
      expect(commands.reader).not.toHaveBeenCalled();
      expect(commands.prepare.mock.calls.map(([command]) => command.args)).toEqual([
        ["scripts/prepare-vitest-runtime.mjs", "--require-current-head"],
        ["scripts/ui.js", "build"],
      ]);
      expect(process.exitCode).toBe(outcome === "nonzero" ? 7 : 2);
      if (outcome === "still stale") {
        expect(await terminal.promise).toMatchObject({
          message: "Control UI setup left stale assets for runtime fixture-runtime",
        });
      }
    },
  );

  it.each([false, true])(
    "retains cancellation between runtime preparation and UI admission (mixed E2E=%s)",
    async (mixed) => {
      const { runTestProjects } = await import("../../scripts/test-projects-run.mts");
      const existingListeners = new Set(process.listeners("SIGTERM"));
      const source = createPreparationGate<void>(commands.sourceLoader);
      const exitBySignal = vi.fn(async () => {});
      const running = runTestProjects(
        exitBySignal,
        mixed ? [e2eTarget, avatarTarget] : [avatarTarget],
      );
      const rejected = expect(running).rejects.toMatchObject({ name: "AbortError" });
      try {
        await withTestTimeout(
          Promise.race([source.started, running]),
          5_000,
          "source loader admission",
        );
        const listeners = process
          .listeners("SIGTERM")
          .filter((listener) => !existingListeners.has(listener));
        expect(listeners).toHaveLength(1);
        listeners[0]!.call(process, "SIGTERM");
      } finally {
        source.resolve();
        await rejected;
      }
      expect(commands.prepare.mock.calls.map(([command]) => command.args)).toEqual([
        ["scripts/prepare-vitest-runtime.mjs", "--require-current-head"],
      ]);
      expect(commands.uiAssets).not.toHaveBeenCalled();
      expect(commands.reader).not.toHaveBeenCalled();
      expect(exitBySignal).toHaveBeenCalledExactlyOnceWith("SIGTERM");
      expect(process.listeners("SIGTERM")).toEqual([...existingListeners]);
    },
  );

  it.each(["build", "failed build", "prebuilt"])(
    "admits the built native-host integration after %s",
    async (mode) => {
      if (mode === "prebuilt") {
        vi.stubEnv("OPENCLAW_E2E_USE_PREBUILT_DIST", "1");
      }
      const preparation = createPreparationGate<NodeJS.ProcessEnv>(commands.prepareE2e);
      if (mode === "prebuilt") {
        preparation.resolve({});
      }
      const entry = start([nativeHostTarget]);
      try {
        await Promise.race([preparation.started, entry]);
        if (mode !== "prebuilt") {
          expect(commands.reader).not.toHaveBeenCalled();
          expect(commands.prepareE2e).toHaveBeenCalledOnce();
        }
      } finally {
        if (mode === "failed build") {
          preparation.reject(new Error("build failed"));
        } else {
          preparation.resolve({ OPENCLAW_E2E_USE_PREBUILT_DIST: "1" });
        }
        await entry;
      }
      expect(commands.prepare).not.toHaveBeenCalled();
      expect(commands.prepareE2e).toHaveBeenCalledOnce();
      expect(commands.reader).toHaveBeenCalledTimes(mode === "failed build" ? 0 : 1);
      if (mode === "failed build") {
        expect(process.exitCode).toBe(2);
      } else {
        expect(commands.reader).toHaveBeenCalledWith(
          expect.objectContaining({
            pnpmArgs: expect.arrayContaining(["--config", e2eConfig]),
            env: expect.objectContaining({ OPENCLAW_E2E_USE_PREBUILT_DIST: "1" }),
          }),
        );
      }
    },
  );
});
