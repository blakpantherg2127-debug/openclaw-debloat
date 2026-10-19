---
summary: "Generated inventory of OpenClaw plugins shipped in core, published externally, or kept source-only"
read_when:
  - You are deciding whether a plugin ships in the core npm package or installs separately
  - You are updating bundled plugin package metadata or release automation
  - You need the current internal vs external plugin list
title: "Plugin inventory"
---

<!-- Generated file. Do not edit by hand.
Run `pnpm plugins:inventory:gen` to rebuild it. -->

This page lists every OpenClaw plugin with its package, install route, and
description. Operators use it to find a plugin and to see whether that plugin
needs a separate install. Maintainers use it to check bundled plugin metadata
and release automation.

## Definitions

- **Core npm package:** built into the `openclaw` npm package and available without a separate plugin install.
- **Official external package:** OpenClaw-maintained plugin omitted from the core npm package, kept in this official inventory, and installed on demand through ClawHub and/or npm.
- **Source checkout only:** repo-local plugin omitted from published npm artifacts and not advertised as an installable package.

Source checkouts are different from npm installs: after `pnpm install`, bundled
plugins load from `extensions/<id>` so local edits and package-local workspace
dependencies are available.

## Install a plugin

Use the install route in each entry to decide whether install is needed. Plugins
that say `included in OpenClaw` are already present in the core package.
Official external packages need one install. Installation applies to the running
local Gateway without restarting it; start the Gateway if it was stopped.

For example, Discord is an official external package:

```bash
openclaw plugins install @openclaw/discord
openclaw plugins inspect discord --runtime --json
```

Ordinary bare package specs install from npm. Use `clawhub:@openclaw/discord`
or `npm:@openclaw/discord` when you need an explicit source. After install,
follow the plugin's setup doc, such as [Discord](/channels/discord), to add
credentials and channel config. See
[Manage plugins](/plugins/manage-plugins) for update, uninstall, and publishing
commands.

Each entry lists the package, distribution route, and description.

## Core npm package

33 plugins

- **[active-memory](/plugins/reference/active-memory)** (`openclaw`) - included in OpenClaw. Runs bounded pre-reply memory retrieval and implements per-agent Remember across conversations for eligible private conversations.

- **[admin-http-rpc](/plugins/reference/admin-http-rpc)** (`@openclaw/admin-http-rpc`) - included in OpenClaw. OpenClaw admin HTTP RPC endpoint.

- **[agentsapi](/plugins/reference/agentsapi)** (`@openclaw/agentsapi`) - included in OpenClaw. OpenAI Agents API harness with hosted or self-hosted sessions.

- **[anthropic](/plugins/reference/anthropic)** (`@openclaw/anthropic-provider`) - included in OpenClaw. Anthropic models, Claude CLI, and native Claude session catalog.

- **[beam](/plugins/reference/beam)** (`@openclaw/beam`) - included in OpenClaw. Read-only coding-session Beam receiver.

- **[bonjour](/plugins/reference/bonjour)** (`@openclaw/bonjour`) - included in OpenClaw. Advertise the local OpenClaw gateway over Bonjour/mDNS.

- **[browser](/plugins/reference/browser)** (`@openclaw/browser-plugin`) - included in OpenClaw. Adds agent-callable tools.

- **[cloudflare](/plugins/reference/cloudflare)** (`@openclaw/cloudflare`) - included in OpenClaw, and also from npm or ClawHub: `clawhub:@openclaw/cloudflare`. Cloudflare R2 storage for named OpenClaw storage locations.

- **[code-mode-quickjs](/plugins/reference/code-mode-quickjs)** (`@openclaw/code-mode-quickjs`) - included in OpenClaw. Hardened JavaScript execution for Code Mode using QuickJS in WebAssembly.

- **[crabbox](/plugins/reference/crabbox)** (`@openclaw/crabbox-provider`) - included in OpenClaw. Cloud worker provider and lease-backed sandbox backend for the Crabbox CLI.

- **[cua-computer](/plugins/reference/cua-computer)** (`@openclaw/cua-computer`) - included in OpenClaw. Experimental CUA Driver computer control for macOS, Windows, and Linux node hosts.

- **[device-pair](/plugins/reference/device-pair)** (`openclaw`) - included in OpenClaw. Generate setup codes and approve device pairing requests.

- **[document-extract](/plugins/reference/document-extract)** (`@openclaw/document-extract-plugin`) - included in OpenClaw. Extract text and fallback page images from local document attachments.

- **[geolocation](/plugins/reference/geolocation)** (`@openclaw/geolocation-plugin`) - included in OpenClaw. Resolves client IP addresses to a coarse city using a locally cached IP-geolocation database.

- **[github](/plugins/reference/github)** (`@openclaw/github`) - included in OpenClaw. Public GitHub link previews and document reader.

- **[google](/plugins/reference/google)** (`@openclaw/google-plugin`) - included in OpenClaw. Adds Google, Google Gemini CLI, Google Vertex model provider support to OpenClaw.

- **[imap](/plugins/reference/imap)** (`@openclaw/imap`) - included in OpenClaw. Watch IMAP mailboxes and dispatch authenticated incoming email to isolated agent sessions.

- **[llm-task](/plugins/reference/llm-task)** (`@openclaw/llm-task`) - included in OpenClaw. Generic JSON-only LLM tool for structured tasks callable from workflows.

- **[mcp-relay](/plugins/reference/mcp-relay)** (`@openclaw/mcp-relay`) - included in OpenClaw. Connect remote MCP clients to your OpenClaw Gateway.

- **[memory-core](/plugins/reference/memory-core)** (`@openclaw/memory-core`) - included in OpenClaw. Adds agent-callable tools.

- **[memory-wiki](/plugins/reference/memory-wiki)** (`@openclaw/memory-wiki`) - included in OpenClaw. Persistent wiki compiler and Obsidian-friendly knowledge vault for OpenClaw.

- **[migrate-claude](/plugins/reference/migrate-claude)** (`@openclaw/migrate-claude`) - included in OpenClaw. Imports Claude Code and Claude Desktop instructions, MCP servers, skills, and safe configuration into OpenClaw.

- **[migrate-hermes](/plugins/reference/migrate-hermes)** (`@openclaw/migrate-hermes`) - included in OpenClaw. Imports Hermes configuration, memories, skills, and supported credentials into OpenClaw.

- **[oc-path](/plugins/reference/oc-path)** (`@openclaw/oc-path`) - included in OpenClaw. Adds the openclaw path CLI for oc:// workspace file addressing.

- **[onepassword](/plugins/reference/onepassword)** (`@openclaw/onepassword`) - included in OpenClaw. 1Password SecretRef resolver and curated agent broker with approval policy and SQLite audit history.

- **[openai](/plugins/reference/openai)** (`@openclaw/openai-provider`) - included in OpenClaw. Adds OpenAI model provider support to OpenClaw.

- **[openrouter](/plugins/reference/openrouter)** (`@openclaw/openrouter-provider`) - included in OpenClaw. Adds OpenRouter model provider support to OpenClaw.

- **[policy](/plugins/reference/policy)** (`@openclaw/policy`) - included in OpenClaw. Adds policy-backed doctor checks for workspace conformance.

- **[session-share](/plugins/reference/session-share)** (`@openclaw/session-share`) - included in OpenClaw. Read-only OpenClaw sessions on paired gateways.

- **[telegram](/plugins/reference/telegram)** (`@openclaw/telegram`) - included in OpenClaw. OpenClaw Telegram channel plugin.

- **[vault](/plugins/reference/vault)** (`@openclaw/vault`) - included in OpenClaw. HashiCorp Vault SecretRef provider integration.

- **[web-readability](/plugins/reference/web-readability)** (`@openclaw/web-readability-plugin`) - included in OpenClaw. Extract readable article content from local HTML web fetch responses.

- **[workboard](/plugins/reference/workboard)** (`@openclaw/workboard`) - included in OpenClaw. Dashboard workboard for agent-owned issues and sessions.

## Official external packages

23 plugins

- **[amazon-bedrock](/plugins/reference/amazon-bedrock)** (`@openclaw/amazon-bedrock-provider`) - npm or ClawHub: `clawhub:@openclaw/amazon-bedrock-provider`. OpenClaw Amazon Bedrock provider plugin with model discovery, embeddings, and guardrail support.

- **[brave](/plugins/reference/brave)** (`@openclaw/brave-plugin`) - npm or ClawHub: `clawhub:@openclaw/brave-plugin`. OpenClaw Brave Search provider plugin for web search.

- **[codex](/plugins/reference/codex)** (`@openclaw/codex`) - npm or ClawHub: `clawhub:@openclaw/codex`. Codex app-server harness and native session catalog.

- **[diagnostics-otel](/plugins/reference/diagnostics-otel)** (`@openclaw/diagnostics-otel`) - npm or ClawHub: `clawhub:@openclaw/diagnostics-otel`. OpenClaw diagnostics OpenTelemetry exporter for metrics, traces, and logs.

- **[diagnostics-prometheus](/plugins/reference/diagnostics-prometheus)** (`@openclaw/diagnostics-prometheus`) - npm or ClawHub: `clawhub:@openclaw/diagnostics-prometheus`. OpenClaw diagnostics Prometheus exporter for runtime metrics.

- **[diffs](/plugins/reference/diffs)** (`@openclaw/diffs`) - npm or ClawHub: `clawhub:@openclaw/diffs`. OpenClaw read-only diff viewer plugin and file renderer for agents.

- **[diffs-language-pack](/plugins/reference/diffs-language-pack)** (`@openclaw/diffs-language-pack`) - npm or ClawHub: `clawhub:@openclaw/diffs-language-pack`. Adds syntax highlighting for languages outside the default diffs viewer set.

- **[duckduckgo](/plugins/reference/duckduckgo)** (`@openclaw/duckduckgo-plugin`) - npm or ClawHub: `clawhub:@openclaw/duckduckgo-plugin`. Adds web search provider support.

- **[exa](/plugins/reference/exa)** (`@openclaw/exa-plugin`) - npm or ClawHub: `clawhub:@openclaw/exa-plugin`. Adds web search provider support.

- **[firecrawl](/plugins/reference/firecrawl)** (`@openclaw/firecrawl-plugin`) - npm or ClawHub: `clawhub:@openclaw/firecrawl-plugin`. Adds agent-callable tools. Adds web fetch provider support. Adds web search provider support.

- **[lobster](/plugins/reference/lobster)** (`@openclaw/lobster`) - npm or ClawHub: `clawhub:@openclaw/lobster`. Lobster workflow tool plugin for typed pipelines and resumable approvals.

- **[memory-lancedb](/plugins/reference/memory-lancedb)** (`@openclaw/memory-lancedb`) - npm or ClawHub: `clawhub:@openclaw/memory-lancedb`. OpenClaw LanceDB-backed long-term memory plugin with auto-recall, auto-capture, and vector search.

- **[mxc](/plugins/reference/mxc)** (`@openclaw/mxc-sandbox`) - npm or ClawHub: `clawhub:@openclaw/mxc-sandbox`. OS-level sandboxed tool execution via MXC: runs commands in a Windows ProcessContainer with configured MXC policy files.

- **[onnx](/plugins/reference/onnx)** (`@openclaw/onnx`) - npm or ClawHub: `clawhub:@openclaw/onnx`. Local typed decisions using pinned ONNX classifiers.

- **[openshell](/plugins/reference/openshell)** (`@openclaw/openshell-sandbox`) - npm or ClawHub: `clawhub:@openclaw/openshell-sandbox`. OpenClaw sandbox backend for the NVIDIA OpenShell CLI with mirrored local workspaces and SSH command execution.

- **[parallel](/tools/parallel-search)** (`@openclaw/parallel-plugin`) - npm or ClawHub: `clawhub:@openclaw/parallel-plugin`. Adds web search provider support.

- **[perplexity](/plugins/reference/perplexity)** (`@openclaw/perplexity-plugin`) - npm or ClawHub: `clawhub:@openclaw/perplexity-plugin`. Adds web search provider support.

- **[qqbot](/plugins/reference/qqbot)** (`@tencent-connect/openclaw-qqbot`) - npm. OpenClaw QQ Bot channel plugin for group and direct-message workflows.

- **[searxng](/plugins/reference/searxng)** (`@openclaw/searxng-plugin`) - npm or ClawHub: `clawhub:@openclaw/searxng-plugin`. Adds web search provider support.

- **[tavily](/plugins/reference/tavily)** (`@openclaw/tavily-plugin`) - npm or ClawHub: `clawhub:@openclaw/tavily-plugin`. Adds agent-callable tools. Adds web search provider support.

- **[team-reports](/plugins/reference/team-reports)** (`@openclaw/team-reports`) - npm or ClawHub: `clawhub:@openclaw/team-reports`. Daily, weekly, and monthly team activity reports from GitHub and Discord, with model-written summaries, served in the Control UI.

- **[tokenjuice](/plugins/reference/tokenjuice)** (`@openclaw/tokenjuice`) - npm or ClawHub: `clawhub:@openclaw/tokenjuice`. Compacts exec and bash tool results with tokenjuice reducers.

- **[typesafe](/plugins/reference/typesafe)** (`@openclaw/typesafe`) - npm or ClawHub: `clawhub:@openclaw/typesafe`. Typed decision provider for hosted Jev and local System One models.

## Source checkout only

2 plugins

- **[qa-channel](/plugins/reference/qa-channel)** (`@openclaw/qa-channel`) - source checkout only. OpenClaw QA synthetic channel plugin.

- **[visitor-access](/plugins/reference/visitor-access)** (`@openclaw/visitor-access`) - source checkout only. Manage expiring visitor grants through one Cloudflare Access email policy.

## How this page is built

OpenClaw generates this page from the top-level
`extensions/*/openclaw.plugin.json` manifests and the root npm package
`files` exclusions. Optional `package.json` metadata enriches package and
distribution details. Regenerate the page with:

```bash
pnpm plugins:inventory:gen
```
