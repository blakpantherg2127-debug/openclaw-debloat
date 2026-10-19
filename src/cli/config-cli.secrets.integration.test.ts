// Config secret integration tests cover final-candidate validation and provider execution.
import fs from "node:fs";
import path from "node:path";
import JSON5 from "json5";
import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/types.js";
import { captureEnv, deleteTestEnvValue, setTestEnvValue } from "../test-utils/env.js";
import {
  createTestRuntime,
  useConfigCliIntegrationHarness,
} from "./config-cli.integration.test-harness.js";

const { runConfigSet } = await import("./config-cli.js");
const {
  registeredRuntimeErrors: errors,
  registeredRuntimeLogs: logs,
  runRegisteredConfigCommand: invoke,
  withConfigFileHarness: withFile,
} = useConfigCliIntegrationHarness();

const read = (file: string) => fs.readFileSync(file, "utf8");
const load = (file: string) => JSON5.parse(read(file));
const run = (...args: string[]) => invoke(["config", ...args]);
const set = (...args: string[]) => invoke(["config", "set", ...args]);
const reject = (result: Promise<unknown>) =>
  expect(result).rejects.toMatchObject({ name: "ExitError", code: 1 });
const withConfig = (raw: string, visit: Parameters<typeof withFile>[2]) =>
  withFile("config-cli-", raw, visit);

describe("config cli secrets integration", () => {
  it.each([
    { name: "literal", token: "existing-gateway-token", redactedToken: "__OPENCLAW_REDACTED__" },
    {
      name: "store SecretRef",
      token: { source: "store", provider: "default", id: "OPENCLAW_GATEWAY_TOKEN" } as const,
      redactedToken: { source: "store", provider: "default", id: "__OPENCLAW_REDACTED__" },
    },
  ])(
    "preserves a $name credential in a redacted get/set round-trip",
    async ({ token, redactedToken }) => {
      const gateway = { mode: "local", port: 18789, auth: { mode: "token", token } };
      await withConfig(JSON.stringify({ gateway }), async ({ configPath }) => {
        await run("get", "gateway", "--json");
        const displayed = JSON.parse(logs.at(-1)!) as NonNullable<OpenClawConfig["gateway"]>;
        expect(displayed.auth?.token).toEqual(redactedToken);

        await set("gateway", JSON.stringify({ ...displayed, port: 19002 }), "--strict-json");

        expect(load(configPath).gateway).toEqual({
          ...gateway,
          port: 19002,
        });
        const before = read(configPath);
        await set("gateway.auth.token", "__OPENCLAW_REDACTED__");
        expect(read(configPath)).toBe(before);
      });
    },
  );

  it("rejects a redacted credential without an original value to preserve", async () => {
    const raw = '{"gateway":{"mode":"local","port":18789}}';
    await withConfig(raw, async ({ configPath }) => {
      await reject(set("gateway.auth.token", "__OPENCLAW_REDACTED__"));

      expect(read(configPath)).toBe(raw);
      expect(errors.join("\n")).toContain("gateway.auth.token");
    });
  });

  it.each(["agents.defaults", "agents.entries.ops"])(
    "validates SecretRefs after normalizing model keys in %s",
    async (agentPath) => {
      const raw = '{ secrets: { providers: { default: { source: "env" } } } }\n';
      await withConfig(raw, async ({ configPath }) => {
        const envSnapshot = captureEnv(["MISSING_TEST_SECRET"]);
        try {
          deleteTestEnvValue("MISSING_TEST_SECRET");
          const output = createTestRuntime();

          await expect(
            runConfigSet({
              path: `${agentPath}.models["google/gemini-3-flash"].params.authorization`,
              value: JSON.stringify({
                source: "env",
                provider: "default",
                id: "MISSING_TEST_SECRET",
              }),
              cliOptions: { strictJson: true, dryRun: true, json: true },
              runtime: output.runtime,
            }),
          ).rejects.toThrow("__exit__:1");

          expect(read(configPath)).toBe(raw);
          expect(JSON.parse(output.logs.join("\n"))).toMatchObject({
            ok: false,
            refsChecked: 1,
            errors: [{ kind: "resolvability", ref: "env:default:MISSING_TEST_SECRET" }],
          });
        } finally {
          envSnapshot.restore();
        }
      });
    },
  );

  it("keeps model provider ids separate from SecretRef provider aliases", async () => {
    await withConfig("{}\n", async ({ configPath, tempDir }) => {
      const raw = JSON.stringify({
        models: {
          providers: {
            openai: { baseUrl: "https://example.invalid/v1", models: [] },
          },
        },
        secrets: {
          providers: {
            openai: { source: "exec", command: path.join(tempDir, "missing-helper") },
          },
        },
      });
      fs.writeFileSync(configPath, raw);
      const envSnapshot = captureEnv(["MODEL_API_KEY"]);
      try {
        setTestEnvValue("MODEL_API_KEY", "test-model-key");
        const output = createTestRuntime();

        await runConfigSet({
          path: "models.providers.openai.apiKey",
          cliOptions: {
            refProvider: "default",
            refSource: "env",
            refId: "MODEL_API_KEY",
            dryRun: true,
            json: true,
          },
          runtime: output.runtime,
        });

        expect(read(configPath)).toBe(raw);
        expect(output.errors).toEqual([]);
        expect(JSON.parse(output.logs.join("\n"))).toMatchObject({ ok: true, refsChecked: 1 });
      } finally {
        envSnapshot.restore();
      }
    });
  });

  it.each([false])(
    "still rejects an unsafe exec ref assigned last in a batch (dry run: %s)",
    async (dryRun) => {
      await withConfig("{ gateway: { port: 18789 } }\n", async ({ configPath, tempDir }) => {
        const raw = JSON.stringify({
          secrets: {
            providers: {
              runner: { source: "exec", command: path.join(tempDir, "missing-helper") },
            },
          },
        });
        fs.writeFileSync(configPath, raw);
        const output = createTestRuntime();

        await expect(
          runConfigSet({
            cliOptions: {
              batchJson: JSON.stringify([
                { path: "channels.discord.token", value: "superseded-token" },
                {
                  path: "channels.discord.token",
                  ref: { source: "exec", provider: "runner", id: "retained" },
                },
              ]),
              dryRun,
            },
            runtime: output.runtime,
          }),
        ).rejects.toThrow("__exit__:1");

        expect(read(configPath)).toBe(raw);
        expect(output.errors.join("\n")).toContain("secrets.providers.runner.command");
        expect(output.errors.join("\n")).toContain("is not readable");
      });
    },
  );
});
