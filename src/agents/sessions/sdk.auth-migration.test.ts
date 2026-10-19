import { access, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { snapshotFiles } from "../../infra/state-migrations.caller-mode.test-helpers.js";
import { autoMigrateLegacyState } from "../../infra/state-migrations.doctor.js";
import { inspectLegacyAgentDir } from "../../infra/state-migrations.legacy-sessions.js";
import { EMPTY_LEGACY_SESSION_SURFACES } from "../../plugins/legacy-session-surfaces.types.js";
import {
  closeOpenClawAgentDatabaseByPathAsync,
  inspectOpenClawAgentDatabaseOwner,
  openOpenClawAgentDatabase,
} from "../../state/openclaw-agent-db.js";
import { withOpenClawTestState } from "../../test-utils/openclaw-test-state.js";
import { clearAuthProfileMigrationDiagnostics } from "../auth-profiles/legacy-source-diagnostic.js";
import { writePersistedAuthProfileStoreRaw } from "../auth-profiles/sqlite.js";
import type { ApiKeyCredential, AuthProfileStore } from "../auth-profiles/types.js";
import { getAgentDir } from "../config.js";
import { AuthStorage } from "./auth-storage.js";

function apiKeyStore(
  provider: string,
  credential: Pick<ApiKeyCredential, "key" | "keyRef">,
): AuthProfileStore {
  return {
    version: 1,
    profiles: { [`${provider}:default`]: { type: "api_key", provider, ...credential } },
  };
}

afterEach(() => {
  clearAuthProfileMigrationDiagnostics();
  vi.restoreAllMocks();
});

it("keeps a legacy SDK store when Doctor's configured owner differs", async () => {
  await withOpenClawTestState(
    { label: "sdk-legacy-owner", layout: "split", agentEnv: "clear" },
    async (state) => {
      vi.spyOn(os, "homedir").mockReturnValue(state.home);
      const legacyDir = path.join(state.home, ".openclaw", "agent");
      const databasePath = path.join(legacyDir, "openclaw-agent.sqlite");
      await mkdir(path.join(legacyDir, "bin"), { recursive: true });
      await writeFile(path.join(legacyDir, "bin", "fd"), "installed SDK tool");
      openOpenClawAgentDatabase({ agentId: "main", env: state.env, path: databasePath });
      await closeOpenClawAgentDatabaseByPathAsync(databasePath);
      expect(inspectOpenClawAgentDatabaseOwner(databasePath)).toEqual({
        status: "owned",
        agentId: "main",
      });
      // Ownership may use admitted facts; payload inspection materializes native WAL sidecars.
      expect(inspectLegacyAgentDir(legacyDir)).toEqual({ status: "payload" });
      const before = snapshotFiles(legacyDir);
      const cfg = { agents: { entries: { worker: {} } }, plugins: { enabled: false } };
      await state.writeConfig(cfg);

      const result = await autoMigrateLegacyState({
        cfg,
        homedir: () => state.home,
        doctorOnlyStateMigrations: true,
        legacySessionSurfaces: EMPTY_LEGACY_SESSION_SURFACES,
      });

      expect(result.stepReceipts.find((entry) => entry.outcome === "refused")).toBeUndefined();
      const receipt = result.stepReceipts.find((entry) => entry.id === "agent-dir");
      expect(receipt).toMatchObject({
        outcome: "deferred",
        deferred: [
          {
            reason: "owner-mismatch",
            recordedOwner: "main",
            configuredOwner: "worker",
            path: legacyDir,
          },
        ],
      });
      expect(receipt?.warnings).toEqual(
        expect.arrayContaining([expect.stringContaining("Keep using the existing store")]),
      );
      expect(snapshotFiles(legacyDir)).toEqual(before);
      await expect(
        access(path.join(state.agentDir("worker"), ".legacy-agent-dir-migration.json")),
      ).rejects.toMatchObject({ code: "ENOENT" });
      expect(getAgentDir()).toBe(legacyDir);
    },
  );
});

describe("SDK migration guard endpoint context", () => {
  it.each([
    { name: "local SecretRef across a shared Arcee refusal", secretRef: true, provider: "arcee" },
    {
      name: "unaffected provider beside a shared Arcee refusal",
      secretRef: false,
      provider: "openai",
    },
  ])("preserves $name", async ({ secretRef, provider }) => {
    const localKey = "synthetic-local-account-key";
    const otherKey = "synthetic-other-account-key";
    const unaffectedKey = "synthetic-unaffected-account-key";
    await withOpenClawTestState(
      {
        layout: "state-only",
        prefix: "auth-owner-preservation-",
        env: {
          ARCEEAI_API_KEY: otherKey,
          OPENAI_API_KEY: unaffectedKey,
          UNRESOLVED_LOCAL_ARCEE: undefined,
        },
      },
      async (state) => {
        await state.writeJson(
          "agents/main/agent/auth-profiles.json",
          apiKeyStore("arcee", { key: "synthetic-legacy-key" }),
        );
        const agentDir = state.agentDir("worker");
        await mkdir(agentDir, { recursive: true });
        writePersistedAuthProfileStoreRaw(
          apiKeyStore(
            "arcee",
            secretRef
              ? { keyRef: { source: "env", provider: "default", id: "UNRESOLVED_LOCAL_ARCEE" } }
              : { key: localKey },
          ),
          agentDir,
        );
        const baseUrl = "https://openrouter.ai/api/v1";
        const config = { models: { providers: { arcee: { baseUrl, models: [] } } } };
        const fallback = vi.fn(() => otherKey);
        const resolve = async () => {
          const storage = AuthStorage.forAgent(agentDir, config);
          storage.setFallbackResolver(fallback);
          return await storage.getApiKey(provider, provider === "arcee" ? { baseUrl } : undefined);
        };
        if (secretRef) {
          await expect(resolve()).rejects.toThrow(
            "requires the active secrets runtime to materialize SecretRef credentials",
          );
        } else {
          const credential = await resolve();
          expect(
            credential === (provider === "arcee" ? localKey : unaffectedKey),
            "returned credential belongs to the selected account",
          ).toBe(true);
        }
        expect(fallback).not.toHaveBeenCalled();
      },
    );
  });
});
