import { expect, it, vi } from "vitest";
import type { PreparedMessageToolCatalog } from "../../channels/plugins/message-action-discovery.js";
import type { ChannelPlugin } from "../../channels/plugins/types.public.js";
import { clearRuntimeConfigSnapshot, setRuntimeConfigSnapshot } from "../../config/config.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import {
  mintMessageActionTurnCapability,
  revokeMessageActionTurnCapability,
} from "../../gateway/message-action-turn-capability.js";
import {
  captureActivePluginRegistrySnapshot,
  restoreActivePluginRegistrySnapshot,
  setActivePluginRegistry,
} from "../../plugins/runtime.js";
import {
  createChannelTestPluginBase,
  createTestRegistry,
} from "../../test-utils/channel-plugins.js";
import { createMessageTool, createMessageToolAsync } from "./message-tool-execution.js";

const target = "channel:100000000000000001";

it.each([
  { scheduled: true, currentChannelProvider: "signal", actions: ["poll", "send"] },
  { scheduled: true, currentChannelProvider: undefined, actions: ["broadcast", "poll", "send"] },
  { scheduled: false, currentChannelProvider: "signal", actions: ["send"] },
  { scheduled: false, currentChannelProvider: undefined, actions: ["broadcast", "send"] },
])(
  "keeps configured-channel schemas only for admitted scheduled turns ($scheduled, $currentChannelProvider)",
  async ({ scheduled, currentChannelProvider, actions }) => {
    const identity = {
      agentId: "main",
      runId: "scheduled-schema-run",
      sessionKey: "agent:main:cron:scheduled-schema:run:fixture",
    };
    const channels: PreparedMessageToolCatalog["channels"] = [
      {
        id: "signal",
        reconcilesUnknownSend: false,
        actions: { describeMessageTool: () => ({ actions: ["send"] }) },
      },
      {
        id: "discord",
        reconcilesUnknownSend: false,
        actions: { describeMessageTool: () => ({ actions: ["send", "poll"] }) },
      },
    ];
    const config: OpenClawConfig = {
      bindings: [{ agentId: "main", match: { channel: "signal" } }],
      channels: { signal: { enabled: true }, discord: { enabled: true } },
    };
    const capability = scheduled
      ? mintMessageActionTurnCapability({
          ...identity,
          scheduled: { policy: { version: 1, mode: "trusted" }, assertCurrent() {} },
        })
      : undefined;
    try {
      setRuntimeConfigSnapshot(config);
      const tool = await createMessageToolAsync({
        config,
        agentId: identity.agentId,
        agentSessionKey: identity.sessionKey,
        runId: identity.runId,
        currentChannelProvider,
        messageActionTurnCapability: capability,
        admitScheduledInvocation: () => config,
        preparedMessageToolCatalog: {
          version: 1,
          channels,
          getChannel: (id) => channels.find((channel) => channel.id === id),
        },
      });
      expect(tool.parameters).toHaveProperty("properties.action.enum", actions);
      for (const property of ["pollQuestion", "pollOption", "pollMulti"]) {
        if (scheduled) {
          expect(tool.parameters).toHaveProperty(`properties.${property}`);
        } else {
          expect(tool.parameters).not.toHaveProperty(`properties.${property}`);
        }
      }
    } finally {
      revokeMessageActionTurnCapability(capability);
      clearRuntimeConfigSnapshot();
    }
  },
);

it("separates generic sends, source reads, and simulated writes", async () => {
  const registry = captureActivePluginRegistrySnapshot();
  const identity = {
    agentId: "main",
    runId: "source-withdrawal-run",
    sessionKey: "agent:main:cron:source-withdrawal:run:fixture",
  };
  let messageCurrent = true;
  let sourceCurrent = true;
  const assertMessageCurrent = vi.fn(() => {
    if (!messageCurrent) {
      throw new Error("message authority expired");
    }
  });
  const assertSourceCurrent = vi.fn(() => {
    if (!sourceCurrent) {
      throw new Error("source authorization expired");
    }
  });
  const capability = mintMessageActionTurnCapability({
    ...identity,
    scheduled: {
      policy: { version: 1, mode: "trusted" },
      assertCurrent: assertMessageCurrent,
      assertSourceCurrent,
    },
  });
  const outboundBoundary = new Error("generic send reached outbound dispatch");
  try {
    const plugin: ChannelPlugin = {
      ...createChannelTestPluginBase({ id: "discord" }),
      actions: { describeMessageTool: () => ({ actions: ["send", "read"] }) },
    };
    setActivePluginRegistry(createTestRegistry([{ pluginId: "discord", source: "test", plugin }]));
    const config: OpenClawConfig = { channels: { discord: { token: "fixture-token" } } };
    setRuntimeConfigSnapshot(config);
    const tool = createMessageTool({
      config,
      agentId: identity.agentId,
      agentSessionKey: identity.sessionKey,
      runId: identity.runId,
      messageActionTurnCapability: capability,
      admitScheduledInvocation: () => config,
      runMessageAction: async (input) => {
        if (input.params.dryRun === true) {
          messageCurrent = false;
          return {
            kind: "send",
            channel: "discord",
            action: "send",
            to: "channel:100000000000000001",
            handledBy: "plugin",
            payload: { ok: true },
            dryRun: true,
          };
        }
        throw outboundBoundary;
      },
    });

    const execute = (callId: string, params: Record<string, unknown>) =>
      tool.execute(callId, { channel: "discord", target, ...params });
    sourceCurrent = false;
    await expect(
      execute("generic-send", { action: "send", message: "Still authorized" }),
    ).rejects.toBe(outboundBoundary);
    await expect(execute("source-read", { action: "read" })).rejects.toThrow(
      "source authorization expired",
    );
    expect(assertMessageCurrent).toHaveBeenCalled();
    expect(assertSourceCurrent).toHaveBeenCalledOnce();
    await expect(
      execute("scheduled-dry-run", {
        action: "send",
        message: "Simulate only",
        dryRun: true,
      }),
    ).rejects.toThrow("message authority expired");
  } finally {
    revokeMessageActionTurnCapability(capability);
    restoreActivePluginRegistrySnapshot(registry);
    clearRuntimeConfigSnapshot();
  }
});
