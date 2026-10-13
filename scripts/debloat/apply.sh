#!/usr/bin/env bash
# Re-apply the fork debloat after an upstream sync. All logic lives in apply.mjs.
set -euo pipefail
cd "$(dirname "$0")/../.."
exec node scripts/debloat/apply.mjs "$@"
