# OpenClaw Debloat

A lean, personal build of [OpenClaw](https://github.com/openclaw/openclaw): one chat channel, one
model provider, and the tools I actually use. Everything else is stripped out, and anything
stripped can be added back.

Maintained by [@blakpantherg2127-debug](https://github.com/blakpantherg2127-debug). This is an
independent fork, not affiliated with or endorsed by the OpenClaw Foundation.

## What you get

- **Chat:** Telegram
- **Model provider:** Anthropic (Claude)
- **Tools:** shell/exec and file read, write and edit (with the approval and sandbox machinery
  intact), browser, web fetch, DuckDuckGo web search, cron automations and heartbeat, builtin
  memory, sessions
- **The core:** Gateway, CLI, TUI, onboarding, doctor, security audit, config validation, the goal
  tool, and the skills and plugin loaders

## What's gone

About 110 bundled plugins: 26 other chat channels, 52 other model providers (including the local
runtimes and the routers), speech, meetings and media generation, the native apps and node
plugins, and the Copilot and ACP harnesses. The full list, and what was kept on purpose, is in
[DEBLOAT_REPORT.md](DEBLOAT_REPORT.md).

| Measured on the same machine               | Upstream OpenClaw | This build |
| ------------------------------------------ | ----------------- | ---------- |
| Bundled extensions                         | 167               | 58         |
| Tracked files                              | 55,086            | 44,694     |
| `node_modules` after a fresh install       | 2.80 GB           | 2.14 GB    |
| Gateway idle memory, lean profile          | 1,951 MB          | 1,688 MB   |
| Agent tool catalog (`tools.catalog`, main) | 30.6 KB           | 11.1 KB    |

## Branches

- `debloat/overnight`: this build, and the default branch. Protected against force pushes and
  deletion.
- `main`: a frozen snapshot of upstream OpenClaw 2026.10.2 (`a959e70b`), the point this fork
  started from. Kept for reference and not updated.

## Quick start

You need Node 24.16 or newer (or 26.1+) and pnpm 12.9. Plain `npm install` is not supported.

```bash
git clone --branch debloat/overnight https://github.com/blakpantherg2127-debug/openclaw-debloat.git
cd openclaw-debloat
pnpm install
pnpm build
```

Then start it with the lean profile:

```bash
export TELEGRAM_BOT_TOKEN=...                    # from BotFather
export ANTHROPIC_API_KEY=...                     # or: pnpm openclaw models auth login --provider anthropic
export OPENCLAW_GATEWAY_TOKEN=$(openssl rand -hex 32)
export OPENCLAW_CONFIG_PATH="$PWD/debloat/openclaw.lean.json5"
pnpm openclaw config validate
pnpm openclaw doctor
pnpm openclaw gateway
```

Doctor will suggest setting `commands.ownerAllowFrom` to your Telegram user id
(`["telegram:<id>"]`); do that once you know it.

The lean profile allows only the six plugins above and denies every other plugin still in the tree.
It also keeps sessions private to their agent tree, turns off update checks, telemetry and mDNS,
requires a Gateway token, and uses keyword-only memory search. Details are in
[DEBLOAT_REPORT.md](DEBLOAT_REPORT.md#how-to-use-the-lean-profile).

## Adding a plugin back

Remove it from `plugins.deny` in your config and add it to `plugins.allow`, then:

- for a plugin that is still in the tree, restart the Gateway;
- for a removed one, also run `pnpm openclaw plugins install @openclaw/<id>`.

## Upstream

This fork doesn't track upstream OpenClaw. It's based on OpenClaw 2026.10.2 and changes only when
I change it.

- Don't use GitHub's **Sync fork** button. Its "Discard commits" option would reset this branch to
  upstream; the branch protection blocks that, and there is nothing to gain from it anyway.
- Don't run `pnpm openclaw update`: it can replace this build with an upstream release. The lean
  profile already turns off update checks at startup.
- Upstream security fixes don't arrive on their own. When one matters for the features kept here,
  it gets applied by hand, one fix at a time.

If that ever changes: every removal is done by one script, `scripts/debloat/apply.sh`, so catching
up with upstream is a merge plus a re-run. The steps are in
[DEBLOAT_REPORT.md](DEBLOAT_REPORT.md#re-applying-after-an-upstream-sync).

## How it was checked

The whole test suite ran on this build. Every failing file was then run again on its own, here and
on untouched upstream `main`, to separate what the debloat broke from what was already failing. Each
debloat-caused failure was fixed through the script. Typecheck and build pass, and an isolated
Gateway with the lean profile boots with the six plugins and every required tool. The numbers are in
[DEBLOAT_REPORT.md](DEBLOAT_REPORT.md#tests).

## Docs

- [DEBLOAT_REPORT.md](DEBLOAT_REPORT.md): what was removed, kept and measured, and the known risks
- [DEBLOAT_LOG.md](DEBLOAT_LOG.md): the step-by-step record
- [debloat/PLAN.md](debloat/PLAN.md): the original spec
- [OpenClaw docs](https://docs.openclaw.ai): everything there applies, minus the removed plugins
- [Upstream README](https://github.com/openclaw/openclaw#readme)

## Credits and license

Built on [OpenClaw](https://github.com/openclaw/openclaw) by the OpenClaw Foundation and its
contributors. This fork keeps OpenClaw's MIT license; see [LICENSE](LICENSE).
