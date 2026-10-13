// Covers channel-configured checks from bootstrap and plugin metadata.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelPlugin } from "../channels/plugins/types.plugin.js";
import { isChannelConfigured } from "./channel-configured.js";

const bundledPlugins = vi.hoisted(() => ({
  getBundledChannelPlugin: vi.fn<() => ChannelPlugin | undefined>(),
  getBundledChannelSetupPlugin: vi.fn<() => ChannelPlugin | undefined>(),
}));

vi.mock("../channels/plugins/bundled.js", () => ({
  ...bundledPlugins,
  getBundledChannelSecrets: () => undefined,
  getBundledChannelSetupSecrets: () => undefined,
}));

function configuredStatePlugin(
  id: string,
  hasConfiguredState: NonNullable<ChannelPlugin["config"]["hasConfiguredState"]>,
): ChannelPlugin {
  return {
    id,
    meta: { id, label: id, selectionLabel: id, docsPath: "/testing", blurb: "Fixture" },
    capabilities: { chatTypes: ["direct"] },
    config: { listAccountIds: () => ["default"], resolveAccount: () => ({}), hasConfiguredState },
  };
}

describe("isChannelConfigured", () => {
  beforeEach(() => {
    bundledPlugins.getBundledChannelPlugin.mockReset();
    bundledPlugins.getBundledChannelSetupPlugin.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("detects Telegram env configuration through the package metadata seam", () => {
    expect(isChannelConfigured({}, "telegram", { TELEGRAM_BOT_TOKEN: "token" })).toBe(true);
  });

  it("still falls back to generic config presence for channels without a custom hook", () => {
    expect(
      isChannelConfigured(
        {
          channels: {
            signal: {
              transport: { kind: "managed-native", httpPort: 8080 },
            },
          },
        },
        "signal",
        {},
      ),
    ).toBe(true);
  });

  it("treats explicit enabled channel config as configured state", () => {
    expect(
      isChannelConfigured(
        {
          channels: {
            "openclaw-weixin": {
              enabled: true,
            },
          },
        },
        "openclaw-weixin",
        {},
      ),
    ).toBe(true);
  });

  it("does not treat disabled channel config as configured state", () => {
    expect(
      isChannelConfigured(
        {
          channels: {
            "openclaw-weixin": {
              enabled: false,
            },
          },
        },
        "openclaw-weixin",
        {},
      ),
    ).toBe(false);
  });

  it("retains setup bootstrap hooks when no configured-state metadata is declared", () => {
    const hasConfiguredState = vi.fn(
      ({ env }: { env?: NodeJS.ProcessEnv }) => env?.FIXTURE_TOKEN === "configured",
    );
    bundledPlugins.getBundledChannelPlugin.mockReturnValue(
      configuredStatePlugin("fixture", () => false),
    );
    bundledPlugins.getBundledChannelSetupPlugin.mockReturnValue(
      configuredStatePlugin("fixture", hasConfiguredState),
    );
    const env = { FIXTURE_TOKEN: "configured" };

    expect(isChannelConfigured({}, "fixture", env)).toBe(true);
    expect(hasConfiguredState).toHaveBeenCalledWith({ cfg: {}, env });
    expect(isChannelConfigured({}, "fixture", {})).toBe(false);
  });
});
