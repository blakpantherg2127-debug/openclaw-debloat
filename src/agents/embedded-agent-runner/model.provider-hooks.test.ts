import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import type { Model } from "../../llm/types.js";
import { setCurrentPluginMetadataSnapshot } from "../../plugins/current-plugin-metadata.test-support.js";
import { createPluginMetadataSnapshotFixture } from "../../plugins/plugin-metadata.test-support.js";
import { resolveAgentToolSurfacePlan } from "../tool-surface-plan.js";
import { normalizeResolvedModel, resolveRuntimeHooks } from "./model.provider-hooks.js";

vi.mock("../../plugins/provider-runtime.js", () => ({
  applyProviderResolvedTransportWithPlugin: () => undefined,
  buildProviderUnknownModelHintWithPlugin: () => undefined,
  normalizeProviderResolvedModelWithPlugin: () => undefined,
  normalizeProviderTransportWithPlugin: () => undefined,
  prepareProviderDynamicModel: async () => {},
  runProviderDynamicModel: () => undefined,
  shouldPreferProviderRuntimeResolvedModel: () => false,
}));

function model(overrides: Partial<Model> = {}): Model {
  return {
    id: "small-model",
    name: "Small model",
    provider: "custom-host",
    api: "ollama",
    baseUrl: "http://model-host.example:11434",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 32_768,
    maxTokens: 4_096,
    ...overrides,
  };
}

function toolSearchEnabled(resolvedModel: Model, config: OpenClawConfig = {}): boolean {
  return resolveAgentToolSurfacePlan({
    config,
    model: resolvedModel,
    modelProvider: resolvedModel.provider,
    modelId: resolvedModel.id,
    forceDirectMessageTool: false,
    toolsEnabled: true,
    isRawModelRun: false,
  }).toolSearchControlsEnabled;
}

describe("resolved model Tool Search policy", () => {
  beforeAll(() => {
    vi.stubEnv("OPENCLAW_BUNDLED_PLUGINS_DIR", path.resolve("extensions"));
    setCurrentPluginMetadataSnapshot(createPluginMetadataSnapshotFixture());
  });
  afterAll(() => {
    setCurrentPluginMetadataSnapshot(undefined);
    vi.unstubAllEnvs();
  });

  it("uses in-place model normalization for transport routing", () => {
    const resolved = normalizeResolvedModel({
      provider: "custom-host",
      model: model(),
      runtimeHooks: {
        ...resolveRuntimeHooks(),
        normalizeProviderResolvedModelWithPlugin: ({ context }) => {
          context.model.id = "normalized-model";
          return context.model;
        },
        applyProviderResolvedTransportWithPlugin: ({ context }) => ({
          ...context.model,
          baseUrl: `https://transport.example/v1/${context.modelId}`,
        }),
      },
    });
    expect(resolved.id).toBe("normalized-model");
    expect(resolved.baseUrl).toBe("https://transport.example/v1/normalized-model");
  });

  it.each([
    {
      finalBaseUrl: "http://managed.example:8080/v1/",
      api: "openai-completions",
      expected: "tools",
    },
    { finalBaseUrl: "https://hosted.example/v1", api: "openai-completions", expected: undefined },
  ] as const)(
    "limits managed inference defaults to $finalBaseUrl",
    ({ finalBaseUrl, api, expected }) => {
      const cfg: OpenClawConfig = {
        models: {
          providers: {
            " CUSTOM-HOST ": {
              baseUrl: "http://managed.example:8080/v1",
              api,
              models: [],
              localService: { command: "/fixture/server" },
            },
          },
        },
      };
      const resolved = normalizeResolvedModel({
        provider: "custom-host",
        model: model({ api, baseUrl: finalBaseUrl }),
        cfg,
      });
      expect(resolved).toHaveProperty("toolSearchMode", expected);
      expect(toolSearchEnabled(resolved, cfg)).toBe(true);
      expect(cfg.tools).toBeUndefined();
    },
  );
});
