# Shared paths for the debloat helper tools. Source from bash.
W=$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)
S=$W/.artifacts/debloat   # git-ignored scratch: logs, shard results, isolated Gateway state
mkdir -p "$S"
