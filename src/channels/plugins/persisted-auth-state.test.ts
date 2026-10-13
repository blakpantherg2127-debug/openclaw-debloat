// Persisted auth state tests cover channel plugin auth state serialization and recovery.
import { describe, expect, it } from "vitest";
import {
  hasBundledChannelPersistedAuthState,
  listBundledChannelIdsWithPersistedAuthState,
} from "./persisted-auth-state.js";

describe("bundled channel persisted-auth metadata", () => {
  it("does not report auth state for channels without bundled metadata", () => {
    expect(
      hasBundledChannelPersistedAuthState({
        channelId: "discord",
        cfg: {},
        env: {},
      }),
    ).toBe(false);
  });
});
