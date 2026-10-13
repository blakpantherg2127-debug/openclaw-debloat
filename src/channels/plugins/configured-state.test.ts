// Configured state tests cover channel plugin configured-state detection and summaries.
import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { hasBundledChannelPackageState } from "./package-state-probes.js";

describe("bundled channel configured-state metadata", () => {
  it.each([
    { channelId: "nextcloud-talk", env: { NEXTCLOUD_TALK_BOT_SECRET: "secret" } },
    { channelId: "zalo", env: { ZALO_WEBHOOK_SECRET: "secret" } },
  ])("rejects incomplete $channelId environment credentials", ({ channelId, env }) => {
    expect(
      hasBundledChannelPackageState({ metadataKey: "configuredState", channelId, cfg: {}, env }),
    ).toBe(false);
  });

  it("keeps explicit blank Teams credentials authoritative over ambient credentials", () => {
    expect(
      hasBundledChannelPackageState({
        metadataKey: "configuredState",
        channelId: "msteams",
        cfg: { channels: { msteams: { appId: "", appPassword: "", tenantId: "" } } },
        env: {
          MSTEAMS_APP_ID: "ambient-app",
          MSTEAMS_APP_PASSWORD: "ambient-password",
          MSTEAMS_TENANT_ID: "ambient-tenant",
        },
      }),
    ).toBe(false);
  });
});
