#!/usr/bin/env bash
# Run a list of test files (one per line) in a checkout, one file at a time, low parallelism,
# and print "<rc> <file>" per file. Use on the branch and on the baseline to classify failures.
# Usage: run-files.sh <checkout> <file-list> <out-dir>
set -uo pipefail
co=$(realpath "$1"); list=$(realpath "$2"); out=$(realpath -m "$3"); mkdir -p "$out"
cd "$co"
while read -r f; do
  [ -n "$f" ] || continue
  [ -e "$f" ] || { echo "missing $f"; continue; }
  log="$out/$(echo "$f" | tr '/' '_').log"
  OPENCLAW_VITEST_MAX_WORKERS=2 pnpm test "$f" > "$log" 2>&1
  echo "$? $f"
done < "$list"
