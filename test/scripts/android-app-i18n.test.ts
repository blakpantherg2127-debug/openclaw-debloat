import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  decodeAndroidResourceValue,
  escapeAndroidResourceValue,
  findUnusedAndroidResourceKeys,
  findUnlocalizedAndroidUiLiterals,
  renderAndroidResourceValue,
  selectDeterministicTranslation,
} from "../../scripts/android-app-i18n.ts";

const { generatedOverrides } = vi.hoisted(() => ({
  generatedOverrides: new Map<string, string>(),
}));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    readFile: (...args: Parameters<typeof actual.readFile>) => {
      const override =
        typeof args[0] === "string" ? generatedOverrides.get(path.resolve(args[0])) : undefined;
      return override === undefined ? actual.readFile(...args) : Promise.resolve(override);
    },
  };
});

describe("Android app i18n resources", () => {
  it("requires exact Android resource reference identifiers", () => {
    expect(
      findUnusedAndroidResourceKeys(
        ["native_status", "native_status_detail", "native_unused"],
        [{ path: "Example.kt", source: "R.string.native_status_detail" }],
      ),
    ).toEqual(["native_status", "native_unused"]);
  });

  it("ignores Android resource references that only appear in comments", () => {
    expect(
      findUnusedAndroidResourceKeys(
        ["kotlin_comment", "block_comment", "xml_comment", "live"],
        [
          {
            path: "Example.kt",
            source: `
              // R.string.kotlin_comment
              /* R.string.block_comment */
              val endpoint = "https://example.test"
              val marker = "/* not a comment */"
              R.string.live
            `,
          },
          {
            path: "AndroidManifest.xml",
            source: "<!-- @string/xml_comment -->",
          },
        ],
      ),
    ).toEqual(["kotlin_comment", "block_comment", "xml_comment"]);
  });

  it("ignores Android resource references inside Kotlin strings", () => {
    expect(
      findUnusedAndroidResourceKeys(
        ["regular_string", "raw_string", "live"],
        [
          {
            path: "Example.kt",
            source: `
              val regular = "R.string.regular_string"
              val raw = """R.string.raw_string"""
              R.string.live
            `,
          },
        ],
      ),
    ).toEqual(["regular_string", "raw_string"]);
  });

  it("selects duplicate-source translations by frequency then stable text order", () => {
    expect(selectDeterministicTranslation("Source", ["Beta", "Alpha", "Beta"])).toBe("Beta");
    expect(selectDeterministicTranslation("Source", ["Beta", "Alpha"])).toBe("Alpha");
  });

  it("prefers a translated candidate over repeated source fallbacks", () => {
    expect(selectDeterministicTranslation("Source", ["Source", "Translated", "Source"])).toBe(
      "Translated",
    );
    expect(selectDeterministicTranslation("Source", ["Source", "Source"])).toBe("Source");
  });

  it("decodes quoted Android resources for canonical translation inputs", () => {
    expect(decodeAndroidResourceValue('"Sitzungen"')).toBe("Sitzungen");
    expect(decodeAndroidResourceValue('"Sag \\"Hallo\\""')).toBe('Sag "Hallo"');
  });

  it("formats nested Kotlin interpolations as single Android arguments", () => {
    expect(
      renderAndroidResourceValue(
        "${device.tokens.count { !it.revoked }}/${device.tokens.size} active tokens",
        "${device.tokens.size} Token, ${device.tokens.count { !it.revoked }} aktiv",
      ),
    ).toBe("%2$s Token, %1$s aktiv");
  });

  it("preserves Android resource placeholders outside Kotlin interpolation", () => {
    expect(escapeAndroidResourceValue("Previous %1$s")).toBe("Previous %1$s");
  });

  it("balances braces inside nested interpolation strings", () => {
    expect(
      renderAndroidResourceValue(
        '${if (connected) "{" else "}"} $count',
        '$count · ${if (connected) "{" else "}"}',
      ),
    ).toBe("%2$s · %1$s");
  });

  it("rejects repeated translation placeholders that do not match the source", () => {
    expect(() =>
      renderAndroidResourceValue("$item then $item", "$item, $item und noch einmal $item"),
    ).toThrow("Android translation changed interpolation placeholders");
  });

  it("finds direct, typed, conditional, interpolated, Elvis, and accessibility literals", () => {
    const source = `
      data class ConnectionState(
        val connected: Boolean,
        val statusText: String,
      )
      data class SettingsToggleRow(
        val title: String,
        val subtitle: String,
      )

      Text("Settings")
      Text(text = nativeStringResource("Connected"))
      ClawPrimaryButton(text = "Continue", onClick = {})
      ClawStatusPill(text = "Working")
      SettingsMetric("Gateway", gatewayName)
      ConnectionState(connected = false, statusText = "Connecting to $host")
      ConnectionState(connected = true, statusText = nativeString("Connected"))
      SettingsToggleRow("Phone capability", "Share device data")
      SettingsToggleRow(nativeString("Localized capability"), nativeString("Localized detail"))
      Text(text = fileName ?: "Attachment")
      Modifier.clickable(onClickLabel = "Open detail", onClick = {})
      Text(nativeString("First sentence. ") + "Second sentence.")
      val dynamic = Text(text = gateway.name)

      fun statusText(state: State): String =
        when (state) {
          State.Ready -> "Ready"
          State.Waiting -> nativeString("Waiting")
        }
    `;
    expect(
      findUnlocalizedAndroidUiLiterals(
        source,
        "apps/android/app/src/main/java/ai/openclaw/app/ui/Example.kt",
      ),
    ).toEqual([
      expect.objectContaining({ source: "Settings" }),
      expect.objectContaining({ source: "Continue" }),
      expect.objectContaining({ source: "Working" }),
      expect.objectContaining({ source: "Gateway" }),
      expect.objectContaining({ source: "Connecting to $host" }),
      expect.objectContaining({ source: "Phone capability" }),
      expect.objectContaining({ source: "Share device data" }),
      expect.objectContaining({ source: "Attachment" }),
      expect.objectContaining({ source: "Open detail" }),
      expect.objectContaining({ source: "Second sentence." }),
      expect.objectContaining({ source: "Ready" }),
    ]);
  });

  it("maps typed model fields across generic types and named argument omissions", () => {
    const source = `
      data class GenericState<T : Map<String, String>>(
        val metadata: Map<String, String>,
        val statusText: String,
      )
      data class OptionalState(
        val statusText: String = "",
        val code: String,
      )

      GenericState<Map<String, String>>(emptyMap(), "Generic ready")
      OptionalState(code = "Internal code")
    `;
    const findings = findUnlocalizedAndroidUiLiterals(
      source,
      "apps/android/app/src/main/java/ai/openclaw/app/ui/Example.kt",
    ).map((finding) => finding.source);

    expect(findings).toContain("Generic ready");
    expect(findings).not.toContain("Internal code");
  });

  it("scans helpers with generic and lambda parameters", () => {
    const source = `
      fun <T> statusText(value: T, transform: (T) -> String): String =
        if (transform(value).isBlank()) "No status" else nativeString("Ready")
    `;
    const findings = findUnlocalizedAndroidUiLiterals(
      source,
      "apps/android/app/src/main/java/ai/openclaw/app/ui/Example.kt",
    ).map((finding) => finding.source);

    expect(findings).toContain("No status");
    expect(findings).not.toContain("Ready");
  });

  it("finds raw strings in direct UI and presentation helpers", () => {
    const source = `
      Text("""Direct raw copy""")

      fun diagnosticsReport(): String =
        """
          Raw helper copy
        """.trimIndent()
    `;
    const findings = findUnlocalizedAndroidUiLiterals(
      source,
      "apps/android/app/src/main/java/ai/openclaw/app/ui/Example.kt",
    ).map((finding) => finding.source);

    expect(findings).toEqual(
      expect.arrayContaining(["Direct raw copy", expect.stringContaining("Raw helper copy")]),
    );
  });

  it("decodes Kotlin Unicode escapes without collapsing escaped backslashes", () => {
    const source = String.raw`
      Text("Progress \u00b7 ready")
      Text("Literal \\u00b7 marker")
    `;
    const findings = findUnlocalizedAndroidUiLiterals(
      source,
      "apps/android/app/src/main/java/ai/openclaw/app/ui/Example.kt",
    ).map((finding) => finding.source);

    expect(findings).toEqual(["Progress · ready", String.raw`Literal \u00b7 marker`]);
  });

  it("inventories command, attention, and overview model display literals", () => {
    const source = `
      data class CommandItem(
        val key: String,
        val title: String,
        val subtitle: String,
      )
      data class HomeAttentionRow(
        val title: String,
        val subtitle: String,
        val route: String,
      )
      data class OverviewMetricCardSpec(
        val title: String,
        val value: String,
        val subtitle: String,
      )

      CommandItem("chat", "Open Chat", "Start a conversation")
      CommandItem(
        key = "voice",
        title = nativeString("Start Voice"),
        subtitle = nativeString("Talk with OpenClaw"),
      )
      HomeAttentionRow(
        title = "Gateway",
        subtitle = "Connect before chat, voice, and live status.",
        route = "gateway",
      )
      OverviewMetricCardSpec(
        title = nativeString("Gateway"),
        value = if (connected) "Online" else nativeString("Offline"),
        subtitle = "All systems nominal",
      )
    `;
    const findings = findUnlocalizedAndroidUiLiterals(
      source,
      "apps/android/app/src/main/java/ai/openclaw/app/ui/Example.kt",
    ).map((finding) => finding.source);

    expect(findings).toEqual([
      "Open Chat",
      "Start a conversation",
      "Gateway",
      "Connect before chat, voice, and live status.",
      "Online",
      "All systems nominal",
    ]);
  });

  it("scans flavor-specific activity surfaces", () => {
    expect(
      findUnlocalizedAndroidUiLiterals(
        'Text("Developer surface")',
        "apps/android/app/src/thirdParty/java/ai/openclaw/app/accessibility/AccessibilityDevActivity.kt",
      ).map((finding) => finding.source),
    ).toEqual(["Developer surface"]);
  });

  it("keeps scanner boundaries for an unclosed quoted parameter", () => {
    expect(
      findUnlocalizedAndroidUiLiterals(
        'fun statusText(token: String = "unterminated): String = "Ready"',
        "apps/android/app/src/main/java/ai/openclaw/app/ui/Scanner.kt",
      ),
    ).toEqual([]);
  });
});
