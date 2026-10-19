import fs from "node:fs/promises";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  createOpenClawTestState,
  type OpenClawTestState,
} from "../../test-utils/openclaw-test-state.js";
import { createRuntimeEnv } from "../../test-utils/plugin-runtime-env.js";
import { persistChannelPluginConfig } from "./plugin-config-persistence.js";

let state: OpenClawTestState;
beforeEach(async () => {
  state = await createOpenClawTestState({ prefix: "channel-setup-secrets-", applyEnv: true });
});
afterEach(async () => {
  await state.cleanup();
});

it("does not publish credentials after setup authority is revoked", async () => {
  await state.writeConfig({});
  const assertCurrent = vi.fn(() => {
    throw new Error("setup cancelled");
  });
  await expect(
    persistChannelPluginConfig({
      cfg: { channels: { telegram: { botToken: "cancelled-token" } } },
      pluginInstalled: false,
      runtime: createRuntimeEnv(),
      setup: { previousConfig: {}, assertCurrent },
    }),
  ).rejects.toThrow("setup cancelled");
  expect(await fs.readFile(state.configPath, "utf8")).not.toContain("cancelled-token");
});
