#!/usr/bin/env bash
# Isolated test Gateway: its own HOME, state dir, config path and port (default 29789).
# Never touches ~/.openclaw or a running Gateway. Placeholder credentials only.
# Usage: gw.sh <label> <config.json5> [port] <openclaw args...>
set -euo pipefail
source "$(dirname "$0")/common.sh"
label=$1; config=$2; port=${3:-29789}; shift 3 || shift $#
base=$S/gw-$label
mkdir -p "$base/home" "$base/state"
cp "$config" "$base/openclaw.json5"; chmod 600 "$base/openclaw.json5"; chmod 700 "$base" "$base/state"
mkdir -p -m 700 "$base/state/credentials"
export HOME=$base/home OPENCLAW_STATE_DIR=$base/state OPENCLAW_CONFIG_PATH=$base/openclaw.json5
export OPENCLAW_GATEWAY_PORT=$port OPENCLAW_NO_AUTO_UPDATE=1 DO_NOT_TRACK=1
export TELEGRAM_BOT_TOKEN=123456789:debloat-placeholder-not-a-real-token
export ANTHROPIC_API_KEY=sk-ant-debloat-placeholder
export OPENCLAW_GATEWAY_TOKEN=debloat-test-gateway-token-0000000000000000
unset OPENCLAW_PROFILE
exec node "$W/openclaw.mjs" "$@"
