// Message secret scope tests cover CLI secret scoping for message commands.
import { describe, expect, it } from "vitest";
import { resolveMessageSecretScope } from "./message-secret-scope.js";

describe("resolveMessageSecretScope", () => {
  it("does not infer a channel when target arrays mix channels", () => {
    expect(
      resolveMessageSecretScope({
        targets: ["signal:one", "imessage:two"],
      }),
    ).toStrictEqual({});
  });
});
