// OpenClaw operation parser tests protect direct command routing before model fallback.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  clearRuntimeConfigSnapshot,
  setRuntimeConfigSnapshot,
} from "../config/runtime-snapshot.js";
import {
  isPersistentSystemAgentOperation,
  parseSystemAgentOperation as parseSystemAgentOperationImpl,
} from "./operations.js";
import {
  createSystemAgentPluginMetadataTestSnapshot,
  type SystemAgentPluginMetadataTestSnapshot,
} from "./system-agent.test-helpers.js";

let pluginMetadata: SystemAgentPluginMetadataTestSnapshot | undefined;

const parseSystemAgentOperation: typeof parseSystemAgentOperationImpl = (...args) =>
  pluginMetadata!.run(() => parseSystemAgentOperationImpl(...args));

function expectInvalidConfigPath(command: string) {
  expect(parseSystemAgentOperation(command)).toEqual({
    kind: "none",
    message: "Invalid config path. Check its quoting or escaping and try again.",
  });
}

beforeAll(() => {
  const config = {};
  setRuntimeConfigSnapshot(config, config);
  pluginMetadata = createSystemAgentPluginMetadataTestSnapshot(config);
});

afterAll(() => {
  clearRuntimeConfigSnapshot();
});

describe("parseSystemAgentOperation", () => {
  it.each([
    "agents.defaults.fastModeDefault",
    'agents.defaults.models["openai/gpt-5.2"].params.fastMode',
  ])("routes config unset %s as an approval-gated write", (path) => {
    const operation = parseSystemAgentOperation(`config unset ${path}`);
    expect(operation).toEqual({ kind: "config-unset", path });
    expect(isPersistentSystemAgentOperation(operation)).toBe(true);
  });

  it.each(["", "gateway..port", "gateway["])(
    "rejects malformed unset path %s before model fallback",
    (path) => expectInvalidConfigPath(`config unset ${path}`),
  );

  it("parses typed model writes", () => {
    expect(parseSystemAgentOperation("set default model openai/gpt-5.2")).toEqual({
      kind: "set-default-model",
      model: "openai/gpt-5.2",
    });
    expect(parseSystemAgentOperation("configure models openai/gpt-5.2")).toEqual({
      kind: "set-default-model",
      model: "openai/gpt-5.2",
    });
    expect(parseSystemAgentOperation("set default model openai/gpt-5.2 for agent агент✨")).toEqual(
      {
        kind: "set-default-model",
        model: "openai/gpt-5.2",
        agentId: "агент✨",
      },
    );
  });

  it("parses interactive model provider setup", () => {
    expect(parseSystemAgentOperation("configure model provider")).toEqual({
      kind: "model-setup",
    });
    expect(parseSystemAgentOperation("setup model provider")).toEqual({
      kind: "model-setup",
    });
    expect(parseSystemAgentOperation("model setup workspace /tmp/work")).toEqual({
      kind: "model-setup",
      workspace: "/tmp/work",
    });
  });

  it("parses verbal agent switching", () => {
    expect(parseSystemAgentOperation("talk to work agent")).toEqual({
      kind: "open-tui",
      agentId: "work",
    });
  });

  it("routes ambiguous model requests to the AI instead of guessing", () => {
    expect(parseSystemAgentOperation("models please").kind).toBe("none");
    expect(parseSystemAgentOperation("why did my gateway stop").kind).toBe("none");
    expect(parseSystemAgentOperation("should I talk to my agent about this?").kind).toBe("none");
    expect(parseSystemAgentOperation("set me up with telegram").kind).toBe("none");
    expect(parseSystemAgentOperation("can I set the default model gpt-5.5 later?").kind).toBe(
      "none",
    );
  });

  it("parses gateway lifecycle operations", () => {
    expect(parseSystemAgentOperation("gateway status")).toEqual({ kind: "gateway-status" });
    expect(parseSystemAgentOperation("restart gateway")).toEqual({ kind: "gateway-restart" });
    expect(parseSystemAgentOperation("start gateway")).toEqual({ kind: "gateway-start" });
    expect(parseSystemAgentOperation("stop gateway")).toEqual({ kind: "gateway-stop" });
  });

  it("parses plugin management operations", () => {
    expect(parseSystemAgentOperation("plugins list")).toEqual({ kind: "plugin-list" });
    expect(parseSystemAgentOperation("list plugin")).toEqual({ kind: "plugin-list" });
    expect(parseSystemAgentOperation("plugins search calendar sync")).toEqual({
      kind: "plugin-search",
      query: "calendar sync",
    });
    expect(parseSystemAgentOperation("install npm plugin @openclaw/discord")).toEqual({
      kind: "plugin-install",
      spec: "npm:@openclaw/discord",
    });
    expect(parseSystemAgentOperation("plugin install clawhub:openclaw-demo")).toEqual({
      kind: "plugin-install",
      spec: "clawhub:openclaw-demo",
    });
    expect(parseSystemAgentOperation("plugin uninstall openclaw-demo")).toEqual({
      kind: "plugin-uninstall",
      pluginId: "openclaw-demo",
    });
    expect(parseSystemAgentOperation("plugin install npm:@example/plugin")).toEqual({
      kind: "none",
      message:
        "OpenClaw installs only ClawHub, bundled, or official-catalog plugins. Use `openclaw plugins install <spec>` in a trusted shell to review an arbitrary executable source.",
    });
  });

  it("parses config read and schema lookups", () => {
    expect(parseSystemAgentOperation("config get gateway.port")).toEqual({
      kind: "config-get",
      path: "gateway.port",
    });
    expect(parseSystemAgentOperation("config schema channels.telegram")).toEqual({
      kind: "config-schema",
      path: "channels.telegram",
    });
    expect(parseSystemAgentOperation("config schema")).toEqual({ kind: "config-schema" });
    expect(parseSystemAgentOperation("config schema .")).toEqual({
      kind: "config-schema",
      path: ".",
    });
    expect(
      parseSystemAgentOperation('config get channels.telegram.accounts["prod=us"].botToken'),
    ).toEqual({
      kind: "config-get",
      path: 'channels.telegram.accounts["prod=us"].botToken',
    });
    expect(parseSystemAgentOperation("config get channels.missing.opaque")).toEqual({
      kind: "config-get",
      path: "channels.missing.opaque",
    });
    for (const command of [
      "config get gateway.auth.tokenabcDEF123",
      'config get gateway.auth["token=abcDEF123"]',
      String.raw`config get gateway.auth.token\=abcDEF123`,
      "config get gateway.auth.token abcDEF123",
      "config get channels.missing.opaque=abcDEF123",
      "config schema gateway.port=abcDEF123",
      "config schema gateway.auth.token=abcDEF123",
      'config schema gateway.auth["token=abcDEF123"]',
      "config schema channels.missing.opaque=abcDEF123",
    ]) {
      expectInvalidConfigPath(command);
    }
    // Read-only: no approval gate.
    expect(isPersistentSystemAgentOperation({ kind: "config-get", path: "gateway.port" })).toBe(
      false,
    );
    expect(isPersistentSystemAgentOperation({ kind: "config-schema" })).toBe(false);
  });

  it("parses agent creation requests", () => {
    expect(
      parseSystemAgentOperation(
        'create agent qa-writer name "QA Writer" role writer workspace /tmp/qa-writer',
      ),
    ).toEqual({
      kind: "create-agent",
      agentId: "qa-writer",
      name: "QA Writer",
      role: "writer",
      workspace: "/tmp/qa-writer",
    });
    expect(
      parseSystemAgentOperation("create agent editor role writer workspace /tmp/editor"),
    ).toEqual({
      kind: "create-agent",
      agentId: "editor",
      role: "writer",
      workspace: "/tmp/editor",
    });
    expect(parseSystemAgentOperation("create agent editor role unknown")).toMatchObject({
      kind: "none",
      message: expect.stringContaining("Unknown agent role"),
    });
    expect(parseSystemAgentOperation("create team")).toEqual({ kind: "create-team" });
    expect(
      parseSystemAgentOperation(
        'create team coordinator lead prefix docs workspace "/tmp/my team"',
      ),
    ).toEqual({
      kind: "create-team",
      coordinatorId: "lead",
      prefix: "docs",
      workspaceRoot: "/tmp/my team",
    });
    expect(
      parseSystemAgentOperation("create agent Work workspace /tmp/work model openai/gpt-5.2"),
    ).toEqual({
      kind: "create-agent",
      agentId: "work",
      workspace: "/tmp/work",
      model: "openai/gpt-5.2",
    });
    expect(parseSystemAgentOperation("add agent ops")).toEqual({
      kind: "create-agent",
      agentId: "ops",
    });
    expect(parseSystemAgentOperation("setup workspace /tmp/work model openai/gpt-5.5")).toEqual({
      kind: "setup",
      workspace: "/tmp/work",
      model: "openai/gpt-5.5",
    });
    expect(parseSystemAgentOperation("setup agent ops")).toEqual({
      kind: "create-agent",
      agentId: "ops",
    });
  });
});
