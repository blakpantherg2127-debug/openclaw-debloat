import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { resolveUpdateCaptureRoot } from "../infra/update-capture-paths.js";
import { captureUpdateRecoveryBaseline } from "../infra/update-recovery-baseline-capture.js";
import { buildUpdateRehearsalPathEnv } from "../infra/update-rehearsal-paths.js";
import * as pluginResources from "../plugins/doctor-contract-registry.js";
import { getOpenClawDatabaseMaintenanceScope } from "../state/openclaw-state-db-async-lifecycle.js";
import {
  closeOpenClawStateDatabaseAsync,
  openOpenClawStateDatabase,
} from "../state/openclaw-state-db.js";
import { withEnvAsync } from "../test-utils/env.js";
import { withOpenClawTestState } from "../test-utils/openclaw-test-state.js";
import { beginDoctorMaintenance } from "./doctor-maintenance.js";

afterEach(() => vi.restoreAllMocks());

it("refuses to seal exclusions when the rehearsal environment changes during capture", async () => {
  await withOpenClawTestState({ scenario: "minimal" }, async (state) => {
    const stateDir = await fs.realpath(state.stateDir);
    const env: NodeJS.ProcessEnv = {
      ...buildUpdateRehearsalPathEnv(stateDir),
      OPENCLAW_UPDATE_IN_PROGRESS: "0",
      OPENCLAW_SERVICE_REPAIR_POLICY: "external",
      OPENCLAW_UPDATE_PARENT_ALLOWS_GATEWAY_SERVICE_REPAIR: "0",
      OPENCLAW_UPDATE_PARENT_ALLOWS_GATEWAY_ACTIVATION: "0",
    };
    await withEnvAsync(env, async () => {
      openOpenClawStateDatabase();
      await closeOpenClawStateDatabaseAsync();
      const runtime = {
        log() {},
        error() {},
        exit() {
          throw new Error("Doctor exited unexpectedly");
        },
      };
      const maintenance = await beginDoctorMaintenance({
        root: process.cwd(),
        options: { repair: true, nonInteractive: true },
        runtime,
      });
      expect(maintenance).toBeDefined();
      const captures = resolveUpdateCaptureRoot(stateDir);
      vi.spyOn(pluginResources, "preparePluginDoctorMigrationBackupResources").mockImplementation(
        async () => {
          env.TMPDIR = path.dirname(stateDir);
          return {
            resources: [],
            deferredPluginIds: new Set(),
            notices: [],
            assertCurrent() {},
          };
        },
      );
      try {
        await maintenance!.run(async () => {
          const scope = getOpenClawDatabaseMaintenanceScope()!;
          await expect(
            captureUpdateRecoveryBaseline({
              runId: "changed-rehearsal",
              installRoot: process.cwd(),
              env,
              drivers: [],
              assertCurrent: scope.assertAdmission,
              signal: maintenance!.signal,
            }),
          ).rejects.toThrow(/namespace changed/);
        });
        await expect(fs.lstat(captures)).rejects.toMatchObject({ code: "ENOENT" });
      } finally {
        await maintenance?.release();
        await fs.rm(captures, { recursive: true, force: true });
      }
    });
  });
});
