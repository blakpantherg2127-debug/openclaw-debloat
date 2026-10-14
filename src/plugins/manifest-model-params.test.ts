import path from "node:path";
import { describe, expect, it } from "vitest";
import { collectPluginSchemaMetadataCore } from "../config/channel-config-metadata.js";
import { buildConfigSchemaCore, lookupConfigSchema } from "../config/schema.js";
import { validateConfigObjectRawWithPlugins } from "../config/validation.js";
import { loadPluginManifestRegistryCore } from "./manifest-registry.js";
import { buildPluginMetadataProviderFacts } from "./plugin-metadata-provider-facts.js";

// Load the public manifest only; config validation must not activate provider runtime.
const rootDir = path.resolve("extensions/vllm");
const manifestRegistry = loadPluginManifestRegistryCore({
  installRecords: {},
  candidates: [
    { idHint: "vllm", rootDir, source: path.join(rootDir, "index.ts"), origin: "bundled" },
  ],
});
const metadata = { pluginMetadataSnapshot: { manifestRegistry } };

describe("provider-owned model params", () => {
  it("preserves omitted settings, ordinary params, and other provider namespaces", () => {
    const models = {
      "vllm/model": { params: { temperature: 0.3, priority: 0 } },
      "vllm/interactive": { params: { priorityScheduling: true } },
      "other/model": { params: { priorityScheduling: "other-provider-contract" } },
    };
    const result = validateConfigObjectRawWithPlugins(
      {
        agents: {
          defaults: { models },
          entries: { main: { models: { "vllm/interactive": { params: { temperature: 0.5 } } } } },
        },
      },
      metadata,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.agents?.defaults?.models).toEqual(models);
      expect(result.config.agents?.entries?.main?.models).toEqual({
        "vllm/interactive": { params: { temperature: 0.5 } },
      });
    }
  });

  it("budgets both default and per-agent copies of provider model schemas", () => {
    const response = buildConfigSchemaCore({
      plugins: [
        {
          id: "budget",
          providerRequest: {
            providers: Object.fromEntries(
              Array.from({ length: 5 }, (_, index) => [
                `demo${index}`,
                { modelParamsSchema: { type: "object", description: "x".repeat(220 * 1024) } },
              ]),
            ),
          },
        },
      ],
    });
    for (const scope of ["agents.defaults", "agents.entries.main"]) {
      expect(
        lookupConfigSchema(response, `${scope}.models.demo3/model.params`)?.schema.description,
      ).toHaveLength(220 * 1024);
      expect(
        lookupConfigSchema(response, `${scope}.models.demo4/model.params`)?.schema.description,
      ).toContain("exceeded the Gateway response budget");
    }
  });
});
