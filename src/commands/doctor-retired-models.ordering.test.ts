import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildAllowedModelSet,
  buildModelAliasIndex,
  resolveModelRefFromString,
} from "../agents/model-selection-shared.js";
import { loadSessionEntry, replaceSessionEntry } from "../config/sessions/session-accessor.js";
import type { ModelDefinitionConfig } from "../config/types.models.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { loadCronJobsStore, resolveCronJobsStorePath, saveCronJobsStore } from "../cron/store.js";
import { runWriteConfigHealth } from "../flows/doctor-health-contribution-runners.config.js";
import { runCodexSessionRouteHealth } from "../flows/doctor-health-contribution-runners.state.js";
import type { DoctorHealthFlowContext } from "../flows/doctor-health-contribution-types.js";
import { createDoctorPrompter } from "./doctor-prompter.js";
import {
  createNativeXaiRetirementFixture as nativeFixture,
  createRetiredModelFixture as fixture,
} from "./doctor-retired-models.test-support.js";
import { repairCronCodexModelRefsAfterConfigWrite } from "./doctor/cron/legacy-repair.js";
import { maybeRepairCodexSessionRoutes } from "./doctor/shared/codex-route-session-repair.js";
import { repairStaleAgentModelRefs } from "./doctor/shared/stale-agent-model-ref-repair.js";

async function seedCronModel(id: string, model: string) {
  const storePath = resolveCronJobsStorePath();
  await saveCronJobsStore(storePath, {
    version: 1,
    jobs: [
      {
        id,
        agentId: "main",
        name: "Synthetic reminder",
        enabled: true,
        createdAtMs: 1,
        updatedAtMs: 1,
        schedule: { kind: "every", everyMs: 60000, anchorMs: 1 },
        sessionTarget: "isolated",
        wakeMode: "now",
        state: {},
        payload: { kind: "agentTurn", message: "Synthetic reminder", model },
      },
    ],
  });
  return storePath;
}

describe("doctor retirement repair ordering", () => {
  it("retains a pinned session when clearing would keep the exact retired model account", async () => {
    const { cfg, state } = await fixture("api-key");
    const retiredRef = "openai/retired-without-successor";
    cfg.agents!.defaults!.model = retiredRef;
    cfg.agents!.defaults!.models = { [retiredRef]: { alias: "retired-alias" } };
    const sessions = path.join(state.sessionsDir(), "sessions.json");
    const selections = [
      { source: "user", model: "retired-without-successor", provider: "openai" },
      { source: "user-link", model: "retired-alias", provider: undefined },
    ] as const;
    for (const selection of selections) {
      await replaceSessionEntry(
        { storePath: sessions, sessionKey: `agent:main:no-op-${selection.source}`, env: state.env },
        {
          sessionId: `no-op-${selection.source}`,
          updatedAt: 1,
          providerOverride: selection.provider,
          modelOverride: selection.model,
          authProfileOverride: "chatgpt",
          authProfileOverrideSource: selection.source,
        },
      );
    }
    const cronStore = await seedCronModel("clear-cron-pin", `${retiredRef}@chatgpt`);
    const configRepair = repairStaleAgentModelRefs(cfg, {
      env: state.env,
      pluginProviderIds: new Set(["openai"]),
      persistedProviderIdsByAgentId: new Map(),
    });
    expect(configRepair.changes).toEqual([]);
    await state.writeConfig(configRepair.config);
    const result = await maybeRepairCodexSessionRoutes({
      cfg: configRepair.config,
      env: state.env,
      shouldRepair: true,
    });
    expect.soft(result.repairedSessions).toBe(0);
    for (const selection of selections) {
      const entry = loadSessionEntry({
        storePath: sessions,
        sessionKey: `agent:main:no-op-${selection.source}`,
        env: state.env,
      });
      expect.soft(entry).toMatchObject({
        modelOverride: selection.model,
        authProfileOverride: "chatgpt",
        authProfileOverrideSource: selection.source,
      });
      expect.soft(entry?.providerOverride).toBe(selection.provider);
    }
    expect.soft(result.warnings).toHaveLength(1);
    for (const expected of [
      retiredRef,
      'agent "main"',
      "supported default",
      "allowed model override",
      "doctor --fix",
    ]) {
      expect.soft(result.warnings.join("\n")).toContain(expected);
    }
    const cronRepair = await repairCronCodexModelRefsAfterConfigWrite({
      migrateCodexModelRefs: true,
      cfg: configRepair.config,
      repairRetiredModelRefs: true,
    });
    const payload = (await loadCronJobsStore(cronStore)).jobs[0]?.payload;
    expect(payload?.kind === "agentTurn" ? payload.model : undefined).toBeUndefined();
    expect(cronRepair.warnings).toEqual([]);
  });

  it.each(["blocked", "unrestricted", "already allowed"])(
    "checks pinned subscription successors against %s owner policy",
    async (policy) => {
      const { cfg, state } = await fixture("api-key");
      const retiredRef = "openai/retired-with-successor";
      const successor = "openai/current-model";
      cfg.agents!.defaults!.model = retiredRef;
      if (policy !== "unrestricted") {
        cfg.agents!.entries!.main!.modelPolicy = {
          allow: policy === "blocked" ? [retiredRef] : [retiredRef, successor],
        };
      }
      const sessions = path.join(state.sessionsDir(), "sessions.json");
      for (const source of ["user", "user-link"] as const) {
        await replaceSessionEntry(
          { storePath: sessions, sessionKey: `agent:main:pinned-${source}`, env: state.env },
          {
            sessionId: `pinned-${source}`,
            updatedAt: 1,
            providerOverride: "openai",
            modelOverride: "retired-with-successor",
            authProfileOverride: "chatgpt",
            authProfileOverrideSource: source,
          },
        );
      }
      const cronStore = await seedCronModel("pinned-policy", `${retiredRef}@chatgpt`);
      const repair = repairStaleAgentModelRefs(cfg, {
        env: state.env,
        pluginProviderIds: new Set(["openai"]),
        persistedProviderIdsByAgentId: new Map(),
      });
      expect(repair.config).toEqual(cfg);
      await state.writeConfig(repair.config);
      const sessionRepair = await maybeRepairCodexSessionRoutes({
        cfg: repair.config,
        env: state.env,
        shouldRepair: true,
      });
      const cronRepair = await repairCronCodexModelRefsAfterConfigWrite({
        migrateCodexModelRefs: true,
        cfg: repair.config,
        repairRetiredModelRefs: true,
      });
      for (const source of ["user", "user-link"] as const) {
        expect
          .soft(
            loadSessionEntry({
              storePath: sessions,
              sessionKey: `agent:main:pinned-${source}`,
              env: state.env,
            }),
          )
          .toMatchObject({
            providerOverride: "openai",
            modelOverride: policy === "blocked" ? "retired-with-successor" : "current-model",
            authProfileOverride: "chatgpt",
            authProfileOverrideSource: source,
          });
      }
      const payload = (await loadCronJobsStore(cronStore)).jobs[0]?.payload;
      expect
        .soft(payload?.kind === "agentTurn" ? payload.model : undefined)
        .toBe(`${policy === "blocked" ? retiredRef : successor}@chatgpt`);
      for (const result of [sessionRepair, cronRepair]) {
        if (policy === "blocked") {
          const warning = result.warnings.join("\n");
          for (const expected of [
            successor,
            'agent "main"',
            "agents.entries.main.modelPolicy.allow",
            "doctor --fix",
            "allowed model override",
          ]) {
            expect.soft(warning).toContain(expected);
          }
        } else {
          expect(result.warnings).toEqual([]);
        }
      }
      expect(repair.config).toEqual(cfg);
    },
  );

  it.each([
    { scenario: "shared alias", profile: "chatgpt" },
    { scenario: "changed default provider", profile: "chatgpt" },
    { scenario: "shared alias", profile: "platform" },
    { scenario: "changed default provider", profile: "platform" },
    { scenario: "provider-wide alias", profile: "chatgpt" },
    { scenario: "successor alias policy", profile: "platform" },
  ])("preserves $profile refs after config changes $scenario", async ({ scenario, profile }) => {
    const { cfg, state } = await fixture();
    const providerWide = scenario === "provider-wide alias";
    const sharedAlias = scenario === "shared alias" || scenario === "successor alias policy";
    const retiredRef = providerWide
      ? "openai/retired-global-without-successor"
      : scenario === "successor alias policy"
        ? "openai/retired-with-successor"
        : "openai/retired-without-successor";
    const rawRef = scenario === "changed default provider" ? "retired-without-successor" : "daily";
    const settings = {
      alias: "daily",
      agentRuntime: { id: "openclaw" },
      params: { temperature: 0.25, maxTokens: 128 },
    };
    cfg.agents!.entries!.main!.models = { [retiredRef]: settings };
    const policyRef = scenario === "successor alias policy" ? "daily" : retiredRef;
    cfg.agents!.entries!.main!.modelPolicy = { allow: [policyRef] };
    if (scenario === "changed default provider") {
      cfg.agents!.defaults!.model = "anthropic/current-model";
      cfg.agents!.entries!.main!.model = retiredRef;
    }
    const sessionStorePath = path.join(state.sessionsDir(), "sessions.json");
    const sessionKey = "agent:main:retired-ordering";
    await replaceSessionEntry(
      { storePath: sessionStorePath, sessionKey, env: state.env },
      {
        sessionId: "retired-ordering",
        updatedAt: 1,
        modelOverride: rawRef,
        authProfileOverride: profile,
        authProfileOverrideSource: "user",
      },
    );
    const cronStorePath = await seedCronModel(
      "retired-ordering",
      profile === "platform" ? `${rawRef}@platform` : rawRef,
    );
    const repair = repairStaleAgentModelRefs(cfg, {
      env: state.env,
      pluginProviderIds: new Set(["openai", "anthropic"]),
      persistedProviderIdsByAgentId: new Map(),
    });
    expect
      .soft(repair.config.agents?.entries?.main?.models?.[retiredRef])
      .toEqual(providerWide ? undefined : settings);
    const defaultRef =
      scenario === "changed default provider" ? "anthropic/current-model" : "openai/current-model";
    expect
      .soft(repair.config.agents?.entries?.main?.modelPolicy?.allow)
      .toEqual(providerWide ? [defaultRef] : [policyRef, defaultRef]);
    if (scenario === "successor alias policy") {
      const { alias: _alias, ...successorSettings } = settings;
      expect
        .soft(repair.config.agents?.entries?.main?.models?.[defaultRef])
        .toEqual(successorSettings);
    }
    const allowed = buildAllowedModelSet({
      cfg: repair.config,
      agentId: "main",
      catalog: [],
      defaultProvider: scenario === "changed default provider" ? "anthropic" : "openai",
      defaultModel: "current-model",
    });
    expect.soft(allowed.allowAny).toBe(false);
    expect.soft(allowed.allowedKeys.has(retiredRef)).toBe(!providerWide);
    expect.soft(allowed.allowedKeys.has(defaultRef)).toBe(true);
    expect(repair.config.agents?.entries?.main?.model).toBeUndefined();
    await state.writeConfig(repair.config);
    const runtime = { log: vi.fn(), error: vi.fn(), exit: vi.fn() };
    const options = { repair: true, nonInteractive: true };
    const ctx: DoctorHealthFlowContext = {
      cfg: repair.config,
      cfgForPersistence: structuredClone(repair.config),
      configResult: { ...repair, cfg: repair.config },
      configPath: state.configPath,
      sourceConfigValid: true,
      env: state.env,
      runtime,
      options,
      prompter: createDoctorPrompter({ runtime, options }),
    };
    await runCodexSessionRouteHealth(ctx);
    await runWriteConfigHealth(ctx);
    const savedSession = loadSessionEntry({
      storePath: sessionStorePath,
      sessionKey,
      env: state.env,
    });
    expect
      .soft(savedSession?.modelOverride)
      .toBe(
        profile === "platform" ? (sharedAlias ? "daily" : "retired-without-successor") : undefined,
      );
    if (profile === "platform") {
      expect.soft(savedSession).toMatchObject({
        authProfileOverride: "platform",
        authProfileOverrideSource: "user",
      });
      expect.soft(savedSession?.providerOverride).toBe(sharedAlias ? undefined : "openai");
      const interpretation = { cfg: repair.config, agentId: "main", defaultProvider: "openai" };
      expect(
        resolveModelRefFromString({
          ...interpretation,
          raw: savedSession!.modelOverride!,
          aliasIndex: buildModelAliasIndex(interpretation),
        })?.ref,
      ).toEqual({ provider: "openai", model: retiredRef.slice("openai/".length) });
    }
    const payload = (await loadCronJobsStore(cronStorePath)).jobs[0]?.payload;
    expect(payload?.kind === "agentTurn" ? payload.model : undefined).toBe(
      profile === "platform" ? `${sharedAlias ? rawRef : retiredRef}@platform` : undefined,
    );
    expect(
      repairStaleAgentModelRefs(repair.config, {
        env: state.env,
        pluginProviderIds: new Set(["openai", "anthropic"]),
        persistedProviderIdsByAgentId: new Map(),
      }).changes,
    ).toEqual([]);
  });
});

describe("doctor retirement owner scope", () => {
  it.each(["provider", "model"] as const)(
    "keeps Grok on an explicit custom %s endpoint under the xAI provider",
    async (endpointOwner) => {
      const { cfg, repair } = await nativeFixture();
      const customModel: ModelDefinitionConfig = {
        id: "auto",
        name: "Custom automatic model",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 8192,
        maxTokens: 1024,
        ...(endpointOwner === "model" ? { baseUrl: "https://custom.example.test/v1" } : {}),
      };
      cfg.models!.providers!.xai!.models = [customModel];
      if (endpointOwner === "provider") {
        cfg.models!.providers!.xai!.baseUrl = "https://custom.example.test/v1";
      }
      const result = repair(cfg);

      expect(result.config).toEqual(cfg);
      expect(result.config.agents?.defaults?.models?.["xai/auto"]?.alias).toBe("Grok");
      expect(result.changes).toEqual([]);
      expect(result.warnings).toEqual([]);
    },
  );

  it("preserves a shared alias when another physical route still accepts its old model", async () => {
    const { cfg, state } = await fixture();
    cfg.agents!.defaults!.model = "retired-alias";
    cfg.agents!.defaults!.models = {
      "openai/retired-with-successor": { alias: "retired-alias", params: { temperature: 0.25 } },
    };
    cfg.agents!.defaults!.modelPolicy = { allow: ["openai/retired-with-successor"] };
    const repair = (config: OpenClawConfig) =>
      repairStaleAgentModelRefs(config, {
        env: state.env,
        pluginProviderIds: new Set(["openai"]),
        persistedProviderIdsByAgentId: new Map(),
      });
    const result = repair(cfg);

    expect(result.config.agents?.defaults?.model).toBe("openai/current-model");
    expect(result.config.agents?.defaults?.models).toEqual({
      "openai/retired-with-successor": { alias: "retired-alias", params: { temperature: 0.25 } },
      "openai/current-model": { params: { temperature: 0.25 } },
    });
    expect(result.config.agents?.defaults?.modelPolicy?.allow).toEqual([
      "openai/retired-with-successor",
      "openai/current-model",
    ]);
    expect(result.warnings.join("\n")).toContain("do not share a verified successor");
    const repeated = repair(result.config);
    expect(repeated.config).toEqual(result.config);
    expect(repeated.changes).toEqual([]);
  });
});
