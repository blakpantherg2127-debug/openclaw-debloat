import { expect, it, vi } from "vitest";
import { createTestPluginApi } from "../plugin-sdk/plugin-test-api.js";
import type { OpenClawPluginDefinition } from "../plugins/plugin-definition.types.js";
import { setActivePluginRegistry } from "../plugins/runtime.js";
import { createServiceRegistration } from "../plugins/services.test-support.js";
import { loadBundledPluginFacade } from "../test-utils/bundled-plugin-public-surface.js";
import { createTestRegistry } from "../test-utils/channel-plugins.js";
import "../test-utils/prepare-compiled-subprocesses.js";
import { buildGatewayReloadPlan } from "./config-reload-plan.js";

const { default: browser } = await loadBundledPluginFacade<{
  default: OpenClawPluginDefinition;
}>({
  pluginId: "browser",
  artifactBasename: "index.ts",
});

export function registerPluginServiceReloadTests() {
  const emptyRegistry = createTestRegistry([]);
  it("reloads the registered Browser service for control policy without restarting the Gateway", () => {
    if (!browser.register) {
      throw new Error("Browser plugin must expose its registration entry point");
    }
    const registry = createTestRegistry([]);
    browser.register(
      createTestPluginApi({
        runtime: {
          state: {
            openSyncKeyedStore: () => ({ entries: () => [] }),
            openKeyedStore: vi.fn(),
          },
        } as never,
        registerService(service) {
          registry.services.push(
            createServiceRegistration(service, { pluginId: "browser", origin: "bundled" }),
          );
        },
      }),
    );
    registry.reloads.push({
      pluginId: "browser",
      source: "test",
      registration: browser.reload ?? {},
    });
    setActivePluginRegistry(registry);
    try {
      for (const path of [
        "browser.enabled",
        "browser.evaluateEnabled",
        "browser.ssrfPolicy.allowedHostnames",
        "browser.extensionRelay.allowLegacyAuth",
      ]) {
        const plan = buildGatewayReloadPlan([path]);
        expect(plan.restartGateway, path).toBe(false);
        expect(plan.restartServices, path).toEqual(new Set(["browser-control"]));
        expect(plan.reloadPlugins, path).toBe(false);
        expect(plan.restartChannels.size, path).toBe(0);
      }
      const profiles = buildGatewayReloadPlan(["browser.profiles.openclaw.headless"]);
      expect(profiles.restartGateway).toBe(false);
      expect(profiles.restartServices).toEqual(new Set());
    } finally {
      setActivePluginRegistry(emptyRegistry);
    }
  });
}
