#!/usr/bin/env python3
"""List failing tests from shard logs: file, test, first error line, removed plugin ids mentioned.

Usage: fail-sheet.py [--tag branch] [--baseline ../openclaw-baseline] > fail-sheet.jsonl
Removed ids = baseline extensions/ minus this tree's extensions/.
"""
import argparse, json, os, re, subprocess
ap = argparse.ArgumentParser(); ap.add_argument("--tag", default="branch"); ap.add_argument("--baseline")
a = ap.parse_args()
W = subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip()
O = f"{W}/.artifacts/debloat/{a.tag}"
gone = []
if a.baseline:
    gone = sorted(set(os.listdir(f"{a.baseline}/extensions")) - set(os.listdir(f"{W}/extensions")), key=len, reverse=True)
pat = re.compile(r"\b(" + "|".join(map(re.escape, gone)) + r")\b", re.I) if gone else None
rows = {}
for l in open(f"{O}/results.tsv"):
    i, rc, _, cfg = l.rstrip("\n").split("\t")
    if rc == "0":
        continue
    text = open(f"{O}/shards/{int(i):03d}.log", errors="replace").read().split("\n")
    for k, t in enumerate(text):
        m = re.match(r"^ FAIL  \|[^|]+\| (\S+)(?: \[.*?\])?(?: > (.*))?$", t)
        if not m:
            continue
        f, name = m.group(1), m.group(2) or ""
        err = next((x.strip() for x in text[k + 1:k + 12] if re.search(r"Error|expected|Cannot|ENOENT|timed out", x)), "")
        hits = sorted({h.lower() for h in pat.findall("\n".join(text[k:k + 25]) + f + name)}) if pat else []
        rows.setdefault((f, name), {"file": f, "test": name[:160], "err": err[:200], "removed": hits, "shard": int(i)})
for key in sorted(rows):
    print(json.dumps(rows[key]))
