# Debloat handoff: finish Phase 3 on a local machine

Branch `debloat/wip` = `debloat/overnight` plus uncommitted work from the cloud run. Merge it
back into `debloat/overnight` only once the full suite is classified and green, or every
remaining failure is logged as pre-existing.

## Where things stand

- Done and pushed on `debloat/overnight`: all five removal groups, the `state-retention` build
  fix, measurements, `DEBLOAT_REPORT.md`, `DEBLOAT_LOG.md`. Builds, typechecks; an isolated
  Gateway with `debloat/openclaw.lean.json5` boots, loads Telegram and Anthropic, registers
  exec/read/write/edit/browser/automations (cron)/memory/web tools, and doctor reports no errors.
- Not done: the full test suite. The cloud box (4 vCPU, 16 GB) recorded 636 of 707 Vitest
  shards before handoff (`debloat/results/results.tsv`). Telegram: 12/12 shards pass. Builtin
  memory (`extension-database-workers`): 45/54 pass; the 9 failures are mostly Codex-plugin
  timing races plus two memory-core tests that also failed under memory pressure.
- `debloat/results/fail-sheet.jsonl`: 1,340 failing tests in 314 files, with the first error line
  and any removed plugin ids mentioned. Many are load timeouts on the overloaded box; rerun.

## Uncommitted work included here

1. `scripts/debloat/apply.mjs`: Crabbox is no longer removed. The maintainer PR gates
   (`scripts/pr-lib/gates.sh`, `scripts/pr-crabbox-gate-publisher.mjs`,
   `scripts/package-manifest.mjs`) run through `scripts/crabbox-wrapper`, which imports
   `extensions/crabbox`; about 25 tooling test files failed without it. The files are not restored
   yet: run `scripts/debloat/tools/restore-crabbox.sh` once (step 2 below).
2. `src/utils/message-channel.test.ts` (via an `apply.mjs` edit): channel normalization now checks
   Telegram instead of the removed Discord/iMessage.

## Rules that still apply

- Never touch the live OpenClaw on this machine: no edits to `~/.openclaw`, no plugin changes,
  no restarting its Gateway. Test Gateways use `scripts/debloat/tools/gw.sh`: own HOME, state dir,
  config and port 29789, placeholder credentials. Pick another port if 29789 is taken.
- No pushes to `main`, no upstream PRs/issues. No agent-attribution trailers
  (`Co-Authored-By`, `Claude-Session`) in commits.
- Nothing installed globally; repo-local pnpm only.

## Setup (Windows: use WSL2 Ubuntu; several suites assume POSIX)

```bash
# Node 24 and pnpm 12.9.0 (corepack picks the version from package.json)
node --version                     # must be v24.x
corepack enable
git clone https://github.com/blakpantherg2127-debug/openclaw-debloat.git
cd openclaw-debloat && git checkout debloat/wip
pnpm install --frozen-lockfile
# Untouched baseline (fork main at a959e70b) as a sibling worktree
git worktree add ../openclaw-baseline a959e70b
(cd ../openclaw-baseline && pnpm install --frozen-lockfile)
```

Keep the clone on the WSL filesystem (`~/...`), not `/mnt/c`; the suite is I/O-heavy.

## Next steps

1. **Restore Crabbox:** `scripts/debloat/tools/restore-crabbox.sh`, then check
   `git status` shows `extensions/crabbox`, `scripts/crabbox-*`, `.crabbox.yaml` back and nothing
   else unexpected. Gates: `pnpm tsgo:all`, `pnpm build`.
2. **Full suite (resumable):**
   `python3 scripts/debloat/tools/shard-run.py --lanes 4 --workers 3`
   On 32 GB, 4 lanes x 3 workers fits; lower `--lanes` if a shard dies with exit 137 (OOM).
   Re-run the same command after any interruption; recorded shards are skipped.
   Results: `.artifacts/debloat/branch/results.tsv` and `shards/NNN.log`.
3. **Classify failures:**
   `python3 scripts/debloat/tools/fail-sheet.py --baseline ../openclaw-baseline > .artifacts/debloat/fail-sheet.jsonl`
   Make the list of failing files, then run them one at a time on both trees:
   `scripts/debloat/tools/run-files.sh . files.txt .artifacts/debloat/rerun-branch`
   `scripts/debloat/tools/run-files.sh ../openclaw-baseline files.txt .artifacts/debloat/rerun-baseline`
   Fails on both = pre-existing (log it, don't fix). Fails only on the branch = debloat-caused.
4. **Fix debloat-caused failures through `scripts/debloat/apply.mjs` only** (never by hand), so
   re-applying after an upstream sync reproduces them:
   - test file about a removed thing → that group's `testFiles`;
   - one case → `testCases` (title as written in source; `it.each` titles work);
   - one table row → `testRows`;
   - test of kept behavior that only uses a removed plugin as fixture → an `edits` entry that
     switches it to Telegram/Anthropic (see the `message-channel` edit) instead of deleting it.
     Known clear cases: tests reading `apps/android|ios|macos|linux` (nodes group), integration
     tests for removed channels/providers (`test/*discord*`, `feishu`, `signal`, `fireworks`,
     `arcee`, `xai`, `qwen`, `mattermost`...), `src/plugins/contracts/*` guardrails that list
     removed plugin paths (prefer row edits), ACP harness tests needing `acpx` (harnesses group).
     Then `scripts/debloat/apply.sh`, rerun the touched files, `pnpm tsgo:all`.
5. **Re-verify:** `pnpm build`; `scripts/debloat/tools/gw-probe.sh lean debloat/openclaw.lean.json5`
   must print `missing []`; doctor in `.artifacts/debloat/probe-lean/doctor.txt` clean.
6. **Report:** update the Tests section and the kept table (Crabbox) in `DEBLOAT_REPORT.md`,
   add a 3.2 entry to `DEBLOAT_LOG.md`, commit as `debloat: ...` with no trailers, push, then
   fast-forward `debloat/overnight` to it.

## Known environment-only failures (cloud box; check on yours)

Git older than 2.45 ("frozen source reads require Git 2.45"), Go older than 1.26 (`docs-i18n`),
no IPv6 (`loopback-connect`), running as root (`io.eacces`), no Chromium paint
(`session-row-tint`), xAI doctor auth worker (`xai-auto-retirement`, also fails on `main`).
