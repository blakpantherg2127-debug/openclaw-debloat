# Debloat log

## SETTINGS

- KEEP_CHANNEL: telegram
- KEEP_PROVIDER: anthropic
- REPO: https://github.com/blakpantherg2127-debug/openclaw-debloat
- WORKDIR: ~/openclaw-debloat-work
- BRANCH: debloat/overnight

Spec: [debloat/PLAN.md](debloat/PLAN.md). Entries are appended in order; on resume, continue from the last one.

---

### 0.1 Clone and branch

- Did: cloned REPO into WORKDIR and created `debloat/overnight` from `main` (a959e70b).
  A full-history clone grew past 5.7 GB before finishing; the container has ~30 GB writable,
  which also has to hold node_modules and build output, so I aborted it and used
  `git clone --depth 50 --branch main` (937 MB). New commits on top push normally.
- Toolchain: `package.json` requires Node `>=24.16.0`; the host only has Node 22.
  Downloaded the official Node v24.21.0 linux-x64 tarball (SHA-256 verified against
  nodejs.org SHASUMS256) into `WORKDIR/.debloat-tools/` (git-excluded, not global).
  pnpm 12.9.0 (matches `packageManager`) is the host's existing binary.
- Copied the plan to `debloat/PLAN.md`.
- Next: read repo docs, run baseline install/build/typecheck/tests and measurements.
