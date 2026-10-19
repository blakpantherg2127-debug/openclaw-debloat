// Verifies runtime channel capabilities derived from channel account config.
import { describe, expect, it } from "vitest";
import { collectRuntimeChannelCapabilities } from "./runtime-capabilities.js";

describe("collectRuntimeChannelCapabilities", () => {
  it("advertises markdown details for internal webchat", () => {
    expect(collectRuntimeChannelCapabilities({ channel: "webchat" })).toEqual(["markdownDetails"]);
  });

  it("does not advertise markdown details for a plugin-less non-webchat channel", () => {
    expect(collectRuntimeChannelCapabilities({ channel: "heartbeat" })).toBeUndefined();
  });

  it("omits thread-bound spawn capabilities when unified spawns are disabled", () => {
    const capabilities = collectRuntimeChannelCapabilities({
      channel: "discord",
      accountId: "default",
      cfg: {
        session: {
          threadBindings: {
            spawnSessions: false,
          },
        },
      },
    });

    expect(capabilities).toBeUndefined();
  });
});
