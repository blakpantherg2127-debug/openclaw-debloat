#!/usr/bin/env bash
# One-time: bring Crabbox back (apply.mjs no longer removes it). Restores every file the
# harnesses commit touched from its parent, then re-runs apply.mjs, which re-removes
# copilot/acpx and re-applies later edits. Review `git diff --stat` afterwards.
set -euo pipefail
source "$(dirname "$0")/common.sh"
cd "$W"
HARNESS=7474582d9a   # "debloat: remove Copilot, ACP and Crabbox harnesses"
git show --name-only --format= "$HARNESS" \
  | grep -v -x -e DEBLOAT_LOG.md -e debloat/openclaw.lean.json5 -e scripts/debloat/apply.mjs > "$S/harness-files.txt"
git checkout "$HARNESS^" -- $(cat "$S/harness-files.txt")
scripts/debloat/apply.sh
git status --short | head -40
