#!/usr/bin/env bash
# Boot an isolated Gateway, idle 60 s, record RSS, query tools/plugins/status/doctor, stop it.
# Usage: gw-probe.sh <label> <config.json5> [port]   (results in .artifacts/debloat/probe-<label>)
set -uo pipefail
source "$(dirname "$0")/common.sh"
G="$(dirname "$0")/gw.sh"
label=$1; config=$(realpath "$2"); port=${3:-29789}
out=$S/probe-$label; rm -rf "$S/gw-$label"; mkdir -p "$out"
"$G" "$label" "$config" "$port" gateway --port "$port" > "$out/gateway.log" 2>&1 &
gwpid=$!
ready=0
for i in $(seq 1 180); do
  if "$G" "$label" "$config" "$port" gateway call health --json > "$out/health.json" 2>/dev/null; then ready=1; break; fi
  sleep 1
done
echo "ready=$ready after ${i}s" | tee "$out/summary.txt"
sleep 60
tree_pids() { echo "$1"; for c in $(pgrep -P "$1"); do tree_pids "$c"; done; }
rss=0; for p in $(tree_pids $gwpid); do r=$(awk '/VmRSS/{print $2}' /proc/$p/status 2>/dev/null); rss=$((rss + ${r:-0})); done
echo "idle_rss_kb=$rss" | tee -a "$out/summary.txt"
"$G" "$label" "$config" "$port" gateway call tools.catalog --json --params '{"agentId":"main"}' > "$out/tools-catalog.json" 2>"$out/tools-catalog.err"
"$G" "$label" "$config" "$port" plugins list --enabled --json > "$out/plugins.json" 2>"$out/plugins.err"
"$G" "$label" "$config" "$port" doctor --non-interactive > "$out/doctor.txt" 2>&1
kill $gwpid 2>/dev/null; for i in $(seq 1 30); do kill -0 $gwpid 2>/dev/null || break; sleep 1; done; kill -9 $gwpid 2>/dev/null
pkill -f "$S/gw-$label/" 2>/dev/null
python3 - "$out" <<'PY' | tee -a "$out/summary.txt"
import json, sys
o = sys.argv[1]
cat = json.load(open(f"{o}/tools-catalog.json"))
tools = {t["id"] for g in cat["groups"] for t in g["tools"]}
need = ["exec", "read", "write", "edit", "browser", "automations", "memory_search", "web_fetch", "web_search"]
print("tools", len(tools), "missing", [t for t in need if t not in tools])
PY
echo "stopped" >> "$out/summary.txt"
