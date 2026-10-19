import { resolveDebugProxySettings, type DebugProxySettings } from "./env.js";
import type { CaptureProtocol } from "./types.js";

// Debug-proxy coverage records which transport seams are fully captured versus
// merely routed through a proxy, so operators know where packet evidence is weak.
export type DebugProxyCoverageStatus = "captured" | "proxy-only" | "uncovered";

export type DebugProxyCoverageEntry = {
  id: string;
  label: string;
  modulePath: string;
  protocols: CaptureProtocol[];
  status: DebugProxyCoverageStatus;
  notes: string;
};

const DEBUG_PROXY_COVERAGE_ENTRIES: readonly DebugProxyCoverageEntry[] = [
  {
    id: "provider-transport-fetch",
    label: "Provider HTTP transport",
    modulePath: "src/agents/provider-transport-fetch.ts",
    protocols: ["http", "https", "sse"],
    status: "captured",
    notes:
      "Central provider request path routes through explicit proxy overrides and records request/response payloads.",
  },
  {
    id: "telegram-fetch",
    label: "Telegram fetch resolver",
    modulePath: "extensions/telegram/src/fetch.ts",
    protocols: ["http", "https"],
    status: "captured",
    notes:
      "Telegram API fetch fallback picks up debug proxy env and records outbound/inbound exchanges.",
  },
  {
    id: "openai-realtime-voice",
    label: "OpenAI realtime voice bridge",
    modulePath: "extensions/openai/realtime-voice-provider.ts",
    protocols: ["wss"],
    status: "captured",
    notes:
      "Realtime voice bridge now routes through the debug proxy agent and records websocket frames.",
  },
  {
    id: "openai-realtime-transcription",
    label: "OpenAI realtime transcription",
    modulePath: "extensions/openai/realtime-transcription-provider.ts",
    protocols: ["wss"],
    status: "captured",
    notes:
      "Realtime transcription sessions now route through the debug proxy agent and record websocket frames.",
  },
  {
    id: "openai-tts",
    label: "OpenAI text-to-speech",
    modulePath: "extensions/openai/tts.ts",
    protocols: ["https"],
    status: "captured",
    notes:
      "Direct OpenAI TTS fetches record request/response payloads while inheriting proxy env routing.",
  },
];

let warnedCoverageSessionKey: string | null = null;

export function buildDebugProxyCoverageReport() {
  // Return copies because callers may render/sort/filter entries for CLI output.
  const entries: DebugProxyCoverageEntry[] = [];
  const counts = { captured: 0, "proxy-only": 0, uncovered: 0 };
  for (const entry of DEBUG_PROXY_COVERAGE_ENTRIES) {
    entries.push({ ...entry, protocols: [...entry.protocols] });
    counts[entry.status] += 1;
  }
  const summary = {
    total: entries.length,
    captured: counts.captured,
    proxyOnly: counts["proxy-only"],
    uncovered: counts.uncovered,
  };
  return { summary, entries };
}

export function maybeWarnAboutDebugProxyCoverage(
  settings: DebugProxySettings = resolveDebugProxySettings(),
  warn: (message: string) => void = (message) => console.warn(message),
): void {
  if (!settings.enabled || !settings.required) {
    return;
  }
  const sessionKey = `${settings.sessionId}:${settings.proxyUrl ?? ""}`;
  // Warn once per capture session/proxy URL; the gaps are static enough that
  // repeating them during a run only adds noise.
  if (warnedCoverageSessionKey === sessionKey) {
    return;
  }
  warnedCoverageSessionKey = sessionKey;

  const report = buildDebugProxyCoverageReport();
  const { summary } = report;
  const partial = report.entries.filter((entry) => entry.status !== "captured");
  if (partial.length === 0) {
    return;
  }
  warn(
    `[openclaw proxy] debug proxy coverage: ${summary.captured}/${summary.total} captured, ${summary.proxyOnly} proxy-only, ${summary.uncovered} uncovered.`,
  );
  warn(
    `[openclaw proxy] remaining gaps: ${partial.map((entry) => entry.id).join(", ")}. Run \`openclaw proxy coverage\` for details.`,
  );
}
