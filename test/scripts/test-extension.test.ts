// Test Extension tests cover test extension script behavior.
/* oxlint-disable typescript/no-unnecessary-type-parameters -- explicit call-site result types keep mock tuple extraction precise. */
import { spawn, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { bundledPluginRoot } from "openclaw/plugin-sdk/test-fixtures";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { parseCLI } from "vitest/node";
import {
  detectChangedExtensionIds,
  listAvailableExtensionIds,
  listChangedExtensionIds,
} from "../../scripts/lib/changed-extensions.mts";
import {
  DEFAULT_EXTENSION_TEST_SHARD_COUNT,
  createExtensionTestProcessTargetChunks,
  createExtensionTestShards,
  estimateExtensionTestCost,
  listExtensionTestFilesForRoots,
  listTrackedTestPlanFiles,
  resolveExtensionBatchPlan,
  resolveExtensionTestConfig,
  resolveExtensionTestPlan,
} from "../../scripts/lib/extension-test-plan.mts";
import { relativizeExtensionVitestArgs } from "../../scripts/lib/extension-vitest-paths.mts";
import type { VitestBatchRunParams } from "../../scripts/lib/vitest-batch-runner.mts";
import {
  prepareVitestRuntime,
  resolveVitestPretestBuildMode,
} from "../../scripts/lib/vitest-build-prerequisites.mts";
import { scriptModuleEntrypoints } from "../../scripts/script-module-runtime.test-support.mjs";
import {
  parseExtensionIds,
  parseExactVitestExcludePaths,
  resolveExtensionBatchParallelism,
  runExtensionBatchPlan,
} from "../../scripts/test-extension-batch-run.mts";
import {
  resolveRuntimeWorkerArgv,
  resolveRuntimeWorkerUrl,
} from "../../src/infra/runtime-worker-url.js";
import { createFixtureLifetime } from "../helpers/fixture-lifetime.js";
import {
  fixtureReceiptClientSource,
  openFixtureReceiptChannel,
  type FixtureReceiptChannel,
} from "../helpers/fixture-receipts.js";
import { withinTest } from "../helpers/promise.js";
import { useAutoCleanupTempDirTracker } from "../helpers/temp-dir.js";
import { listVitestConfigTestFiles } from "../vitest-projects-config.test-support.js";
import { databaseWorkerExtensionTestFiles } from "../vitest/vitest.extension-database-workers-paths.mjs";

vi.mock("../../scripts/lib/vitest-build-prerequisites.mts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../scripts/lib/vitest-build-prerequisites.mts")>()),
  prepareVitestRuntime: vi.fn().mockResolvedValue(0),
}));

const scriptPath = path.join(process.cwd(), "scripts", "test-extension.mts");
const posixIt = process.platform === "win32" ? it.skip : it;
const tempDirs = useAutoCleanupTempDirTracker(afterEach);
const fixture = createFixtureLifetime();
afterEach(() => fixture.cleanup());

type RunGroupParams = VitestBatchRunParams;

function createConcurrentExtensionBatchPlan() {
  const groups = [
    ["light", 10, "one", 1],
    ["heavy", 30, "two", 3],
    ["middle", 20, "three", 2],
  ] as const;
  return {
    extensionCount: groups.length,
    extensionIds: groups.map((group) => group[2]),
    estimatedCost: 60,
    hasTests: true,
    planGroups: groups.map(([config, estimatedCost, extensionId, testFileCount]) => ({
      config,
      estimatedCost,
      extensionIds: [extensionId],
      roots: [`extensions/${extensionId}`],
      testFileCount,
    })),
    testFileCount: 6,
  };
}

function runScriptResult(args: string[], cwd = process.cwd(), env = process.env) {
  return spawnSync(process.execPath, ["--import", "tsx", scriptPath, ...args], {
    cwd,
    env,
    encoding: "utf8",
  });
}

function requireFirstMockArg<T>(mock: { mock: { calls: readonly (readonly unknown[])[] } }): T {
  const [call] = mock.mock.calls;
  if (!call) {
    throw new Error("expected first mock call argument");
  }
  const [arg] = call;
  if (arg === undefined) {
    throw new Error("expected first mock call argument");
  }
  return arg as T;
}

function listExtensionTestFiles(extensionId: string): string[] {
  return listExtensionTestFilesForRoots([bundledPluginRoot(extensionId)]);
}

describe("scripts/test-extension.mts", () => {
  let receipts: FixtureReceiptChannel;
  beforeAll(async () => {
    receipts = await openFixtureReceiptChannel();
  });
  afterAll(async () => {
    await receipts?.close();
  });
  let balancedExtensionShards: ReturnType<typeof createExtensionTestShards>;
  let balancedExpectedExtensionIds: string[];

  beforeAll(() => {
    balancedExtensionShards = createExtensionTestShards({
      cwd: process.cwd(),
      shardCount: DEFAULT_EXTENSION_TEST_SHARD_COUNT,
    });
    balancedExpectedExtensionIds = listAvailableExtensionIds().filter(
      (extensionId) =>
        resolveExtensionTestPlan({ cwd: process.cwd(), targetArg: extensionId }).hasTests,
    );
  });

  it("routes the catch-all-excluded Zalo root to its dedicated config", () => {
    expect(resolveExtensionTestConfig("extensions/zalo")).not.toBe(
      "test/vitest/vitest.extensions.config.ts",
    );
  });

  it("excludes plugin browser tests from the server-side extension inventory", () => {
    const files = listExtensionTestFilesForRoots([bundledPluginRoot("workboard")]);
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((file) => file.includes("/browser/"))).toBe(false);
  });

  posixIt("preserves newline and leading-space tokens in the tracked Git inventory", () => {
    const root = tempDirs.make("openclaw-extension-git-paths-");
    const trackedPaths = [" extensions/example.test.ts", "extensions/example\npath.test.ts"];
    expect(spawnSync("git", ["init", "-q", "--initial-branch=main"], { cwd: root }).status).toBe(0);
    for (const trackedPath of trackedPaths) {
      const absolutePath = path.join(root, trackedPath);
      mkdirSync(path.dirname(absolutePath), { recursive: true });
      writeFileSync(absolutePath, "export {};\n");
    }
    expect(spawnSync("git", ["add", "--", ...trackedPaths], { cwd: root }).status).toBe(0);

    expect(listTrackedTestPlanFiles(root, [":(glob)**/*.test.ts"])?.toSorted()).toEqual(
      trackedPaths.toSorted(),
    );
  });

  it.each([["missing retry value", ["--retry"]]])(
    "keeps Matrix %s runs in one process",
    (_name, vitestArgs) => {
      const root = bundledPluginRoot("matrix");

      expect(
        createExtensionTestProcessTargetChunks(
          "test/vitest/vitest.extension-matrix.config.ts",
          [root],
          vitestArgs,
        ),
      ).toEqual([[root]]);
    },
  );

  it("does not normalize extension path lookalikes", () => {
    expect(
      detectChangedExtensionIds([
        " extensions/slack/src/channel.ts",
        String.raw`extensions\slack\src\channel.ts`,
        " src/line/message.test.ts",
      ]),
    ).toEqual([]);
  });

  it("can fail safe to all extensions when the base revision is unavailable", () => {
    const extensionIds = listChangedExtensionIds({
      base: "refs/heads/openclaw-test-missing-base",
      unavailableBaseBehavior: "all",
    });

    expect(extensionIds).toEqual(listAvailableExtensionIds());
  });

  it("balances extension test shards by estimated CI cost", () => {
    for (const [config, singletonSeconds, tenFileSeconds] of [
      ["test/vitest/vitest.extension-slack.config.ts", 2, 12],
      ["test/vitest/vitest.extension-telegram.config.ts", 6, 43],
      ["test/vitest/vitest.extension-database-workers.config.ts", 8, 76],
    ] as const) {
      expect(estimateExtensionTestCost(config, 1), config).toBe(singletonSeconds);
      expect(estimateExtensionTestCost(config, 10), config).toBe(tenFileSeconds);
    }
    const shards = balancedExtensionShards;

    expect(shards).toHaveLength(DEFAULT_EXTENSION_TEST_SHARD_COUNT);
    expect(shards.map((shard) => shard.checkName)).toEqual(
      shards.map((_shard, index) => `checks-node-extensions-shard-${index + 1}`),
    );

    const assigned = shards.flatMap((shard) => shard.extensionIds);
    const uniqueAssigned = [...new Set(assigned)];

    expect(uniqueAssigned.toSorted((left, right) => left.localeCompare(right))).toEqual(
      balancedExpectedExtensionIds.toSorted((left, right) => left.localeCompare(right)),
    );
    expect(assigned).toHaveLength(balancedExpectedExtensionIds.length);

    const totals = shards.map((shard) => shard.estimatedCost);
    const largestPlugin = Math.max(
      ...balancedExpectedExtensionIds.map(
        (targetArg) => resolveExtensionTestPlan({ targetArg }).estimatedCost,
      ),
    );
    const lowerBound = Math.max(
      largestPlugin,
      Math.ceil(totals.reduce((sum, cost) => sum + cost, 0) / shards.length),
    );
    expect(Math.max(...totals)).toBe(lowerBound);

    for (const shard of shards) {
      expect(shard.extensionIds.length).toBeGreaterThan(0);
    }
  });

  it("runs extension batch config groups concurrently when requested", async () => {
    const started: string[] = [];
    const resolvers: Array<() => void> = [];
    const runGroup = vi.fn((params: RunGroupParams) => {
      started.push(params.config);
      return new Promise<number>((resolve) => {
        resolvers.push(() => resolve(0));
      });
    });
    const runPromise = runExtensionBatchPlan(createConcurrentExtensionBatchPlan(), {
      env: { OPENCLAW_EXTENSION_BATCH_PARALLEL: "2" },
      runGroup: runGroup as NonNullable<
        NonNullable<Parameters<typeof runExtensionBatchPlan>[1]>["runGroup"]
      >,
      vitestArgs: ["--reporter=dot"],
    });

    await vi.waitFor(() => {
      expect(started).toEqual(["heavy", "middle"]);
    });
    resolvers.shift()?.();
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    expect(started).toEqual(["heavy", "middle", "light"]);
    while (resolvers.length > 0) {
      resolvers.shift()?.();
    }
    await expect(runPromise).resolves.toBe(0);
    expect(runGroup).toHaveBeenCalledTimes(3);
    const firstRunGroupParams = requireFirstMockArg<RunGroupParams>(runGroup);
    expect(firstRunGroupParams).toMatchObject({
      args: ["--reporter=dot"],
      config: "heavy",
      env: {
        OPENCLAW_EXTENSION_BATCH_PARALLEL: "2",
      },
      targets: ["two/"],
    });
    const cachePaths = runGroup.mock.calls.map(([params]) =>
      params.env?.OPENCLAW_VITEST_FS_MODULE_CACHE_PATH?.replaceAll("\\", "/"),
    );
    expect(new Set(cachePaths).size).toBe(3);
    expect(
      cachePaths.every((cachePath) =>
        /\/\.cache\/vitest\/slots\/[a-f\d]+\/0$/u.test(cachePath ?? ""),
      ),
    ).toBe(true);
  });

  it("stops admitting extension batch groups after a parallel failure", async () => {
    const started: string[] = [];
    let resolveHeavy: ((code: number) => void) | undefined;
    let resolveMiddle: ((code: number) => void) | undefined;
    const runGroup = vi.fn((params: RunGroupParams) => {
      started.push(params.config);
      return new Promise<number>((resolve) => {
        if (params.config === "heavy") {
          resolveHeavy = resolve;
        } else if (params.config === "middle") {
          resolveMiddle = resolve;
        }
      });
    });
    const runPromise = runExtensionBatchPlan(createConcurrentExtensionBatchPlan(), {
      env: { OPENCLAW_EXTENSION_BATCH_PARALLEL: "2" },
      runGroup: runGroup as NonNullable<
        NonNullable<Parameters<typeof runExtensionBatchPlan>[1]>["runGroup"]
      >,
    });

    await vi.waitFor(() => {
      expect(started).toEqual(["heavy", "middle"]);
    });
    resolveHeavy?.(7);
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    expect(started).toEqual(["heavy", "middle"]);
    resolveMiddle?.(0);
    await expect(runPromise).resolves.toBe(7);
    expect(runGroup).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed extension batch parallelism", () => {
    for (const value of ["nope", "2x", "0"]) {
      expect(() =>
        resolveExtensionBatchParallelism(3, { OPENCLAW_EXTENSION_BATCH_PARALLEL: value }),
      ).toThrow("OPENCLAW_EXTENSION_BATCH_PARALLEL must be a positive integer");
    }
  });

  it("preserves positional Vitest args after the extension batch separator", () => {
    expect(
      parseExtensionIds([
        "telegram",
        "--coverage",
        "--",
        "extensions/telegram/src/index.test.ts",
        "--run",
      ]),
    ).toEqual({
      extensionIds: ["telegram"],
      passthroughArgs: ["--coverage", "extensions/telegram/src/index.test.ts", "--run"],
    });
  });

  it.each([
    { enableMaglev: false, realHomeReplay: false, pool: "forks" },
    { enableMaglev: true, realHomeReplay: false, pool: "forks" },
    { enableMaglev: false, realHomeReplay: true, pool: "forks" },
    { enableMaglev: false, realHomeReplay: false, pool: "threads" },
  ])(
    "runs installed Vitest without pnpm (pool: $pool, Maglev: $enableMaglev, owner-authorized real home: $realHomeReplay)",
    ({ enableMaglev, realHomeReplay, pool }) => {
      const root = realpathSync(
        mkdtempSync(path.join(tmpdir(), "openclaw-test-extension-native-")),
      );
      const home = path.join(root, "home");
      const bin = path.join(root, "bin");
      const runtime = process.versions.bun ? "bun" : "node";
      const report = path.join(root, "report.json");
      const config = path.join(root, "vitest.config.mjs");
      const entry = path.join(root, "batch.mts");
      mkdirSync(home);
      mkdirSync(bin);
      symlinkSync(
        process.execPath,
        path.join(bin, process.platform === "win32" ? `${runtime}.exe` : runtime),
        "file",
      );
      symlinkSync(
        path.join(process.cwd(), "node_modules"),
        path.join(root, "node_modules"),
        "junction",
      );
      writeFileSync(
        config,
        `import assert from 'node:assert/strict';
assert.equal(process.execArgv.includes('--no-maglev'), ${runtime === "node" && !enableMaglev}, 'batch Node defaults');
assert.equal(process.execArgv.includes('--no-concurrent-sparkplug'), ${runtime === "node"}, 'batch Sparkplug policy');
export default {root:${JSON.stringify(root)},cacheDir:${JSON.stringify(path.join(root, "cache"))},test:{include:['*.test.mjs'],pool:${JSON.stringify(pool)},execArgv:['--no-warnings'],globalSetup:[${JSON.stringify(path.join(process.cwd(), "test/vitest/vitest.node-policy.global-setup.ts"))}],maxWorkers:1,fileParallelism:false,cache:false,fsModuleCache:false}};`,
      );
      const expectedHome = realHomeReplay ? JSON.stringify(home) : "path.join(tmpdir(), 'home')";
      writeFileSync(
        path.join(root, "selected.test.mjs"),
        `import {homedir,tmpdir} from 'node:os';import path from 'node:path';import {test,expect} from 'vitest';let attempts=0;test('selected native case',()=>{expect(++attempts).toBe(2);expect(Boolean(process.versions.bun)).toBe(${runtime === "bun"});expect(process.execArgv.includes('--no-concurrent-sparkplug')).toBe(${runtime === "node" && pool === "forks"});expect(process.execArgv).toContain('--no-warnings');expect(process.env.NODE_OPTIONS).toBe('--trace-warnings');expect(process.env.HOME).toBe(${expectedHome});expect(homedir()).toBe(${expectedHome});});`,
      );
      for (const name of ["excluded", "unrelated"]) {
        writeFileSync(
          path.join(root, `${name}.test.mjs`),
          "import {test,expect} from 'vitest';test('must not execute',()=>expect.fail('selection lost'));",
        );
      }
      const params = {
        config,
        homeMode: realHomeReplay ? "live-aware" : undefined,
        args: [
          "--configLoader=native",
          "--retry=1",
          "--reporter=verbose",
          "--reporter=json",
          `--outputFile=${report}`,
          "--exclude",
          "**/excluded.test.mjs",
        ],
        targets: [path.join(root, "selected.test.mjs"), path.join(root, "excluded.test.mjs")],
      } satisfies VitestBatchRunParams;
      writeFileSync(
        entry,
        `import {runVitestBatch} from ${JSON.stringify(path.join(process.cwd(), "scripts/lib/vitest-batch-runner.mts"))};process.exitCode=await runVitestBatch({...${JSON.stringify(params)},env:{...process.env,OPENCLAW_VITEST_ENABLE_MAGLEV:${JSON.stringify(enableMaglev ? "1" : "")}}});`,
      );
      try {
        const result = spawnSync(
          process.execPath,
          ["--import", path.join(process.cwd(), "scripts/tsx.mjs"), entry],
          {
            cwd: root,
            encoding: "utf8",
            env: {
              PATH: bin,
              OPENCLAW_VITEST_RUNTIME: runtime,
              HOME: home,
              USERPROFILE: home,
              OPENCLAW_LIVE_TEST: realHomeReplay ? "1" : "0",
              OPENCLAW_LIVE_USE_REAL_HOME: realHomeReplay ? "1" : "0",
              TMPDIR: root,
              TMP: root,
              TEMP: root,
              SystemRoot: process.env.SystemRoot,
              COREPACK_ENABLE_NETWORK: "0",
              NODE_DISABLE_COMPILE_CACHE: "1",
              NODE_OPTIONS: "--trace-warnings",
              CI: "1",
            },
          },
        );
        expect(result.status, result.stdout + result.stderr).toBe(0);
        expect(result.signal).toBeNull();
        const native = JSON.parse(readFileSync(report, "utf8"));
        expect(native.success).toBe(true);
        expect(
          native.testResults.flatMap(
            (file: { assertionResults: { title: string; status: string }[] }) =>
              file.assertionResults.map(({ title, status }) => [title, status]),
          ),
        ).toEqual([["selected native case", "passed"]]);
      } finally {
        rmSync(root, { force: true, recursive: true });
      }
    },
  );

  it.each([["--max-workers", "2"]])(
    "preserves native Vitest option operands from a plugin cwd: %j",
    (...flags) => {
      const target = "extensions/browser/src/example.test.ts";
      const args = relativizeExtensionVitestArgs(
        [...flags, target],
        path.join(process.cwd(), "extensions/browser"),
      );
      expect(parseCLI(["vitest", "run", ...args])).toEqual(
        parseCLI(["vitest", "run", ...flags, "browser/src/example.test.ts"]),
      );
    },
  );

  it("preserves native separator tails without interpreting them as plugin paths", () => {
    const tail = ["--", "extensions/browser/src/literal.test.ts", "--exclude="];
    const args = relativizeExtensionVitestArgs(
      tail,
      path.join(process.cwd(), "extensions/browser"),
    );
    expect(parseCLI(["vitest", "run", ...args])).toEqual(parseCLI(["vitest", "run", ...tail]));
  });

  it.each(["--exclude="])("relativizes absolute %s paths from extension cwd", (flag) => {
    const extensionCwd = path.join(process.cwd(), "extensions", "codex");
    expect(
      relativizeExtensionVitestArgs(
        [
          flag,
          path.join(extensionCwd, "src", "app-server", "run-attempt.test.ts"),
          path.join(extensionCwd, "src", "app-server", "client.test.ts"),
        ],
        extensionCwd,
      ),
    ).toEqual([
      flag,
      "codex/src/app-server/run-attempt.test.ts",
      "codex/src/app-server/client.test.ts",
    ]);
  });

  posixIt(
    "preserves wrapper termination when native Vitest exits cleanly after SIGTERM",
    ({ signal }) =>
      fixture.run(async () => {
        const root = mkdtempSync(path.join(tmpdir(), "openclaw-test-extension-signal-"));
        const config = path.join(root, "vitest.config.mjs");
        const entry = path.join(root, "batch.mts");
        const childPidPath = path.join(root, "child.pid");
        const descendantPidPath = path.join(root, "descendant.pid");
        const signaledPath = path.join(root, "signaled");

        writeFileSync(
          config,
          `import {spawn} from 'node:child_process';import fs from 'node:fs';
${fixtureReceiptClientSource(receipts.endpoint)}
process.on('SIGTERM',()=>{fs.writeFileSync(${JSON.stringify(signaledPath)},'SIGTERM');process.exit(0)});
const descendant=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000);process.stdout.write('ready');"],{stdio:['ignore','pipe','ignore']});
await new Promise(resolve=>descendant.stdout.once('data',resolve));
fs.writeFileSync(${JSON.stringify(descendantPidPath)},String(descendant.pid));
fs.writeFileSync(${JSON.stringify(childPidPath)},String(process.pid));
sendReceipt(${JSON.stringify(childPidPath)}, "ready");
await new Promise(()=>{});export default {};`,
        );
        const batchRunnerUrl = resolveRuntimeWorkerUrl(scriptModuleEntrypoints.vitestBatchRunner);
        writeFileSync(
          entry,
          `import {runVitestBatch} from ${JSON.stringify(batchRunnerUrl.href)};process.exitCode=await runVitestBatch({config:${JSON.stringify(config)},args:['--configLoader=native'],targets:[]});`,
        );
        const runner = spawn(
          process.execPath,
          [...resolveRuntimeWorkerArgv(batchRunnerUrl).slice(0, -1), entry],
          { cwd: process.cwd(), stdio: "ignore" },
        );
        const runnerClosed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
          (resolve) => {
            runner.once("close", (code, exitSignal) => resolve({ code, signal: exitSignal }));
          },
        );
        let childPid = 0;
        let descendantPid = 0;

        try {
          // The native config publishes both PIDs before the receipt. Its exit can
          // overtake that separate socket, so durable records decide an early close.
          await withinTest(
            Promise.race([
              receipts.waitFor(childPidPath, "ready"),
              runnerClosed.then(() => {
                if (!fileExists(childPidPath) || !fileExists(descendantPidPath)) {
                  throw new Error(`timeout waiting for pid in ${childPidPath}`);
                }
              }),
            ]),
            signal,
          );
          childPid = Number(readFileSync(childPidPath, "utf8"));
          descendantPid = Number(readFileSync(descendantPidPath, "utf8"));
          expect(Number.isInteger(childPid)).toBe(true);
          expect(Number.isInteger(descendantPid)).toBe(true);

          expect(runner.pid).toBeGreaterThan(0);
          process.kill(runner.pid!, "SIGTERM");
          const result = await withinTest(runnerClosed, signal);

          expect(result).toEqual({ code: null, signal: "SIGTERM" });
          // The config writes this synchronously before exiting, and the batch
          // runner joins the native process before re-raising its signal.
          expect(readFileSync(signaledPath, "utf8")).toBe("SIGTERM");
          await waitForProcessesExit([childPid, descendantPid], signal);
        } finally {
          if (runner.pid && isProcessAlive(runner.pid)) {
            process.kill(runner.pid, "SIGTERM");
          }
          await runnerClosed;
          childPid ||= fileExists(childPidPath) ? Number(readFileSync(childPidPath, "utf8")) : 0;
          descendantPid ||= fileExists(descendantPidPath)
            ? Number(readFileSync(descendantPidPath, "utf8"))
            : 0;
          if (childPid && isProcessAlive(childPid)) {
            process.kill(childPid, "SIGKILL");
          }
          if (descendantPid && isProcessAlive(descendantPid)) {
            process.kill(descendantPid, "SIGKILL");
          }
          rmSync(root, { force: true, recursive: true });
        }
      }),
  );

  it.each([
    {
      args: ["--exclude=extensions/memory-lancedb/memory-cli.test.ts"],
      nodeCode: 0,
      bunCode: 0,
    },
    { args: ["--watch"], nodeCode: 0, bunCode: 0, combined: true, bun: false },
  ])("adds only qualified Bun work after Node with $args ($nodeCode/$bunCode)", async (row) => {
    const memoryConfig = "test/vitest/vitest.extension-memory.config.ts";
    const databaseConfig = "test/vitest/vitest.extension-database-workers.config.ts";
    const configs = [memoryConfig, databaseConfig];
    const targets = [
      "extensions/memory-lancedb/config.test.ts",
      "extensions/memory-lancedb/index.test.ts",
    ];
    const calls: RunGroupParams[] = [];
    const result = await runExtensionBatchPlan(
      {
        extensionCount: 1,
        extensionIds: ["memory-lancedb"],
        estimatedCost: 2,
        hasTests: true,
        testFileCount: 2,
        planGroups: configs.map((config, index) => ({
          config,
          extensionIds: ["memory-lancedb"],
          roots: [targets[index]!],
          estimatedCost: 1,
          testFileCount: 1,
        })),
      },
      {
        env: {
          OPENCLAW_CI_TEST_RUNTIME_POLICY: "dual",
          OPENCLAW_VITEST_RUNTIME: "bun",
          OPENCLAW_VITEST_MAX_WORKERS: "4",
          OPENCLAW_VITEST_FS_MODULE_CACHE_PATH: "/tmp/extension-runtime-cache/",
        },
        vitestArgs: row.args,
        runGroup: async (params) => {
          calls.push(params);
          return params.env?.OPENCLAW_VITEST_RUNTIME === "bun" ? row.bunCode : row.nodeCode;
        },
      },
    );
    expect(result).toBe(row.nodeCode || row.bunCode);
    const node = calls.filter((call) => call.env?.OPENCLAW_VITEST_RUNTIME === "node");
    const bun = calls.filter((call) => call.env?.OPENCLAW_VITEST_RUNTIME === "bun");
    expect(node.map((call) => call.config)).toEqual(
      row.combined ? ["test/vitest/vitest.database-worker-watch.config.ts"] : configs,
    );
    expect(node.flatMap((call) => call.targets).toSorted()).toEqual(
      targets.map((file) => file.replace(/^extensions\//u, "")).toSorted(),
    );
    expect(bun).toHaveLength(row.bun === false ? 0 : 1);
    if (row.bun !== false) {
      expect(bun[0]).toMatchObject({
        config: memoryConfig,
        targets: ["memory-lancedb/config.test.ts"],
        env: {
          OPENCLAW_VITEST_MAX_WORKERS: "4",
          OPENCLAW_VITEST_FS_MODULE_CACHE_PATH:
            path.resolve("/tmp/extension-runtime-cache") + "-bun",
        },
      });
      expect(calls.indexOf(bun[0]!)).toBeGreaterThan(calls.indexOf(node[0]!));
    }
    for (const call of calls) {
      expect(call.args).toEqual(relativizeExtensionVitestArgs(row.args));
    }
    expect(
      node.every(
        (call) =>
          call.env?.OPENCLAW_VITEST_FS_MODULE_CACHE_PATH === "/tmp/extension-runtime-cache/",
      ),
    ).toBe(true);
  });

  it.each([["--retry", "1", "--exclude=extensions/codex/src/app-server/run-attempt.test.ts"]])(
    "preserves Codex process bounds with release options %j",
    async (...vitestArgs) => {
      const runGroup = vi.fn<(params: RunGroupParams) => Promise<number>>().mockResolvedValue(0);
      const excluded = "extensions/codex/src/app-server/run-attempt.test.ts";
      const expectedFiles = [
        ...(await listVitestConfigTestFiles("test/vitest/vitest.extension-codex.config.ts")),
        ...(
          await listVitestConfigTestFiles("test/vitest/vitest.extension-database-workers.config.ts")
        ).filter((file) => file.startsWith("extensions/codex/")),
      ]
        .filter((file) => file !== excluded)
        .map((file) => file.replace(/^extensions\//u, ""));

      const result = await runExtensionBatchPlan(
        resolveExtensionBatchPlan({ cwd: process.cwd(), extensionIds: ["codex"] }),
        { runGroup, vitestArgs },
      );

      expect(result).toBe(0);
      const calls = runGroup.mock.calls.map(([params]) => params);
      const workerCount = expectedFiles.filter((file) =>
        databaseWorkerExtensionTestFiles.includes(`extensions/${file}`),
      ).length;
      expect(calls).toHaveLength(
        Math.ceil(workerCount / 12) + Math.ceil((expectedFiles.length - workerCount) / 24),
      );
      expect(calls.every((call) => call.targets.length <= 24)).toBe(true);
      expect(
        calls
          .filter(
            (call) => call.config === "test/vitest/vitest.extension-database-workers.config.ts",
          )
          .every((call) => call.targets.length <= 12),
      ).toBe(true);
      expect(calls.flatMap((call) => call.targets).toSorted()).toEqual(expectedFiles.toSorted());
      expect(new Set(calls.flatMap((call) => call.targets)).size).toBe(expectedFiles.length);
      for (const call of calls) {
        expect(parseCLI(["vitest", "run", ...call.args]).options).toMatchObject({
          retry: 1,
          exclude: ["codex/src/app-server/run-attempt.test.ts"],
        });
      }
    },
  );

  it.each([
    {
      include: "extensions/telegram/src/sticker-cache.selection.test.ts",
      exclude: false,
      mode: "runtime",
    },
    {
      include: "extensions/telegram/src/sticker-cache.selection.test.ts",
      exclude: true,
      mode: undefined,
    },
  ])(
    "prepares the selected Telegram leaves before the aggregate ($include, exclude=$exclude)",
    async ({ include, exclude, mode }) => {
      const includeFile = path.join(tempDirs.make("openclaw-extension-selection-"), "include.json");
      writeFileSync(includeFile, JSON.stringify([include]));
      vi.mocked(prepareVitestRuntime).mockClear();
      const runGroup = vi.fn<(params: RunGroupParams) => Promise<number>>().mockResolvedValue(0);
      const env = { OPENCLAW_VITEST_INCLUDE_FILE: includeFile };
      const args = ["--watch", ...(exclude ? ["--exclude", include] : [])];
      const result = await runExtensionBatchPlan(
        resolveExtensionBatchPlan({ extensionIds: ["telegram"] }),
        { env, runGroup, vitestArgs: args },
      );
      expect(result).toBe(0);
      expect(runGroup).toHaveBeenCalledOnce();
      expect(prepareVitestRuntime).toHaveBeenCalledOnce();
      const [selections] = vi.mocked(prepareVitestRuntime).mock.calls[0]!;
      expect(resolveVitestPretestBuildMode(selections)).toBe(mode);
      const invocation = requireFirstMockArg<RunGroupParams>(runGroup);
      expect(invocation.env?.OPENCLAW_VITEST_INCLUDE_FILE).toBe(includeFile);
      expect(invocation.homeMode).toBe("live-aware");
      expect(invocation.args).toEqual(relativizeExtensionVitestArgs(args));
      if (exclude) {
        expect(invocation.targets).not.toContain("telegram/src/sticker-cache.selection.test.ts");
      }
    },
  );

  it("fails extension batch groups when dir-relative exact excludes remove every test", async () => {
    const runGroup = vi.fn<() => Promise<number>>().mockResolvedValue(0);
    const firecrawlTestFiles = listExtensionTestFiles("firecrawl");
    const result = await runExtensionBatchPlan(
      resolveExtensionBatchPlan({ cwd: process.cwd(), extensionIds: ["firecrawl"] }),
      {
        runGroup,
        vitestArgs: firecrawlTestFiles.flatMap((testFile) => [
          "--exclude",
          testFile.replace(/^extensions\//u, ""),
        ]),
      },
    );

    expect(result).toBe(1);
    expect(runGroup).not.toHaveBeenCalled();
  });

  it("allows extension batch groups to opt into empty exact excludes", async () => {
    const runGroup = vi.fn<() => Promise<number>>().mockResolvedValue(0);
    const firecrawlTestFiles = listExtensionTestFiles("firecrawl");
    const result = await runExtensionBatchPlan(
      resolveExtensionBatchPlan({ cwd: process.cwd(), extensionIds: ["firecrawl"] }),
      {
        allowEmptyAfterExclude: true,
        runGroup,
        vitestArgs: firecrawlTestFiles.flatMap((testFile) => ["--exclude", testFile]),
      },
    );

    expect(result).toBe(0);
    expect(runGroup).not.toHaveBeenCalled();
  });

  it("detects exact Vitest excludes in extension batch args", () => {
    expect([
      ...parseExactVitestExcludePaths([
        "--exclude",
        "extensions/codex/src/app-server/run-attempt.test.ts",
      ]),
    ]).toEqual(["extensions/codex/src/app-server/run-attempt.test.ts"]);
    expect([...parseExactVitestExcludePaths(["--exclude=extensions/**/*.test.ts"])]).toEqual([]);
  });

  it("accepts pnpm's leading argument separator before extension ids", () => {
    expect(parseExtensionIds(["--", "telegram,slack", "--run"])).toEqual({
      extensionIds: ["telegram", "slack"],
      passthroughArgs: ["--run"],
    });
  });

  it("reports single-plugin preparation rejection as infrastructure failure", () => {
    const result = runScriptResult(["firecrawl"], undefined, {
      ...process.env,
      OPENCLAW_EXTENSION_BATCH_PARALLEL: "invalid",
    });

    expect(result.stderr).toContain("OPENCLAW_EXTENSION_BATCH_PARALLEL must be a positive integer");
    expect(result.status, result.stdout + result.stderr).toBe(2);
  });
});

// Native Vitest owns these handles and its group join accepts terminal zombies.
// Preserve the stronger absent-PID assertion until reaping, bounded only by cancellation.
async function waitForProcessesExit(pids: number[], signal: AbortSignal): Promise<void> {
  while (pids.some(isProcessAlive)) {
    try {
      await delay(5, undefined, { signal });
    } catch (cause) {
      throw new Error(`timed out waiting for condition: processes ${pids.join(", ")} exited`, {
        cause,
      });
    }
  }
}

function fileExists(filePath: string): boolean {
  try {
    readFileSync(filePath);
    return true;
  } catch {
    return false;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
