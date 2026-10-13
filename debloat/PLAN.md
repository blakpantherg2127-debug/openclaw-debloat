# OpenClaw fork debloat plan

This file is the full spec for the active goal. The goal objective holds the SETTINGS
(KEEP_CHANNEL, KEEP_PROVIDER, REPO, WORKDIR, BRANCH). If you lose track of them, read
the goal with `get_goal` or the top of `WORKDIR/DEBLOAT_LOG.md`.

The owner is asleep. Work unattended. Never stop to ask a question. When a choice is
ambiguous, take the conservative option (keep the thing), log why, and move on.

---

## Keep (must still work at the end)

- One chat channel: KEEP_CHANNEL
- One cloud model provider: KEEP_PROVIDER
- Shell/exec and file read/write/edit tools, with the existing approval and sandbox machinery intact
- Web browsing: browser tool, web fetch, and one web search provider
- Cron/automations and heartbeat
- Builtin memory engine and sessions
- Gateway, CLI, TUI, onboarding, doctor, security audit, config validation
- Goal tool, skills loader, plugin loader (so things can be added back later)

## Strip (candidates; verify each against the code before removing)

- Every other channel plugin
- Every other model provider, every local runtime (Ollama, llama.cpp, LM Studio, vLLM, SGLang, etc.), and the routers/gateways
- Speech/TTS/STT providers, voice call, talk mode, voice wake
- Meeting plugins: FaceTime, Google Meet, Teams meetings, Slack huddles, Zoom
- Image, music, and video generation and their providers
- Native apps and mobile/desktop nodes (`apps/`), camera, screen, location, HealthKit
- Codex harness, Copilot harness, ACP agents, Swarm, cloud workers
- Bundled demo/example content and custodian skills not needed for Keep

## Report only (do not remove; measure and describe the savings)

- Web Control UI (`ui/`)
- Memory plugins beyond builtin
- Sub-agents
- MCP support

---

## Hard rules

1. **Never touch the OpenClaw instance running this goal.** Don't edit `~/.openclaw`, don't enable/disable/uninstall plugins on it, don't restart or stop its Gateway, and don't run `/new` or `/reset`. Any of these can kill this run.
2. **Work only inside WORKDIR.** Delete nothing outside it. Don't modify or delete this plan file.
3. **No pushes to main, no force-pushes, no posting.** No upstream PRs or issues, nothing posted anywhere.
4. **No secrets in commits.** Never commit API keys, tokens, or anything from `~/.openclaw`.
5. **Isolate test Gateways.** Any test Gateway must use a non-default port and its own isolated state/config directory. Read the repo's docs on running multiple gateways for how. Stop each one when you're done with it.
6. **Nothing installed globally.** Repo-local pnpm only.
7. **Never leave BRANCH red.**

---

## Phase 0: Setup and baseline

1. Clone REPO into WORKDIR and create BRANCH from `main`.
2. Copy this plan into the repo as `debloat/PLAN.md` so it's versioned on the branch.
3. Create `DEBLOAT_LOG.md`.
   - First, write the SETTINGS block from the goal at the top.
   - After every later step, append what you did, the result, and the next step, then commit.
   - If the goal is paused and resumed, read `DEBLOAT_LOG.md` first and continue from the last entry. Never start over.
4. Before changing anything, read `AGENTS.md`, `CONTRIBUTING.md`, `package.json`, `pnpm-workspace.yaml`, `tsdown.config.ts`, and the docs on plugins, channels, providers, and config.
5. Record a baseline:
   - pnpm install time and `node_modules` size
   - build output size and packed package size
   - count of workspace packages and extensions
   - build, typecheck, and test results
   - cold start time of `openclaw --version`
   - idle RSS of an isolated test Gateway after 60 seconds
   - size of the default agent tool list, if measurable

## Phase 1: Config-only lean profile (do this first; it's the safe win)

1. Write `debloat/openclaw.lean.json5` containing:
   - a `plugins.allow` list with only what Keep needs, plus explicit `plugins.deny` entries for everything else
   - cross-agent session visibility locked down
   - `update.checkOnStart: false`
   - anything else the docs show reduces surface without breaking Keep
2. Use only config keys that exist in the repo's docs and schema. Invent nothing.
3. Do **not** use `agents.defaults.experimental.localModelLean`. It drops the browser and cron tools, which are being kept.
4. Validate the file with the repo's doctor/config validation on an isolated test instance, then commit.

## Phase 2: Source removal

### The removal script

Write `scripts/debloat/apply.sh` (or `.mjs`): one idempotent script that performs every removal. For each component it:

- deletes the extension/package directories
- prunes them from workspace config, build config, tsconfig project references, plugin registries and inventories, docs navigation, and tests

The owner needs to re-run this script after every upstream sync, so every removal goes through it. No hand deletions.

### Check after each removal

Remove one component, or one tight group, at a time. Then:

1. pnpm install, build, typecheck.
2. Run the tests for the affected area plus core gateway and agent tests.
3. Boot the isolated test Gateway. Confirm doctor/status are clean and the KEEP_CHANNEL and KEEP_PROVIDER plugins still load.

### Commit or revert

- **All green:** commit as `debloat: remove <component>` and log the size change.
- **Anything red:** try one fix that doesn't touch Keep. If it's still red, revert, log `kept: <reason>`, and move on.

### Order (least to most entangled)

1. Unused channels and providers
2. Media, speech, meetings
3. Native apps and nodes
4. Harnesses, Swarm, cloud workers

### Pushing

After each successful group, push BRANCH to origin if git credentials work. If the push fails, keep committing locally and log it.

## Phase 3: Measure and report

1. Re-run every baseline measurement.
2. Write `DEBLOAT_REPORT.md` with:
   - a before/after table
   - each component removed, with its size change
   - everything kept or reverted, and why
   - how to use the lean config
   - how to re-apply the script after an upstream sync
   - known risks
   - what to remove next if the owner accepts more risk
3. Commit and push.

---

## Done when

All of these must be verified before marking the goal complete:

- BRANCH builds, typechecks, and passes tests.
- An isolated Gateway built from BRANCH boots with the lean config, and doctor reports no errors.
- The KEEP_CHANNEL and KEEP_PROVIDER plugins load.
- The exec, file, browser, cron, and memory tools are registered.
- `scripts/debloat/apply.sh`, `debloat/openclaw.lean.json5`, `debloat/PLAN.md`, `DEBLOAT_LOG.md`, and `DEBLOAT_REPORT.md` are committed.
- Every Strip candidate is either removed or logged as kept, with a reason.

Do not mark the goal complete while any Strip candidate is still untried.

## Blocked only if

Mark the goal blocked only if one of these happens, and log the exact error first:

- this plan file can't be read
- the clone fails
- pnpm install on the untouched baseline fails
- the untouched baseline doesn't build
