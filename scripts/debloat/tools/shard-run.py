#!/usr/bin/env python3
"""Resumable full-suite runner: each planned Vitest shard once, N lanes, one result per shard.

`pnpm test` stops scheduling when a shard dies by signal (e.g. OOM) and cannot resume.
This records `index<TAB>rc<TAB>seconds<TAB>config` in results.tsv and skips recorded shards
on re-run. Delete a line to re-run that shard.

Usage: shard-run.py [--lanes 4] [--workers 3] [--checkout PATH]
"""
import argparse, json, os, subprocess, threading, time

ap = argparse.ArgumentParser()
ap.add_argument("--lanes", type=int, default=4)
ap.add_argument("--workers", type=int, default=3)
ap.add_argument("--checkout", default=None, help="repo to test (default: this repo)")
ap.add_argument("--tag", default="branch", help="results subdirectory name")
a = ap.parse_args()
here = os.path.dirname(os.path.abspath(__file__))
W = os.path.abspath(a.checkout) if a.checkout else subprocess.check_output(
    ["git", "-C", here, "rev-parse", "--show-toplevel"], text=True).strip()
O = os.path.join(subprocess.check_output(["git", "-C", here, "rev-parse", "--show-toplevel"], text=True).strip(),
                 ".artifacts", "debloat", a.tag)
os.makedirs(f"{O}/shards", exist_ok=True)
plan_file = f"{O}/shards.jsonl"
if not os.path.exists(plan_file):
    with open(plan_file, "w") as f:
        subprocess.run(["node", "--import", "./scripts/tsx.mjs", os.path.join(here, "list-shards.mts")],
                       cwd=W, stdout=f, check=True)
plan = [json.loads(l) for l in open(plan_file)]
RESULTS = f"{O}/results.tsv"
done = {int(l.split("\t")[0]) for l in open(RESULTS)} if os.path.exists(RESULTS) else set()
todo = [i for i in range(len(plan)) if i not in done]
PRIORITY = ("extension-telegram", "extension-database-workers")
todo.sort(key=lambda i: (next((k for k, p in enumerate(PRIORITY) if p in plan[i]["config"]), len(PRIORITY)), i))
lock = threading.Lock()
env = dict(os.environ, OPENCLAW_VITEST_MAX_WORKERS=str(a.workers))
print(f"checkout={W} plan={len(plan)} done={len(done)} todo={len(todo)}", flush=True)

def lane(indexes):
    for i in indexes:
        p = plan[i]
        s = time.time()
        with open(f"{O}/shards/{i:03d}.log", "w") as log:
            try:
                rc = subprocess.run(["node", "scripts/run-vitest.mjs", "run", "--config", p["config"], *p["args"]],
                                    cwd=W, env=env, stdout=log, stderr=subprocess.STDOUT,
                                    timeout=7200, start_new_session=True).returncode
            except subprocess.TimeoutExpired:
                rc = 124
        with lock, open(RESULTS, "a") as r:
            r.write(f"{i}\t{rc}\t{int(time.time() - s)}\t{p['config']}\n")

threads = [threading.Thread(target=lane, args=(todo[k::a.lanes],)) for k in range(a.lanes)]
for t in threads: t.start()
for t in threads: t.join()
print("all shards recorded", flush=True)
