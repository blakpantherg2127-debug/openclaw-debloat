import { describe, expect, it } from "vitest";
import { getConfigValueAtPath, setConfigValueAtPath } from "../../../config/config-paths.js";
import { findLegacyConfigIssues } from "../../../config/legacy.js";
import { resolveToolsBySender } from "../../../config/tools-by-sender.js";
import type { GroupToolPolicyBySenderConfig } from "../../../config/types.tools.js";
import { validateConfigObjectRaw } from "../../../config/validation-core.js";
import { applyLegacyDoctorMigrations } from "./legacy-config-compat.js";
import { migrateLegacyConfig } from "./legacy-config-migrate.js";

describe("Doctor sender tool policy migration", () => {
  const opaque = { toolsBySender: { external: { template: "unchanged" } } };
  const canonical: GroupToolPolicyBySenderConfig = {
    "id:@alice:example.invalid": { deny: ["exec"] },
    "channel:matrix:@alice:example.invalid": { deny: ["write"] },
    "e164:+15550001111": { allow: ["read"] },
    "username:@alice": { allow: ["read"] },
    "name:Alice": { deny: ["exec"] },
    "*": { deny: ["exec"] },
  };
  it.each([
    {
      agents: {
        defaults: { params: opaque },
        entries: { main: { models: { "example/model": { params: opaque } } } },
      },
      plugins: { entries: { example: { config: opaque } } },
      channels: { example: { groups: { room: opaque } } },
    },
    { channels: { whatsapp: { groups: { "123@g.us": { toolsBySender: canonical } } } } },
  ])("leaves canonical and opaque sender policies unchanged: %j", (raw) => {
    const original = structuredClone(raw);
    expect(validateConfigObjectRaw(raw).ok).toBe(true);
    expect(findLegacyConfigIssues(raw)).toEqual([]);
    expect(
      applyLegacyDoctorMigrations(raw, {
        sourceConfigBeforeMigrations: raw,
        pluginContracts: false,
      }),
    ).toEqual({ next: null, changes: [] });
    expect(migrateLegacyConfig(raw, { sourceConfigBeforeMigrations: raw }).changes).toEqual([]);
    expect(raw).toEqual(original);
  });

  it.each([
    "tools.toolsBySender",
    "agents.entries.main.tools.toolsBySender",
    "channels.telegram.direct.user.toolsBySender",
  ])("migrates the declared policy scope %s", (location) => {
    const raw: Record<string, unknown> = {};
    const path = location.split(".");
    setConfigValueAtPath(raw, path, { Alice: { deny: ["exec"] } });
    expect(findLegacyConfigIssues(raw)).toContainEqual(
      expect.objectContaining({ message: expect.stringContaining("Untyped toolsBySender") }),
    );
    const migrated = applyLegacyDoctorMigrations(raw, {
      sourceConfigBeforeMigrations: raw,
      pluginContracts: false,
    });
    expect(getConfigValueAtPath(migrated.next ?? {}, path)).toEqual({
      "id:Alice": { deny: ["exec"] },
    });
  });

  it("removes no-effect empty keys without creating sender identities and is idempotent", () => {
    const raw = {
      tools: {
        toolsBySender: {
          "": { allow: ["exec"] },
          " \t ": { deny: ["read"] },
          "@": { allow: ["write"] },
          Alice: { deny: ["exec"] },
          "*": { deny: ["write"] },
        },
      },
    };
    const original = structuredClone(raw);
    const migrated = migrateLegacyConfig(raw, { sourceConfigBeforeMigrations: raw });
    expect(migrated.partiallyValid).toBeUndefined();
    const toolsBySender = migrated.sourceConfig?.tools?.toolsBySender;
    expect(toolsBySender).toEqual({
      "id:Alice": { deny: ["exec"] },
      "*": { deny: ["write"] },
    });
    expect(validateConfigObjectRaw(migrated.sourceConfig).ok).toBe(true);
    expect(resolveToolsBySender({ toolsBySender, senderId: "Alice" })).toEqual({ deny: ["exec"] });
    expect(resolveToolsBySender({ toolsBySender, senderId: "other" })).toEqual({ deny: ["write"] });
    expect(migrated.changes).toContain(
      "tools.toolsBySender: removed 3 empty untyped sender key(s) that matched no sender; original entries remain in the config backup.",
    );
    expect(raw).toEqual(original);
    expect(findLegacyConfigIssues(migrated.sourceConfig)).toEqual([]);
    expect(
      migrateLegacyConfig(migrated.sourceConfig, {
        sourceConfigBeforeMigrations: migrated.sourceConfig,
      }).changes,
    ).toEqual([]);
  });
});
