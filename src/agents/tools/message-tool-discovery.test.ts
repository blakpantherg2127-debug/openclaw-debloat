import { expectDefined } from "@openclaw/normalization-core";
import { asOptionalRecord } from "@openclaw/normalization-core/record-coerce";
import { Type } from "typebox";
import { Value } from "typebox/value";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { readDeliveryMock, getChannelPluginMock, getBootstrapChannelPluginMock } = vi.hoisted(
  () => ({
    readDeliveryMock: vi.fn(),
    getChannelPluginMock: vi.fn(),
    getBootstrapChannelPluginMock: vi.fn(),
  }),
);

vi.mock("../../channels/plugins/bootstrap-registry.js", () => ({
  getBootstrapChannelPlugin: getBootstrapChannelPluginMock,
}));
vi.mock("../../config/sessions/delivery-info.js", () => ({
  readExactSessionDeliveryContext: readDeliveryMock,
}));
vi.mock("../../channels/plugins/index.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../channels/plugins/index.js")>()),
  getChannelPlugin: getChannelPluginMock,
}));

import type { PreparedMessageToolCatalog } from "../../channels/plugins/message-action-discovery.js";
import { resolveBundledChannelMessageToolDiscoveryAdapter } from "../../channels/plugins/message-tool-api.js";
import type { ChannelMessageActionDiscoveryContext } from "../../channels/plugins/types.public.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { settlePreparedMessageToolCatalog } from "../../plugins/prepared-message-tool-catalog.js";
import { resetPluginRuntimeStateForTest, setActivePluginRegistry } from "../../plugins/runtime.js";
import {
  createChannelTestPluginBase,
  createTestRegistry,
} from "../../test-utils/channel-plugins.js";
import {
  buildMessageToolDescription,
  buildMessageToolSchema,
  resolveMessageToolActionSchemaActions,
  resolveEffectiveCurrentChannelContextForRequest,
  resolveMessageToolDiscoveryAsync,
  type MessageToolDiscoveryParams,
} from "./message-tool-discovery.js";

const canonicalSpace = "spaces/AAQA1bC2dEf";
const foldedSpace = "spaces/aaqa1bc2def";
const options = {
  currentChannelProvider: "webchat",
  agentSessionKey: `agent:main:googlechat:group:${foldedSpace}`,
};
const request = { config: {}, action: "send" as const, params: {} };

describe("session-derived message destinations", () => {
  beforeEach(() => {
    getBootstrapChannelPluginMock.mockReset();
    readDeliveryMock.mockReset();
    readDeliveryMock.mockReturnValue({
      channel: "googlechat",
      to: `googlechat:${canonicalSpace}`,
      accountId: "default",
    });
    getChannelPluginMock.mockReset();
    getChannelPluginMock.mockReturnValue({
      config: { listAccountIds: () => ["default"] },
      messaging: { targetIdComparison: "case-sensitive" },
    });
  });

  it.each<{
    name: string;
    delivery?: { channel: string; to: string; accountId?: string };
    direct?: boolean;
    expected: string;
  }>([
    {
      name: "canonical group",
      delivery: { channel: "googlechat", to: `googlechat:${canonicalSpace}`, accountId: "default" },
      expected: canonicalSpace,
    },
    { name: "missing delivery", expected: foldedSpace },
    {
      name: "another channel",
      delivery: { channel: "slack", to: canonicalSpace },
      expected: foldedSpace,
    },
    {
      name: "another peer",
      delivery: { channel: "googlechat", to: "spaces/Other" },
      expected: foldedSpace,
    },
    {
      name: "another account",
      delivery: { channel: "googlechat", to: canonicalSpace, accountId: "other" },
      expected: foldedSpace,
    },
    {
      name: "direct account and thread",
      direct: true,
      delivery: { channel: "googlechat", to: canonicalSpace, accountId: "work" },
      expected: canonicalSpace,
    },
  ])("recovers only the matching route: $name", async ({ delivery, direct, expected }) => {
    readDeliveryMock.mockReturnValue(delivery);
    expect(
      await resolveEffectiveCurrentChannelContextForRequest(
        direct
          ? {
              ...options,
              agentSessionKey: `agent:main:googlechat:work:direct:${foldedSpace}:thread:Thread1`,
            }
          : options,
        direct ? { ...request, accountId: "work" } : request,
      ),
    ).toEqual({
      accountId: direct ? "work" : undefined,
      currentChannelProvider: "googlechat",
      currentChannelId: expected,
      currentMessagingTarget: expected,
      currentChatType: direct ? "direct" : "group",
      currentThreadTs: direct ? "Thread1" : undefined,
    });
  });

  it.each([
    { name: "selected aliases", selected: true, hasAliases: true, expected: foldedSpace },
    { name: "selected absence", selected: true, hasAliases: false, expected: canonicalSpace },
    { name: "unselected bootstrap", selected: false, hasAliases: false, expected: foldedSpace },
  ])(
    "uses $name when deciding whether to recover a destination",
    async ({ selected, hasAliases, expected }) => {
      getBootstrapChannelPluginMock.mockReturnValue({
        actions: { messageActionTargetAliases: { read: { aliases: ["messageId"] } } },
      });
      const channels: PreparedMessageToolCatalog["channels"] = hasAliases
        ? [
            {
              id: "googlechat",
              reconcilesUnknownSend: false,
              actions: {
                describeMessageTool: () => ({ actions: ["read"] }),
                messageActionTargetAliases: { read: { aliases: ["messageId"] } },
              },
            },
          ]
        : [];
      const catalog = {
        version: 1,
        channels,
        getChannel: (id: string) => channels.find((entry) => entry.id === id),
      };
      expect(
        (
          await resolveEffectiveCurrentChannelContextForRequest(options, {
            ...request,
            action: "read",
            params: { messageId: "message-1" },
            preparedMessageToolCatalog: selected ? catalog : undefined,
          })
        ).currentMessagingTarget,
      ).toBe(expected);
      if (selected) {
        expect(getBootstrapChannelPluginMock).not.toHaveBeenCalled();
      }
    },
  );

  it.each<{
    name: string;
    params?: Record<string, unknown>;
    discovery?: boolean;
    lowercase?: boolean;
    inbound?: boolean;
  }>([
    { name: "explicit target", params: { target: "spaces/Explicit" } },
    { name: "explicit to", params: { to: "spaces/Explicit" } },
    { name: "explicit channelId", params: { channelId: "spaces/Explicit" } },
    { name: "explicit targets", params: { targets: ["spaces/Explicit"] } },
    { name: "reusable discovery", discovery: true },
    { name: "lowercase-canonical channel", lowercase: true },
    { name: "normal inbound destination", inbound: true },
  ])("avoids delivery reads for $name", async ({ params, discovery, lowercase, inbound }) => {
    if (lowercase) {
      getChannelPluginMock.mockReturnValue({ messaging: { targetIdComparison: "lowercase" } });
    }
    const result = await resolveEffectiveCurrentChannelContextForRequest(
      inbound
        ? { ...options, currentChannelProvider: "googlechat", currentChannelId: canonicalSpace }
        : options,
      discovery ? undefined : { ...request, params: params ?? {} },
    );
    if (inbound) {
      expect(result.currentChannelId).toBe(canonicalSpace);
    } else if (!discovery) {
      expect(result.currentMessagingTarget).toBe(foldedSpace);
    }
    expect(readDeliveryMock).not.toHaveBeenCalled();
  });
});

describe("message tool discovery cache stability", () => {
  it("limits actions and fields to the session's channel bindings with stable bytes", async () => {
    const channels: PreparedMessageToolCatalog["channels"] = [
      {
        id: "qa-primary",
        reconcilesUnknownSend: false,
        actions: {
          describeMessageTool: () => ({
            actions: ["send", "react"],
            schema: {
              visibility: "all-configured",
              properties: { primaryLabel: Type.Optional(Type.String()) },
            },
          }),
        },
      },
      {
        id: "qa-secondary",
        reconcilesUnknownSend: false,
        actions: {
          describeMessageTool: () => ({
            actions: ["send", "poll"],
            capabilities: ["presentation"],
            schema: {
              visibility: "all-configured",
              properties: { ballotLabel: Type.Optional(Type.String()) },
            },
          }),
        },
      },
      {
        id: "qa-unrelated",
        reconcilesUnknownSend: false,
        actions: {
          describeMessageTool: () => ({
            actions: ["event-create"],
            schema: {
              visibility: "all-configured",
              properties: { unrelatedLabel: Type.Optional(Type.String()) },
            },
          }),
        },
      },
    ];
    const discover = (bindings: OpenClawConfig["bindings"], orderedChannels = channels) =>
      resolveMessageToolDiscoveryAsync({
        cfg: { bindings },
        agentId: "main",
        currentChannelProvider: "qa-primary",
        preparedMessageToolCatalog: {
          version: 1,
          channels: orderedChannels,
          getChannel: (id) => orderedChannels.find((channel) => channel.id === id),
        },
      });
    const single = await discover([]);
    expect(single.actions).toEqual(["react", "send"]);
    expect(single.schema.properties).toHaveProperty("emoji");
    for (const field of ["pollId", "eventName", "ballotLabel", "unrelatedLabel", "presentation"]) {
      expect(single.schema.properties).not.toHaveProperty(field);
    }
    const bindings: OpenClawConfig["bindings"] = [
      { agentId: "main", match: { channel: "qa-secondary", accountId: "*" } },
      { agentId: "other", match: { channel: "qa-unrelated" } },
    ];
    const multi = await discover(bindings);
    expect(multi.actions).toEqual(["poll", "react", "send"]);
    expect(multi.schema.properties).toHaveProperty("ballotLabel");
    expect(multi.schema.properties).toHaveProperty("presentation");
    expect(multi.schema.properties).not.toHaveProperty("eventName");
    expect(multi.schema.properties).not.toHaveProperty("unrelatedLabel");
    expect(
      Value.Check(multi.schema, {
        action: "poll",
        pollQuestion: "Ready?",
        pollOption: ["Yes", "No"],
      }),
    ).toBe(true);
    expect(JSON.stringify(await discover(bindings.toReversed(), channels.toReversed()))).toBe(
      JSON.stringify(multi),
    );
  });

  it.each([
    { allow: undefined, expected: ["poll", "poll-vote", "react", "send"] },
    { allow: ["send", "react", "poll", "react"], expected: ["poll", "react", "send"] },
    { allow: ["read", "edit", "read"], expected: ["edit", "read"] },
  ])("keeps schema bytes stable across channel discovery order ($allow)", ({ allow, expected }) => {
    const channels: PreparedMessageToolCatalog["channels"] = [
      {
        id: "telegram",
        reconcilesUnknownSend: false,
        actions: { describeMessageTool: () => ({ actions: ["send", "react", "poll"] }) },
      },
      {
        id: "discord",
        reconcilesUnknownSend: false,
        actions: { describeMessageTool: () => ({ actions: ["send", "poll", "poll-vote"] }) },
      },
    ];
    const createTool = (
      orderedChannels: PreparedMessageToolCatalog["channels"],
      currentChannelProvider: string,
    ) => {
      const params = {
        cfg: {
          tools: { message: { actions: { allow } } },
          bindings: [
            { agentId: "main", match: { channel: "telegram" } },
            { agentId: "main", match: { channel: "discord" } },
          ],
        },
        agentId: "main",
        currentChannelProvider,
        preparedMessageToolCatalog: {
          version: 1,
          channels: orderedChannels,
          getChannel: (id: string) => orderedChannels.find((channel) => channel.id === id),
        },
      };
      const actions = resolveMessageToolActionSchemaActions(params);
      return {
        parameters: buildMessageToolSchema(params, actions),
        description: buildMessageToolDescription(actions),
      };
    };
    const tools = [
      createTool(channels, "telegram"),
      createTool(channels.toReversed(), "discord"),
    ] as const;

    expect(tools[0].description).toBe(tools[1].description);
    expect(JSON.stringify(tools[0].parameters)).toBe(JSON.stringify(tools[1].parameters));
    for (const tool of tools) {
      expect(tool.parameters.properties.action).toMatchObject({ enum: expected });
      if (allow) {
        expect(tool.description).not.toContain("poll-vote");
      }
    }
  });
});

describe("message tool discovery without a current channel", () => {
  it.each([
    { allow: undefined, actions: ["broadcast", "send"], compact: true },
    { allow: ["broadcast"], actions: ["broadcast"], compact: true },
    { allow: ["send", "react"], actions: ["react", "send"], compact: false },
  ])("keeps the fields needed by $actions", ({ allow, actions, compact }) => {
    const deliveryTag = Type.Optional(Type.String());
    const channels: PreparedMessageToolCatalog["channels"] = [
      {
        id: "telegram",
        reconcilesUnknownSend: false,
        actions: {
          describeMessageTool: () => ({
            actions: compact ? ["send"] : ["send", "react"],
            capabilities: ["presentation", "delivery-pin"],
            schema: { visibility: "all-configured", properties: { deliveryTag } },
          }),
        },
      },
    ];
    const params: MessageToolDiscoveryParams = {
      cfg: { tools: { message: { actions: { allow } } } },
      preparedMessageToolCatalog: {
        version: 1,
        channels,
        getChannel: (id) => channels.find((channel) => channel.id === id),
      },
    };
    const discovered = resolveMessageToolActionSchemaActions(params);
    const schema = buildMessageToolSchema(params, discovered);
    const properties = expectDefined(
      asOptionalRecord(schema.properties),
      "message schema properties",
    );

    expect(discovered).toEqual(actions);
    for (const field of ["target", "targets", "media", "attachments", "presentation", "delivery"]) {
      expect(properties).toHaveProperty(field);
    }
    expect(properties.deliveryTag).toEqual(deliveryTag);
    expect(Object.hasOwn(properties, "messageId")).toBe(!compact);
    for (const field of ["pollId", "eventName", "deleteDays", "activityState"]) {
      expect(properties).not.toHaveProperty(field);
    }
    const payload = {
      action: compact ? "broadcast" : "send",
      target: "telegram:chat:one",
      targets: ["telegram:chat:one", "telegram:chat:two"],
      message: "Hello",
      attachments: [{ type: "file", media: "https://example.com/report.txt" }],
      presentation: { blocks: [{ type: "text", text: "Report" }] },
      delivery: { pin: true },
      deliveryTag: "report",
    };
    expect(Value.Check(schema, payload)).toBe(true);
    expect(Value.Check(schema, { ...payload, deliveryTag: 1 })).toBe(false);
  });
});
