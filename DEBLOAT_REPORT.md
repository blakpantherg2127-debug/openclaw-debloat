# Debloat report

Branch `debloat/overnight` of `blakpantherg2127-debug/openclaw-debloat`, based on fork `main`
`a959e70b` (OpenClaw 2026.10.2). Keep set: Telegram, Anthropic, exec/file tools with approvals and
sandbox, browser, web fetch, DuckDuckGo search, cron/heartbeat, builtin memory, sessions, Gateway,
CLI, TUI, onboarding, doctor, security audit, config validation, goal tool, skills and plugin
loaders. Full step-by-step record: [DEBLOAT_LOG.md](DEBLOAT_LOG.md). Spec: [debloat/PLAN.md](debloat/PLAN.md).

## Before and after

Measured on the same host (4 vCPU, 15 GB, Node 24.21.0, pnpm 12.9.0). "Baseline" is untouched
`main`; "after" is this branch at the final commit.

| Metric                                                                | Baseline                                  | After                                     | Change                                    |
| --------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------- | ----------------------------------------- |
| Extensions (`extensions/*`)                                           | 167                                       | 57                                        | -110 (-66%)                               |
| Workspace projects                                                    | 191                                       | 81                                        | -110                                      |
| Tracked files                                                         | 55,086                                    | 44,637                                    | -10,449 (-19%)                            |
| Test files                                                            | 19,600                                    | 16,806                                    | -2,794                                    |
| `pnpm-lock.yaml` lines                                                | 19,915                                    | 16,917                                    | -15%                                      |
| `node_modules` after a fresh install                                  | 2.80 GB, 1,617 packages                   | 2.14 GB, 1,467 packages                   | -0.66 GB (-23.5%)                         |
| `pnpm install --frozen-lockfile` (warm store, `node_modules` removed) | 31.1 s, 34.7 s                            | 17.3 s, 25.4 s                            | about -35%                                |
| Clean `pnpm build`                                                    | 3,527 s                                   | 3,534 s                                   | no change (see below)                     |
| `dist/` after a clean build                                           | 402.7 MB, 20,978 files                    | 378.4 MB, 18,639 files                    | -24.2 MB (-6%)                            |
| `npm pack --dry-run` tarball                                          | 75.0 MB (224.9 MB unpacked, 14,515 files) | 71.2 MB (214.4 MB unpacked, 13,406 files) | -3.8 MB (-5%)                             |
| `pnpm build` result                                                   | pass                                      | pass                                      |                                           |
| `pnpm tsgo:all` (typecheck)                                           | pass                                      | pass                                      |                                           |
| `openclaw --version`                                                  | 73-111 ms                                 | 73-96 ms                                  | no change (fast path never loads plugins) |
| Gateway idle RSS after 60 s, stock config                             | 2,183 MB, 19 plugins loaded               | 2,000 MB, 8 plugins loaded                | -8%                                       |
| Gateway idle RSS after 60 s, lean profile                             | 1,951 MB, 5 plugins                       | 1,688 MB, 5 plugins                       | -13%                                      |
| Agent tool catalog (`tools.catalog`, main), stock config              | 77 tools, 30.6 KB                         | 67 tools, 11.1 KB                         | -64% bytes                                |
| Agent tool catalog, lean profile                                      | 67 tools, 11.1 KB                         | 67 tools, 11.1 KB                         | same                                      |

RSS figures sum the Gateway's process tree and vary by roughly ±5% between runs.

Why `dist/` and build time moved so little: three quarters of `dist/` is core output that no plugin
removal touches (`dist/control-ui` 122.9 MB, `dist/worker` 111 MB). The plugin part,
`dist/extensions`, fell from 50.8 MB to 31.8 MB (-37%). Build time is dominated by the core
graph and declaration emit, so it did not change.

The first clean build of this branch came out _larger_ than the baseline: 441.6 MB and an 86.5 MB
tarball. Removing Voice Call left the `state-retention` Doctor build surface with no entries, and
tsdown treats an empty entry as `src/index.ts`, so it bundled a 63 MB second copy of the CLI into
`dist/state-retention/`. The media group now edits `tsdown.config.ts` to skip empty surfaces.
Nothing reads that directory except per-plugin lookups that already tolerate a missing file. The
numbers above are from the build with that fix.

## Tests

The full `pnpm test` run on the final branch is in progress (about 13-15 hours on this host). This
section will be updated with its results, classified against failures that also occur on
untouched `main`.

Per-group gates that did pass: `pnpm tsgo:all`, `pnpm build`, the bounded core test set (plugins,
channels, config, cron, doctor, agent tools, keep plugins) with no failures beyond the
pre-existing list in [DEBLOAT_LOG.md](DEBLOAT_LOG.md), and an isolated Gateway boot with doctor
clean.

## What was removed, by group

Every removal is performed by `scripts/debloat/apply.mjs`; nothing was deleted by hand.

| Group       | Removed                                                                                                                                                                                                                                                                                                                                                                                                                        | Kept from the strip list                                 | Extensions | Lockfile lines   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- | ---------- | ---------------- |
| 1 channels  | 26 channel plugins (a2a, buzz, clickclack, discord, feishu, googlechat, imessage, irc, line, matrix, mattermost, msteams, nextcloud-talk, nostr, raft, reef, signal, slack, sms, synology-chat, tlon, twitch, whatsapp, x, zalo, zalouser) and QA Lab (`extensions/qa-lab`, `test/e2e/qa-lab`)                                                                                                                                 | `qa-channel` (synthetic test channel used by core tests) | 167 -> 140 | 19,915 -> 18,155 |
| 2 providers | 52 model providers, including all local runtimes (llama-cpp, lmstudio, ollama, sglang, vllm, apple-fm), routers and gateways (litellm, clawrouter, cloudflare-ai-gateway, vercel-ai-gateway, kilocode, copilot-proxy) and voyage embeddings                                                                                                                                                                                    | `openai`, `amazon-bedrock`, `openrouter`, `google`       | 140 -> 88  | 18,155 -> 17,692 |
| 3 media     | Speech/STT/TTS (azure-speech, deepgram, elevenlabs, fish-audio-speech, gradium, inworld, microsoft, senseaudio, tts-local-cli), talk-voice, voice-call, meetings (facetime, google-meet, slack-huddles, teams-meetings, zoom-meetings), image/music/video generation (alibaba, comfy, fal, kie, pixverse, runway, vydra, image-generation-core); `examples/ai-chat`; custodian skills `add-model-provider`, `cloud-image-bake` | custodian skills `configure-channel`, `diagnose-gateway` | 88 -> 64   | 17,692 -> 17,505 |
| 4 nodes     | `apps/android`, `apps/ios`, `apps/linux`, `apps/macos`, `apps/macos-mlx-tts`, `apps/swabble`; node plugins linux-node, canvas, file-transfer, logbook                                                                                                                                                                                                                                                                          | `apps/shared`, `apps/.i18n`                              | 64 -> 60   | 17,505 -> 17,442 |
| 5 harnesses | copilot, acpx (ACP agents), crabbox (cloud workers) and the Crabbox remote-testing scripts                                                                                                                                                                                                                                                                                                                                     | `codex`, `agentsapi`                                     | 60 -> 57   | 17,442 -> 16,917 |

Per-group `dist/` and pack sizes are not listed: inside a reused checkout, test runs write worker
bundles into `dist/` and rebuilds keep old hashed assets, so only the clean-build numbers above are
comparable.

## Kept or reverted, and why

| Item                                                    | Why it stayed                                                                                                                                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `openai`, `amazon-bedrock`, `openrouter` providers      | Telegram's own test harnesses load their provider policy artifacts, and its `/login` tests use OpenRouter. The plan forbids fixes that touch Keep. The lean profile denies all three at runtime. |
| `google` provider                                       | Anthropic's own tests load Google's model catalog. Denied at runtime by the lean profile.                                                                                                        |
| `codex` harness                                         | The kept `openai` plugin imports `../codex/`; Telegram's tests expect the Codex runtime. Denied at runtime.                                                                                      |
| `agentsapi` harness                                     | The core session native-binding tests use it as their fixture harness (22 of 34 cases fail without it). Denied at runtime.                                                                       |
| `qa-channel`                                            | Synthetic channel used throughout core tests. Not a user channel.                                                                                                                                |
| `apps/shared`                                           | The Control UI imports its `tool-display.json`; the mermaid renderer writes its assets there.                                                                                                    |
| `apps/.i18n`                                            | Read by the native i18n tooling and its tests.                                                                                                                                                   |
| Core talk mode, voice wake, TTS, realtime transcription | Core runtime surfaces with 10-57 importers each and public plugin-SDK exports (`tts`, `realtime`, `speech`, `talk`).                                                                             |
| Core meeting runtime (`src/meeting-bot`)                | Backs the public `openclaw/plugin-sdk/meeting-runtime` and `meeting-page-script-runtime`.                                                                                                        |
| Core image/music/video/media generation                 | 6-15 importers each and 7 plugin-SDK exports.                                                                                                                                                    |
| Swarm                                                   | Referenced from 111 core files (session rows, run execution, tools catalog).                                                                                                                     |
| Cloud workers (`src/worker`)                            | 87 importers, 3 plugin-SDK exports.                                                                                                                                                              |
| Camera, screen, location, HealthKit core                | Core node tools and protocol; with the apps and node plugins gone there is nothing to drive them.                                                                                                |
| Official external channel catalog                       | Deliberately not regenerated, so `openclaw plugins install @openclaw/<id>` still offers the removed plugins.                                                                                     |

The core subsystems share one reason: they are the runtime and plugin-SDK surfaces that the
removed plugins plug into. Removing them would break re-adding those plugins from npm, which you
asked to keep possible.

## Report-only components (not removed)

| Component                                       | Size in the tree                                                                                                                        | What removing it would save                                                                                                                                              |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Web Control UI (`ui/`)                          | 5,812 files, 146 MB tracked (525k lines of non-test code, 2,494 test files); `dist/control-ui` is 122.9 MB, a third of the 378 MB build | The largest single piece of `dist/` and of the test suite. The Telegram mini app (`/controlui`) and the browser dashboard depend on it, and `apps/shared` exists for it. |
| Memory plugins beyond builtin                   | active-memory 32 files, memory-lancedb 44 files, memory-wiki 109 files                                                                  | memory-lancedb pulls about 195 MB of native LanceDB binaries into `node_modules` (the biggest single dependency left). The lean profile already denies all three.        |
| Sub-agents (`src/agents/subagents`)             | 460 files, 67k lines of non-test code, referenced from ~600 core files                                                                  | Not separable: session tools, spawn, announce and the Gateway's run model depend on it.                                                                                  |
| MCP support (`src/mcp`, `extensions/mcp-relay`) | 24 + 32 files, ~6k lines                                                                                                                | `@modelcontextprotocol/sdk` (17 MB) stays regardless: the kept Browser plugin depends on it. `mcp-relay` (remote MCP clients) is removable.                              |

## How to use the lean profile

`debloat/openclaw.lean.json5` is generated by the script, so its deny list always matches the
plugins still in the tree.

```bash
export TELEGRAM_BOT_TOKEN=...        # from BotFather
export ANTHROPIC_API_KEY=...         # or sign in with: openclaw models auth login --provider anthropic
export OPENCLAW_GATEWAY_TOKEN=$(openssl rand -hex 32)
cp debloat/openclaw.lean.json5 ~/.openclaw/openclaw.json5   # or point OPENCLAW_CONFIG_PATH at it
openclaw config validate
openclaw doctor
openclaw gateway
```

What it sets:

- **Plugins.** `plugins.allow` holds only anthropic, telegram, browser, duckduckgo, web-readability
  and memory-core. `plugins.deny` names every other plugin in the tree, and deny wins over allow.
- **Sessions.** `tools.sessions.visibility: "tree"` and `tools.agentToAgent.enabled: false`.
- **Telemetry and updates.** `update.checkOnStart: false` and `telemetry.enabled: false`.
- **Discovery.** mDNS is off.
- **Gateway auth.** Token mode, with the token taken from `OPENCLAW_GATEWAY_TOKEN`.
- **Browser relay.** Legacy browser-relay auth is off.
- **Memory.** Keyword-only memory search, because Anthropic has no embeddings API.
  `rememberAcrossConversations` is off, because it needs the denied Active Memory plugin.
- **Skills.** 7 bundled skills: clawhub, github, gh-issues, healthcheck, skill-creator, tmux,
  weather.

Doctor will still suggest setting `commands.ownerAllowFrom` to your Telegram user id
(`["telegram:<id>"]`). Do that once you know your id.

To bring a plugin back, remove it from `plugins.deny`, add it to `plugins.allow`, then:

- for a plugin that is still in the tree, restart the Gateway;
- for a removed one, also run `openclaw plugins install @openclaw/<id>`.

## Re-applying after an upstream sync

```bash
git fetch upstream                         # https://github.com/openclaw/openclaw
git checkout debloat/overnight
git merge upstream/main                    # resolve modify/delete conflicts by keeping the deletion
scripts/debloat/apply.sh                   # re-runs every group marked apply: true
pnpm tsgo:all && pnpm build                # gates
git add -A && git commit -m "debloat: re-apply after upstream sync"
```

How the script works:

- **What it does.** It deletes each group's plugin directories and docs. It deletes tests and
  maintainer scripts that import removed code, and trims worker-entry and path registries in
  `scripts/lib` and `test/vitest`. It drops pnpm patches for packages that left the dependency
  graph and runs `pnpm install`. It re-runs the inventory generators (channel config metadata,
  config schema/doc baselines, plugin inventory, runtime sidecars, native catalogs). It applies
  each group's listed test-case removals and file edits, then rewrites the lean profile.
- **Idempotent.** Re-running it on this branch changes nothing.
- **Flags.** `--dry-run` previews; `--only <group>` runs one group.

**When upstream adds a test or registry entry that depends on a removed plugin,** you have two
fixes:

- If it's a production file, the script prints `WARNING ... add a group edit`.
- If it's a test, typecheck or the core test set fails.

Either way, add the test file or case to that group's `testFiles` / `testCases` / `testRows`, or add
an `edits` entry, then re-run.

**Pushing:** the repo has a commits-only `upstream` remote. A plain `git push` from it can stall
fetching upstream objects. Pushing through a fresh shallow clone works, as
`.debloat-tools/push.sh` in the work directory did. Alternatively, drop `--filter=tree:0` from any
upstream fetch.

## Known risks

- **Config that names a removed plugin's feature fails validation.** For example,
  `tools.web.search.provider: "grok"`, `channels.discord`, or a removed provider's model ref will
  block Gateway startup until you edit the config or run `openclaw doctor --fix`. The lean profile
  avoids all of these.
- **Test coverage was reduced.**
  - About 150 test files and about 70 test cases that exercised removed plugins were deleted. They
    are listed per group in the script.
  - QA Lab's end-to-end suites went with it, including its tests for exec approvals, sandboxed
    exec, sandbox workspace isolation and gateway authorization. Those features are kept, and
    their unit tests remain.
  - A few deleted cases also covered kept behavior incidentally. Examples: the `doc-baseline` case
    also checked core config keys, and the `configured-state` env-probe test also covered
    Telegram.
- **Per-group proof used a bounded test set, not the full suite.** The bounded set was plugins,
  channels, config, cron, doctor, agent tools and the keep plugins' tests.
  - The full suite runs once on the final branch; see Tests above.
  - Pre-existing failures on untouched `main` in this environment were excluded from comparison:
    root-user `EACCES`, IPv6 loopback, browser CDP, the xAI doctor test, and a few others listed
    in the log.
  - Two tests were flaky under load: the cron receipt-store test and a SQLite timing assertion.
- **Some numbers barely moved.**
  - Startup time and the default tool list are unchanged, because both come from core code, not
    plugins.
  - Most removed channels and providers were already shipped as separate npm packages, so the
    published tarball changed less than the source tree.
- **Kept plugins are dormant code.** The four kept providers and the codex/agentsapi harnesses are
  present but denied. Removing them needs their dependent tests in Telegram and Anthropic edited,
  which the plan forbade.
- **The maintainer tooling is partly broken by design.** CI planning files (`scripts/lib/ci-*`)
  still mention removed paths as strings, and release scripts for the removed native apps remain.
  They are inert unless run.

## What to remove next (more risk)

In rough order of payoff to risk:

1. **memory-lancedb.** Saves about 195 MB of `node_modules` (native LanceDB). Low risk: it is
   denied in the lean profile and builtin memory is separate.
2. **The other web search providers.** brave, exa, firecrawl, parallel, perplexity, searxng and
   tavily are small and not used by the profile. They weren't on the strip list.
3. **Small opt-in plugins nothing in Keep uses.** workboard, team-reports, diffs and
   diffs-language-pack (16 MB of source), lobster, llm-task, onnx, typesafe, memory-wiki,
   active-memory, session-share, imap, beam, migrate-claude, migrate-hermes, mxc, openshell,
   visitor-access, admin-http-rpc, diagnostics-otel, diagnostics-prometheus, mcp-relay, cloudflare,
   cua-computer, bonjour, geolocation. Each needs its own test-pruning pass like the groups above.
4. **openai, amazon-bedrock, openrouter, google, codex, agentsapi.** Requires editing Telegram's
   and Anthropic's test harnesses and the core session native-binding tests to stop loading them.
5. **The Control UI (`ui/`).** The biggest remaining chunk of the tree and of `dist/`. It costs
   the browser dashboard and Telegram's `/controlui` mini app, and touches `apps/shared`.
6. **Core media, talk, swarm and cloud-worker subsystems.** Highest risk. It breaks the plugin SDK
   surfaces needed to re-install the removed plugins later.
