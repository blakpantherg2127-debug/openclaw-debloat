// Gateway Protocol tests cover native protocol levels.guard behavior.
import fs from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  nativeProtocolOutputDirectories,
  prepareNativeProtocol,
} from "../../../scripts/prepare-native-protocol.mjs";
import { ProtocolSchemas } from "./schema/protocol-schemas.js";
import {
  MIN_CLIENT_PROTOCOL_VERSION,
  MIN_NODE_PROTOCOL_VERSION,
  MIN_PROBE_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
} from "./version.js";

/**
 * Cross-language guard for Gateway protocol version constants.
 *
 * Native Swift/Kotlin clients and dev smoke scripts cannot derive these values
 * from TypeScript at runtime, so this test keeps generated constants
 * and connect payloads aligned with the package source of truth.
 */

const swiftGeneratedPath = `${nativeProtocolOutputDirectories.swift}/GatewayModels.swift`;
beforeAll(() => prepareNativeProtocol());

/** Reads a repo-relative source file used by a native protocol guard. */
async function readRepoFile(relativePath: string): Promise<string> {
  return fs.readFile(path.join(process.cwd(), relativePath), "utf8");
}

/** Asserts a compatibility pattern exists in generated/native source text. */
function assertPattern(
  content: string,
  relativePath: string,
  pattern: RegExp,
  message: string,
): void {
  if (pattern.test(content)) {
    return;
  }
  throw new Error(`${relativePath}: ${message}`);
}

function stringLiteralUnionValues(schema: unknown): string[] | undefined {
  if (!schema || typeof schema !== "object") {
    return undefined;
  }
  const candidate = schema as { anyOf?: unknown; oneOf?: unknown };
  const branches = candidate.oneOf ?? candidate.anyOf;
  if (!Array.isArray(branches) || branches.length === 0) {
    return undefined;
  }

  const values: string[] = [];
  for (const branch of branches) {
    if (!branch || typeof branch !== "object" || !("const" in branch)) {
      return undefined;
    }
    const value = branch.const;
    if (typeof value !== "string") {
      return undefined;
    }
    values.push(value);
  }
  return new Set(values).size === values.length ? values : undefined;
}

describe("native Gateway protocol levels", () => {
  it("keeps node and probe compatibility at N-1 without widening general clients", () => {
    expect(MIN_NODE_PROTOCOL_VERSION).toBe(PROTOCOL_VERSION - 1);
    expect(MIN_PROBE_PROTOCOL_VERSION).toBe(PROTOCOL_VERSION - 1);
    expect(MIN_CLIENT_PROTOCOL_VERSION).toBe(PROTOCOL_VERSION);
  });

  it("emits the session approval event as a discriminated Swift union", async () => {
    const swiftGenerated = await readRepoFile(swiftGeneratedPath);

    assertPattern(
      swiftGenerated,
      swiftGeneratedPath,
      /public enum SessionApprovalEvent: Codable, Sendable \{/,
      "missing the generated SessionApprovalEvent union.",
    );
    assertPattern(
      swiftGenerated,
      swiftGeneratedPath,
      /case pending\(PendingSessionApprovalEvent\)/,
      "SessionApprovalEvent must decode pending transitions.",
    );
    assertPattern(
      swiftGenerated,
      swiftGeneratedPath,
      /case terminal\(TerminalSessionApprovalEvent\)/,
      "SessionApprovalEvent must decode terminal transitions.",
    );
  });

  it("emits the scope upgrade result as a discriminated Swift union", async () => {
    const swiftGenerated = await readRepoFile(swiftGeneratedPath);

    assertPattern(
      swiftGenerated,
      swiftGeneratedPath,
      /public enum ScopeUpgradeResult: Codable, Sendable \{/,
      "missing the generated ScopeUpgradeResult union.",
    );
    assertPattern(
      swiftGenerated,
      swiftGeneratedPath,
      /case approved\(ScopeUpgradeApproved\)/,
      "ScopeUpgradeResult must decode approved outcomes.",
    );
    assertPattern(
      swiftGenerated,
      swiftGeneratedPath,
      /case rejected\(ScopeUpgradeRejected\)/,
      "ScopeUpgradeResult must decode rejected outcomes.",
    );
    assertPattern(
      swiftGenerated,
      swiftGeneratedPath,
      /case expired\(ScopeUpgradeExpired\)/,
      "ScopeUpgradeResult must decode expired outcomes.",
    );
  });

  it("emits named string-literal unions as Swift enums", async () => {
    const swiftGenerated = await readRepoFile(swiftGeneratedPath);

    for (const [name, schema] of Object.entries(ProtocolSchemas)) {
      const values = stringLiteralUnionValues(schema);
      if (!values) {
        continue;
      }

      const enumStart = `public enum ${name}: String, Codable, Sendable {`;
      const start = swiftGenerated.indexOf(enumStart);
      if (start < 0) {
        throw new Error(`${swiftGeneratedPath}: missing Swift enum for ${name}.`);
      }
      const end = swiftGenerated.indexOf("\n}\n", start);
      const enumSource = swiftGenerated.slice(start, end);
      for (const value of values) {
        assertPattern(
          enumSource,
          swiftGeneratedPath,
          new RegExp(`= ${JSON.stringify(value)}$`, "m"),
          `${name} must include the ${JSON.stringify(value)} literal.`,
        );
      }
    }
  });
});
