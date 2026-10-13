#!/usr/bin/env node
// Idempotent fork debloat: removes the component groups marked `apply: true` below and
// prunes every inventory that would otherwise point at them. Re-run after each upstream sync:
//   scripts/debloat/apply.sh            # apply all enabled groups, regenerate, reinstall
//   scripts/debloat/apply.sh --dry-run  # list what would be removed
//   scripts/debloat/apply.sh --only channels,providers
// Groups with `apply: false` were tried and kept; `reason` records why (see DEBLOAT_LOG.md).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Plugin ids follow the extension directory name (extensions/<id>).
export const GROUPS = [
  {
    id: "channels",
    apply: true,
    description: "every chat channel plugin except telegram",
    extensions: [
      "a2a",
      "buzz",
      "clickclack",
      "discord",
      "feishu",
      "googlechat",
      "imessage",
      "irc",
      "line",
      "matrix",
      "mattermost",
      "msteams",
      "nextcloud-talk",
      "nostr",
      "raft",
      "reef",
      "signal",
      "slack",
      "sms",
      "synology-chat",
      "tlon",
      "twitch",
      "whatsapp",
      "x",
      "zalo",
      "zalouser",
      // QA harness whose live transports import the removed channel plugins; source-only.
      "qa-lab",
    ],
    // QA Lab scenario modules; they only run inside the removed qa-lab plugin.
    paths: ["test/e2e/qa-lab"],
    // Tests that exercise the removed channels through bundled ids, generated channel metadata,
    // or source reads of their files (found by the core test set; see DEBLOAT_LOG.md 2.1).
    testFiles: [
      "src/channels/message-access/context-builder-callers.test.ts",
      "src/channels/message-access/discord-native-acp-owner.test.ts",
      "src/channels/message-access/discord-native-owner.test.ts",
      "src/channels/plugins/account-config-mutation.msteams.test.ts",
      "src/plugins/compat/registry.test.ts",
      "src/plugins/registry-runtime.twitch-ingress.test.ts",
      "src/plugins/runtime-live-state-guardrails.test.ts",
    ],
    testCases: [
      ["src/agents/tools/message-tool-discovery.test.ts", "scheduled account discovery"],
      [
        "src/agents/tools/message-tool.scheduled-writes.test.ts",
        "selects the scheduled %s account %s",
      ],
      [
        "src/agents/tools/message-tool.test.ts",
        "does not resolve secrets for broadcast channels that reject the explicit account",
      ],
      [
        "src/agents/tools/sessions-spawn-tool.test.ts",
        "dispatches ACP with the caller's identity, policy, resume, and completion context",
      ],
      [
        "src/channels/message-access/operator-authority.test.ts",
        "carries native Slack requester authority through preparation",
      ],
      [
        "src/channels/plugins/bundled.shape-guard.test.ts",
        "loads real bundled channel entry contracts from the source tree",
      ],
      [
        "src/channels/plugins/configured-state.test.ts",
        "resolves Discord, Slack, Telegram, and IRC env probes without full plugin loads",
      ],
      [
        "src/channels/plugins/configured-state.test.ts",
        "accepts the owner-specific $name contract",
      ],
      [
        "src/channels/plugins/persisted-auth-state.test.ts",
        "lists shipped persisted-auth metadata channels",
      ],
      ["src/channels/registry.helpers.test.ts", "keeps Feishu first in the current default order"],
      [
        "src/channels/turn/message-turn-guardrails.test.ts",
        "keeps migrated message paths off low-level reply-history helpers",
      ],
      [
        "src/channels/turn/run-channel-turn.delivery.test.ts",
        "prepares durable payloads while leaving hooks and visible delivery with the durable owner",
      ],
      [
        "src/channels/turn/run-channel-turn.delivery.test.ts",
        "preserves durable partial-send visibility without retrying via direct delivery",
      ],
      [
        "src/commands/doctor/shared/allowfrom-fallback-migration.test.ts",
        "preserves account-scoped fallback without broadening to the channel",
      ],
      [
        "src/commands/doctor/shared/legacy-config-account-promotion.test.ts",
        "preserves WhatsApp accounts and returns warning-only results",
      ],
      [
        "src/commands/doctor/shared/legacy-tools-by-sender.test.ts",
        "preserves the first effective policy for $name",
      ],
      [
        "src/commands/doctor/shared/legacy-tools-by-sender.test.ts",
        "migrates nested account policies without changing typed matching or colon IDs",
      ],
      [
        "src/config/channel-configured.test.ts",
        "detects Discord env configuration through the package metadata seam",
      ],
      [
        "src/config/channel-configured.test.ts",
        "requires both Slack identity and transport tokens through the package metadata seam",
      ],
      [
        "src/config/channel-configured.test.ts",
        "requires both IRC host and nick env vars through the package metadata seam",
      ],
      [
        "src/config/channel-configured.test.ts",
        "requires both Mattermost URL and token env vars through the package metadata seam",
      ],
      [
        "src/config/channel-configured.test.ts",
        "honors Matrix bootstrap metadata without consulting operational credential hooks",
      ],
      [
        "src/config/commands.test.ts",
        "uses only enabled package channel metadata for bundled auto defaults before runtime loads",
      ],
      [
        "src/config/config-startup-corpus.test.ts",
        "preserves ambient channel ownership when retiring Copilot discovery",
      ],
      [
        "src/config/config.plugin-validation.test.ts",
        "warns when plugins.allow contains a channel id without a plugin manifest (#76872)",
      ],
      [
        "src/config/config.plugin-validation.test.ts",
        "accepts bundled channel aliases for heartbeat targets",
      ],
      [
        "src/config/doc-baseline.integration.test.ts",
        "uses human-readable channel metadata for top-level channel sections",
      ],
      ["src/config/docs-config-examples.test.ts", "reports a retired bundled channel key"],
      [
        "src/config/plugin-auto-enable.core.test.ts",
        "auto-enables built-in channels and preserves them in restrictive plugins.allow",
      ],
      [
        "src/config/plugin-auto-enable.core.test.ts",
        "preserves an empty plugins.allow as nonrestrictive during auto-enable",
      ],
      [
        "src/config/redact-snapshot.test.ts",
        "preserves account SecretRef identity via generated channel metadata hints",
      ],
      [
        "src/config/schema.test.ts",
        "keeps core channel settings discoverable with bundled metadata",
      ],
      ["src/config/schema.test.ts", "adds heartbeat target hints with dynamic channels"],
      ["src/config/sessions.test.ts", "keeps explicit provider when provided in group key"],
      [
        "src/config/sessions/group.test.ts",
        "preserves empty opaque segments in originating group ids",
      ],
      [
        "src/config/validation.policy.test.ts",
        "filters only the policy-owned unknown key (typo=%s)",
      ],
      [
        "src/plugins/channel-plugin-ids.test.ts",
        "evaluates the trusted installed Slack owner's credential contract",
      ],
      [
        "src/plugins/commands.test.ts",
        "requires config before using read-only manifest command defaults",
      ],
      [
        "src/plugins/doctor-contract-registry.retained-config.test.ts",
        "repairs retained channel config before installation without selecting state owners",
      ],
      [
        "src/plugins/bundled-plugin-metadata.test.ts",
        "captures setup-entry metadata for bundled channel plugins",
      ],
      [
        "src/plugins/bundled-plugin-metadata.test.ts",
        "keeps bundled persisted-auth metadata on channel package manifests",
      ],
      [
        "src/plugins/bundled-plugin-metadata.test.ts",
        "loads tlon channel config metadata from the lightweight schema surface",
      ],
      [
        "src/plugins/doctor-contract-registry.selection.test.ts",
        "preserves historical webhook ownership for $name",
      ],
      [
        "src/plugins/doctor-contract-registry.webhook-pins.test.ts",
        "supplements historical facts without replacing $name",
      ],
    ],
    testRows: [
      [
        "src/plugins/bundled-plugin-metadata.test.ts",
        'collectRepoBundledChannelConfigsForTest("discord");',
      ],
      [
        "src/plugins/bundled-plugin-metadata.test.ts",
        'collectRepoBundledChannelConfigsForTest("tlon");',
      ],
      ["src/channels/ids.test.ts", '["whatsapp", "WhatsApp"]'],
      ["src/channels/ids.test.ts", '["GOOGLE-CHAT", "Google Chat"]'],
      ["src/commands/doctor/shared/legacy-tools-by-sender.test.ts", '"channels.slack.'],
      ["src/commands/doctor/shared/legacy-tools-by-sender.test.ts", '"channels.discord.'],
      ["src/commands/doctor/shared/legacy-tools-by-sender.test.ts", '"channels.msteams.'],
      ["src/plugins/bundled-plugin-categories.test.ts", 'pluginId: "a2a"'],
      ["src/plugins/bundled-plugin-categories.test.ts", 'pluginId: "feishu"'],
      ...[
        "whatsapp",
        "discord",
        "clickclack",
        "signal",
        "googlechat",
        "slack",
        "imessage",
        "matrix",
        "line",
      ].map((id) => ["src/config/dead-config-keys.test.ts", `channels.${id}.`]),
    ],
  },
  {
    id: "providers",
    apply: false, // pending verification
    description: "every model provider except anthropic, local runtimes, routers and gateways",
    extensions: [
      "amazon-bedrock",
      "amazon-bedrock-mantle",
      "anthropic-vertex",
      "apple-fm",
      "arcee",
      "baseten",
      "byteplus",
      "cerebras",
      "chutes",
      "clawrouter",
      "cloudflare-ai-gateway",
      "cohere",
      "copilot-proxy",
      "deepinfra",
      "deepseek",
      "featherless",
      "fireworks",
      "github-copilot",
      "gmi",
      "google",
      "groq",
      "huggingface",
      "kilocode",
      "kimi-coding",
      "litellm",
      "llama-cpp",
      "lmstudio",
      "longcat",
      "meta",
      "microsoft-foundry",
      "minimax",
      "mistral",
      "moonshot",
      "novita",
      "nvidia",
      "ollama",
      "openai",
      "opencode",
      "opencode-go",
      "openrouter",
      "qianfan",
      "qwen",
      "radius",
      "sglang",
      "stepfun",
      "synthetic",
      "tencent",
      "together",
      "venice",
      "vercel-ai-gateway",
      "vllm",
      "volcengine",
      "voyage",
      "xai",
      "xiaomi",
      "zai",
    ],
    paths: [],
  },
  {
    id: "media",
    apply: false, // pending verification
    description: "speech/TTS/STT providers, voice call, talk voice, meetings, media generation",
    extensions: [
      // speech, transcription, voice
      "azure-speech",
      "deepgram",
      "elevenlabs",
      "fish-audio-speech",
      "gradium",
      "inworld",
      "microsoft",
      "senseaudio",
      "tts-local-cli",
      "talk-voice",
      "voice-call",
      // meetings
      "facetime",
      "google-meet",
      "slack-huddles",
      "teams-meetings",
      "zoom-meetings",
      // image, music, video generation
      "alibaba",
      "comfy",
      "fal",
      "kie",
      "pixverse",
      "runway",
      "vydra",
      "image-generation-core",
    ],
    paths: [
      "extensions/music-generation-providers.live.test.ts",
      "extensions/video-generation-providers.live.test.ts",
    ],
  },
  {
    id: "nodes",
    apply: false, // pending verification
    description: "native apps and node-host plugins (camera, screen, location, canvas panels)",
    extensions: ["linux-node", "canvas", "file-transfer", "logbook"],
    paths: ["apps"],
  },
  {
    id: "harnesses",
    apply: false, // pending verification
    description: "Codex, Copilot, ACP, OpenAI Agents API harnesses and the Crabbox cloud worker",
    extensions: ["codex", "copilot", "acpx", "agentsapi", "crabbox"],
    paths: [],
  },
  {
    id: "examples",
    apply: false, // pending verification
    description: "bundled example app and custodian skills not needed by the keep set",
    extensions: [],
    paths: [
      "examples/ai-chat",
      "custodian-skills/add-model-provider",
      "custodian-skills/cloud-image-bake",
    ],
  },
];

const KEEP_EXTENSIONS = new Set([
  "anthropic",
  "telegram",
  "browser",
  "duckduckgo",
  "web-readability",
  "memory-core",
]);

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const skipInstall = args.includes("--skip-install");
const skipGenerate = args.includes("--skip-generate");
const onlyArg =
  args.find((arg) => arg.startsWith("--only="))?.slice("--only=".length) ??
  (args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined);
const only = onlyArg
  ? new Set(
      onlyArg
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    )
  : null;

const selected = GROUPS.filter((group) => (only ? only.has(group.id) : group.apply));
for (const group of selected) {
  for (const id of group.extensions) {
    if (KEEP_EXTENSIONS.has(id)) {
      throw new Error(`group ${group.id} lists keep plugin ${id}`);
    }
  }
}

const log = (message) => console.log(`[debloat] ${message}`);
const rel = (p) => path.relative(ROOT, p).replaceAll(path.sep, "/");
const exists = (p) => fs.existsSync(path.join(ROOT, p));

function remove(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) {
    return false;
  }
  log(`${dryRun ? "would remove" : "remove"} ${relPath}`);
  if (!dryRun) {
    fs.rmSync(abs, { recursive: true, force: true });
  }
  return true;
}

function run(cmd, cmdArgs, { allowFailure = false } = {}) {
  log(`$ ${cmd} ${cmdArgs.join(" ")}`);
  if (dryRun) {
    return 0;
  }
  const result = spawnSync(cmd, cmdArgs, { cwd: ROOT, stdio: "inherit" });
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`${cmd} ${cmdArgs.join(" ")} exited ${result.status}`);
  }
  return result.status;
}

// ---- Lean config: allow only the keep plugins, deny every other plugin still in the tree --
// The deny list is regenerated from extensions/ so the profile never names removed plugins
// (unknown ids only warn, but a clean doctor run is part of the acceptance check).
const LEAN_CONFIG_PATH = "debloat/openclaw.lean.json5";
function writeLeanConfig() {
  const allow = [...KEEP_EXTENSIONS];
  const present = fs
    .readdirSync(path.join(ROOT, "extensions"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((id) => fs.existsSync(path.join(ROOT, "extensions", id, "openclaw.plugin.json")))
    .map(
      (id) =>
        JSON.parse(
          fs.readFileSync(path.join(ROOT, "extensions", id, "openclaw.plugin.json"), "utf8"),
        ).id ?? id,
    );
  const deny = present.filter((id) => !KEEP_EXTENSIONS.has(id)).toSorted();
  const list = (ids, indent) => ids.map((id) => `${indent}${JSON.stringify(id)},`).join("\n");
  const text = `// OpenClaw lean profile for this fork (generated by scripts/debloat/apply.mjs; edit there).
// Keeps: Telegram, Anthropic, exec/file tools, browser, web fetch, DuckDuckGo search, cron,
// heartbeat, builtin memory, sessions, goal tool, skills and plugin loaders.
// Use: OPENCLAW_CONFIG_PATH=/path/to/openclaw.lean.json5 openclaw gateway
// Secrets come from the environment: TELEGRAM_BOT_TOKEN and ANTHROPIC_API_KEY.
{
  agents: {
    defaults: {
      model: { primary: "anthropic/claude-sonnet-5-5" },
    },
  },
  channels: {
    telegram: {
      enabled: true,
      // Token: TELEGRAM_BOT_TOKEN. Unknown senders must be approved before they can chat.
      dmPolicy: "pairing",
      groups: { "*": { requireMention: true } },
    },
  },
  gateway: {
    mode: "local",
    bind: "loopback",
    // Token: OPENCLAW_GATEWAY_TOKEN (or run \`openclaw doctor --fix --generate-gateway-token\`).
    auth: { mode: "token" },
  },
  browser: {
    // Only Browser Relay Authentication v2 clients may attach.
    extensionRelay: { allowLegacyAuth: false },
  },
  memory: {
    search: {
      // Builtin engine, keyword (FTS) recall: Anthropic has no embeddings API.
      provider: "none",
      // Cross-conversation recall needs the Active Memory plugin, which this profile denies.
      rememberAcrossConversations: false,
    },
  },
  skills: {
    // Bundled skills offered to the model; add names here to bring more back.
    allowBundled: ["clawhub", "github", "gh-issues", "healthcheck", "skill-creator", "tmux", "weather"],
  },
  // No mDNS advertisement: there are no native apps or nodes to discover this Gateway.
  discovery: { mdns: { mode: "off" } },
  tools: {
    // Sessions tools see only the current session and its own sub-agents.
    sessions: { visibility: "tree" },
    // No cross-agent session reads or sends.
    agentToAgent: { enabled: false },
    web: {
      search: { provider: "duckduckgo" },
    },
  },
  update: { checkOnStart: false },
  telemetry: { enabled: false },
  plugins: {
    // Exclusive allowlist: plugin-owned tools outside it stay unavailable.
    allow: [
${list(allow, "      ")}
    ],
    // Deny wins over allow and auto-enable; lists every other plugin still in this tree.
    deny: [
${list(deny, "      ")}
    ],
    slots: { memory: "memory-core" },
    entries: {
      anthropic: { enabled: true },
      browser: { enabled: true },
      duckduckgo: { enabled: true },
    },
  },
}
`;
  const abs = path.join(ROOT, LEAN_CONFIG_PATH);
  const before = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
  if (before !== text) {
    log(
      `${dryRun ? "would write" : "write"} ${LEAN_CONFIG_PATH} (${allow.length} allowed, ${deny.length} denied)`,
    );
    if (!dryRun) {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, text);
    }
  }
}
if (args.includes("--lean-config-only")) {
  writeLeanConfig();
  process.exit(0);
}

// ---- 1. Collect removal targets -------------------------------------------------------
const removedExtensionIds = new Set();
const removedPackageNames = new Set();
const removedPaths = [];
for (const group of selected) {
  for (const id of group.extensions) {
    removedExtensionIds.add(id);
    const pkgPath = path.join(ROOT, "extensions", id, "package.json");
    if (fs.existsSync(pkgPath)) {
      const name = JSON.parse(fs.readFileSync(pkgPath, "utf8")).name;
      if (typeof name === "string") {
        removedPackageNames.add(name);
      }
    }
    removedPaths.push(`extensions/${id}`);
    for (const docsDir of ["channels", "providers", "plugins", "plugins/reference", "tools"]) {
      removedPaths.push(`docs/${docsDir}/${id}.md`, `docs/${docsDir}/${id}`);
    }
  }
  removedPaths.push(...group.paths);
  for (const docPath of group.docs ?? []) {
    removedPaths.push(docPath);
  }
}

// ---- 2. Delete directories --------------------------------------------------------------
let removedCount = 0;
for (const target of removedPaths) {
  if (remove(target)) {
    removedCount += 1;
  }
}
log(`${removedCount} path(s) ${dryRun ? "to remove" : "removed"}`);

// ---- 3. Prune tests that import removed code ---------------------------------------------
// A test that imports a removed plugin cannot run; delete it, then delete tests that import
// those deleted helpers, until nothing changes. Production files are only reported.
const SCAN_ROOTS = ["src", "test", "packages", "ui", "scripts", "extensions", "qa", "tools"];
const CODE_EXT = /\.(?:[cm]?[jt]sx?)$/u;
const TESTISH =
  /(?:\.test\.|\.e2e\.|\.live\.|test-support|test-helpers?|test-harness|test-utils|test-fixtures?|\.cases\.|\/test\/|\/__tests__\/|\.fixture\.)/u;

function walk(dir, out) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) {
    return out;
  }
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) {
      continue;
    }
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(child, out);
    } else if (CODE_EXT.test(entry.name)) {
      out.push(child.replaceAll(path.sep, "/"));
    }
  }
  return out;
}

function escapeRe(value) {
  return value.replace(/[.*+?^${}()|[\]\\/]/gu, "\\$&");
}

const productionRefs = new Map();
{
  const idAlt = [...removedExtensionIds].map(escapeRe).join("|") || "(?!)";
  const pkgAlt = [...removedPackageNames].map(escapeRe).join("|");
  const importPrefix = String.raw`(?:from\s+|import\s*\(\s*|require\s*\(\s*|vi\.mock\(\s*|import\s+)["'\x60]`;
  // Imports of removed plugin code by workspace path or package name.
  const pluginImportRe = new RegExp(
    importPrefix +
      String.raw`(?:[^"'\x60]*extensions/(?:${idAlt})/` +
      (pkgAlt ? String.raw`|(?:${pkgAlt})(?:/|["'\x60])` : "") +
      ")",
    "u",
  );
  const specRe =
    /(?:from\s+|import\s*\(\s*|require\s*\(\s*|vi\.mock\(\s*|import\s+)["'\x60]([^"'\x60]+)["'\x60]/gu;
  const removedPrefixes = removedPaths.map((p) => p.replace(/\/$/u, ""));
  const deleted = new Set();
  const isGone = (candidate) =>
    deleted.has(candidate) ||
    removedPrefixes.some((prefix) => candidate === prefix || candidate.startsWith(`${prefix}/`));
  const resolveRel = (from, spec) => {
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
    const stem = base.replace(/\.(?:[cm]?js)$/u, "");
    return [
      base,
      ...[".ts", ".tsx", ".mts", ".cts", ".js", ".mjs"].map((ext) => stem + ext),
      `${base}/index.ts`,
    ];
  };
  const isTestish = (file) => TESTISH.test(file);
  // Standalone maintainer scripts exist to drive whatever they import (QA Lab runners,
  // live-channel probes); shared scripts/lib modules are registries and get trimmed.
  const isStandaloneScript = (file) =>
    file.startsWith("scripts/") && !file.startsWith("scripts/lib/");
  // Returns the specifiers in `text` that point at removed code.
  const removedSpecs = (file, text) => {
    const hits = [];
    for (const match of text.matchAll(specRe)) {
      const spec = match[1];
      if (pluginImportRe.test(match[0])) {
        hits.push(spec);
      } else if (spec.startsWith(".") && resolveRel(file, spec).some(isGone)) {
        hits.push(spec);
      }
    }
    return hits;
  };
  const files = SCAN_ROOTS.flatMap((dir) => walk(dir, []));
  // Read each file once; the cascade below only re-evaluates cached text.
  const textCache = new Map();
  const readCached = (file) => {
    if (!textCache.has(file)) {
      textCache.set(file, fs.readFileSync(path.join(ROOT, file), "utf8"));
    }
    return textCache.get(file);
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (const file of files) {
      if (deleted.has(file) || productionRefs.has(file) || isGone(file)) {
        continue;
      }
      const hits = removedSpecs(file, readCached(file));
      if (hits.length === 0) {
        continue;
      }
      const libOfRemovedModule =
        file.startsWith("scripts/lib/") && hits.some((spec) => !isTestish(spec));
      if (isTestish(file) || isStandaloneScript(file) || libOfRemovedModule) {
        deleted.add(file);
        changed = true;
      } else {
        productionRefs.set(file, hits);
      }
    }
  }
  for (const file of [...deleted].toSorted()) {
    remove(file);
  }
  log(`${deleted.size} test/tool file(s) importing removed code ${dryRun ? "to prune" : "pruned"}`);
}

// Production files (build scripts, registries) lose the import and every line that only
// lists an imported binding, e.g. `  discordEntrypoint,` or `...Object.values(x),`.
function pruneImports(file, specs) {
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) {
    return;
  }
  const before = fs.readFileSync(abs, "utf8");
  const statementRe = /^import\s+(?:type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["'];?[ \t]*\n/gmu;
  const names = [];
  let text = before.replace(statementRe, (statement, clause, spec) => {
    if (!specs.includes(spec)) {
      return statement;
    }
    for (const part of clause.replace(/[{}]/gu, " ").split(",")) {
      const name = part
        .trim()
        .split(/\s+as\s+/u)
        .pop()
        ?.replace(/^type\s+/u, "")
        .trim();
      if (name && /^[A-Za-z_$][\w$]*$/u.test(name)) {
        names.push(name);
      }
    }
    return "";
  });
  for (const name of names) {
    const lineRe = new RegExp(
      String.raw`^[ \t]*(?:\.\.\.)?(?:Object\.values\()?${name}\)?,?[ \t]*\n`,
      "gmu",
    );
    text = text.replace(lineRe, "");
  }
  if (text !== before) {
    log(`${dryRun ? "would prune" : "prune"} removed imports in ${file}`);
    if (!dryRun) {
      fs.writeFileSync(abs, text);
    }
  }
  const leftover = specs.filter((spec) => text.includes(`"${spec}"`) || text.includes(`'${spec}'`));
  if (leftover.length > 0) {
    log(`WARNING ${file} still imports removed code (${leftover.join(", ")}); add a group edit`);
  }
  if (names.some((name) => new RegExp(String.raw`\b${name}\b`, "u").test(text))) {
    log(`WARNING ${file} still uses a pruned binding; add a group edit`);
  }
}
for (const [file, specs] of productionRefs) {
  pruneImports(file, specs);
}

// ---- 3b. String path registries (worker entrypoint maps, routing lists) -------------------
// Drop `"key": "path.ts",` object entries and `"path.ts",` list lines whose file was removed.
{
  const removedPrefixes = removedPaths.map((p) => p.replace(/\/$/u, ""));
  const gone = (p) =>
    !exists(p) && removedPrefixes.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
  const PATH = String.raw`"((?:extensions|test|src|scripts)\/[^"\n]+\.(?:[cm]?[jt]sx?))"`;
  const shapes = [
    // [\n  "path",\n  [...],\n],  (multi-line tuple, closed at the same indentation)
    new RegExp(String.raw`^([ \t]*)\[[ \t]*\n[ \t]*${PATH},[\s\S]*?\n\1\],?[ \t]*\n`, "gmu"),
    // ["path", ...],  (single-line tuple)
    new RegExp(String.raw`^()[ \t]*\[${PATH},.*\],?[ \t]*\n`, "gmu"),
    // "key": "path",  or  "key":\n  "path",
    new RegExp(String.raw`^()[ \t]*"[^"\n]+":\s*${PATH},?[ \t]*\n`, "gmu"),
  ];
  // "path",  as a plain list element (not the head of a tuple)
  const listLineRe = new RegExp(String.raw`^[ \t]*${PATH},?[ \t]*\n`, "gmu");
  const pruneText = (text) => {
    let out = text;
    for (const shape of shapes) {
      out = out.replace(shape, (match, _indent, target) => (gone(target) ? "" : match));
    }
    return out.replace(listLineRe, (match, target, offset, whole) => {
      const before = whole.slice(0, offset).trimEnd();
      return gone(target) && !before.endsWith("[") ? "" : match;
    });
  };
  for (const dir of ["scripts/lib", "test/vitest"]) {
    for (const file of walk(dir, [])) {
      const abs = path.join(ROOT, file);
      if (!fs.existsSync(abs)) {
        continue;
      }
      const before = fs.readFileSync(abs, "utf8");
      const after = pruneText(before);
      if (after !== before) {
        log(`${dryRun ? "would prune" : "prune"} removed paths listed in ${file}`);
        if (!dryRun) {
          fs.writeFileSync(abs, after);
        }
      }
    }
  }
}

// ---- 3c. Test cases that exercise removed plugins inside otherwise-kept test files ----------
// Each group lists `testFiles` (delete whole file), `testCases` ([file, title]) for `it`/`test`
// blocks or `{ name: title }` table rows, and `testRows` ([file, text]) for `it.each` rows.
function lineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") {
      starts.push(i + 1);
    }
  }
  return starts;
}
function removeLineRange(lines, from, to) {
  lines.splice(from, to - from + 1);
  if (
    from > 0 &&
    from < lines.length &&
    lines[from - 1].trim() === "" &&
    lines[from].trim() === ""
  ) {
    lines.splice(from, 1);
  }
}
function blockEnd(lines, start, closer = /^\}/u) {
  const indent = /^[ \t]*/u.exec(lines[start])[0];
  for (let j = start + 1; j < lines.length; j += 1) {
    const line = lines[j];
    if (
      line.startsWith(indent) &&
      closer.test(line.slice(indent.length)) &&
      !/^[ \t]/u.test(line.slice(indent.length))
    ) {
      return j;
    }
  }
  return -1;
}
function removeTestCase(text, title) {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (
      !(line.includes(`"${title}`) || line.includes(`'${title}`) || line.includes(`\`${title}`))
    ) {
      continue;
    }
    let start = -1;
    // The callback closes after the `)(` line of an it.each table, not inside its type.
    let endFrom = -1;
    // Closing line of an it.each table: `])(`, `] as const)(`, `}>)(` and similar.
    const eachTail = /^\s*[\]}][^"'`]*\)\(/u;
    if (/^\s*(?:it|test|describe)(?:\.\w+)*\(/u.test(line)) {
      start = i;
    } else if (
      i > 0 &&
      (/^\s*(?:it|test|describe)(?:\.\w+)*\(\s*$/u.test(lines[i - 1]) ||
        /^\s*(?:it|test)\.each\(.*\)\(\s*$/u.test(lines[i - 1]))
    ) {
      start = i - 1;
    } else if (
      eachTail.test(line) ||
      (i > 0 && eachTail.test(lines[i - 1]) && /^\s*["'`]/u.test(line))
    ) {
      // `])("title %s", ...)` closes an it.each table; the block starts at that it.each.
      const tail = eachTail.test(line) ? i : i - 1;
      const own = /^[ \t]*/u.exec(lines[tail])[0].length;
      for (let k = tail - 1; k >= 0; k -= 1) {
        const indent = /^[ \t]*/u.exec(lines[k])[0].length;
        if (indent === own && /^\s*(?:it|test)\.each\b/u.test(lines[k])) {
          start = k;
          endFrom = tail;
          break;
        }
        if (indent < own && lines[k].trim() !== "") {
          break;
        }
      }
    } else if (/^\s*(?:name|title|label):/u.test(line)) {
      const own = /^[ \t]*/u.exec(line)[0].length;
      for (let k = i - 1; k >= 0; k -= 1) {
        const indent = /^[ \t]*/u.exec(lines[k])[0].length;
        if (indent < own && /^\s*\{\s*$/u.test(lines[k])) {
          start = k;
          break;
        }
        if (indent < own) {
          break;
        }
      }
    }
    if (start < 0) {
      return null;
    }
    const end = blockEnd(lines, endFrom >= 0 ? endFrom : start);
    if (end < 0) {
      return null;
    }
    removeLineRange(lines, start, end);
    return lines.join("\n");
  }
  return null;
}
function removeTestRow(text, needle) {
  const lines = text.split("\n");
  let changed = false;
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].includes(needle)) {
      continue;
    }
    const own = /^[ \t]*/u.exec(lines[i])[0].length;
    let parent = -1;
    for (let k = i - 1; k >= 0; k -= 1) {
      if (lines[k].trim() !== "" && /^[ \t]*/u.exec(lines[k])[0].length < own) {
        parent = k;
        break;
      }
    }
    const opener = parent >= 0 ? lines[parent].trim() : "";
    if (opener === "[" || opener === "{") {
      // Element of a multi-line tuple or object row: drop the whole row.
      const end = blockEnd(lines, parent, opener === "[" ? /^\]/u : /^\}/u);
      if (end < 0) {
        continue;
      }
      lines.splice(parent, end - parent + 1);
      i = parent - 1;
      changed = true;
    } else if (/^(?:\[.*\]|\{.*\}|["'`][^"'`]*["'`]),?$|^[\w.]+\(.*\);$/u.test(lines[i].trim())) {
      lines.splice(i, 1);
      i -= 1;
      changed = true;
    }
  }
  return changed ? lines.join("\n") : null;
}
for (const group of selected) {
  for (const file of group.testFiles ?? []) {
    remove(file);
  }
  const edits = [
    ...(group.testCases ?? []).map(([file, title]) => ({
      file,
      apply: (t) => removeTestCase(t, title),
      what: title,
    })),
    ...(group.testRows ?? []).map(([file, needle]) => ({
      file,
      apply: (t) => removeTestRow(t, needle),
      what: needle,
    })),
  ];
  for (const edit of edits) {
    const abs = path.join(ROOT, edit.file);
    if (!fs.existsSync(abs)) {
      continue;
    }
    const before = fs.readFileSync(abs, "utf8");
    const after = edit.apply(before);
    if (after === null) {
      // Already removed on an earlier run, or upstream renamed it; report so it is checked.
      if (before.includes(edit.what)) {
        log(`WARNING could not remove test "${edit.what}" from ${edit.file}`);
      }
      continue;
    }
    log(`${dryRun ? "would remove" : "remove"} test "${edit.what}" from ${edit.file}`);
    if (!dryRun) {
      fs.writeFileSync(abs, after);
    }
  }
}

// ---- 4. Prune per-group extra edits --------------------------------------------------------
for (const group of selected) {
  for (const edit of group.edits ?? []) {
    const abs = path.join(ROOT, edit.file);
    if (!fs.existsSync(abs)) {
      continue;
    }
    const before = fs.readFileSync(abs, "utf8");
    const after = edit.apply(before);
    if (after !== before) {
      log(`${dryRun ? "would edit" : "edit"} ${edit.file} (${edit.why})`);
      if (!dryRun) {
        fs.writeFileSync(abs, after);
      }
    }
  }
}

// ---- 5. Docs navigation: drop pages and redirects that no longer exist ---------------------
function docExists(page) {
  const clean = page.replace(/^\//u, "").replace(/#.*$/u, "");
  return ["", ".md", ".mdx", "/index.md", "/index.mdx"].some((suffix) =>
    exists(`docs/${clean}${suffix}`),
  );
}
function pruneNav(node) {
  if (typeof node === "string") {
    return docExists(node) ? node : undefined;
  }
  if (Array.isArray(node)) {
    return node.map(pruneNav).filter((entry) => entry !== undefined);
  }
  if (node && typeof node === "object") {
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      if (
        key === "pages" ||
        key === "groups" ||
        key === "tabs" ||
        key === "navigation" ||
        key === "languages" ||
        key === "anchors" ||
        key === "dropdowns" ||
        key === "versions"
      ) {
        const pruned = pruneNav(value);
        out[key] = pruned;
      } else {
        out[key] = value;
      }
    }
    if (Array.isArray(out.pages) && out.pages.length === 0 && !out.groups && !out.root) {
      return undefined;
    }
    if (Array.isArray(out.groups) && out.groups.length === 0 && !out.pages) {
      return undefined;
    }
    return out;
  }
  return node;
}
{
  const docsJsonPath = path.join(ROOT, "docs/docs.json");
  if (fs.existsSync(docsJsonPath)) {
    const before = fs.readFileSync(docsJsonPath, "utf8");
    const docs = JSON.parse(before);
    docs.navigation = pruneNav(docs.navigation);
    if (Array.isArray(docs.redirects)) {
      docs.redirects = docs.redirects.filter(
        (redirect) =>
          typeof redirect.destination !== "string" ||
          /^https?:/u.test(redirect.destination) ||
          docExists(redirect.destination),
      );
    }
    const after = `${JSON.stringify(docs, null, 2)}\n`;
    if (after !== before) {
      log(`${dryRun ? "would prune" : "prune"} docs/docs.json navigation and redirects`);
      if (!dryRun) {
        fs.writeFileSync(docsJsonPath, after);
      }
    }
  }
}

// ---- 6. Reinstall (prunes lockfile importers) and regenerate inventories -------------------
// pnpm refuses patches whose package left the graph; drop those entries and retry.
function installPruningUnusedPatches() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    log("$ pnpm install --no-frozen-lockfile --prefer-offline");
    if (dryRun) {
      return;
    }
    const result = spawnSync("pnpm", ["install", "--no-frozen-lockfile", "--prefer-offline"], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
    });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    if (result.status === 0) {
      log("pnpm install ok");
      return;
    }
    const unused = /The following patches were not used:\s*([^\n]+)/u.exec(output);
    if (!unused) {
      process.stdout.write(output.slice(-4000));
      throw new Error(`pnpm install exited ${result.status}`);
    }
    const specs = unused[1]
      .split(",")
      .map((spec) => spec.trim())
      .filter(Boolean);
    const workspacePath = path.join(ROOT, "pnpm-workspace.yaml");
    let workspace = fs.readFileSync(workspacePath, "utf8");
    for (const spec of specs) {
      const lineRe = new RegExp(String.raw`^\s*"?${escapeRe(spec)}"?:\s*(patches/\S+)\s*\n`, "mu");
      const match = lineRe.exec(workspace);
      if (!match) {
        throw new Error(`unused patch ${spec} not found in pnpm-workspace.yaml`);
      }
      workspace = workspace.replace(lineRe, "");
      remove(match[1]);
      log(`drop unused patch ${spec}`);
    }
    fs.writeFileSync(workspacePath, workspace);
  }
  throw new Error("pnpm install kept reporting unused patches");
}
if (!skipInstall) {
  installPruningUnusedPatches();
}
if (!skipGenerate) {
  // The official external channel catalog is not regenerated: it keeps install-on-demand
  // hints (`openclaw plugins install @openclaw/<id>`) for plugins removed from this tree.
  for (const script of [
    "config:channels:gen",
    "config:schema:gen",
    "config:docs:gen",
    "plugins:inventory:gen",
    "runtime-sidecars:gen",
    "native-catalogs:gen",
  ]) {
    // A generator that does not apply on this checkout is reported, not fatal.
    if (run("pnpm", ["-s", script], { allowFailure: true }) !== 0) {
      log(`WARNING generator ${script} failed; inspect before committing`);
    }
  }
}
writeLeanConfig();
log("done");
