#!/usr/bin/env bash
# Run the integration suite against a local validator.
#
# Why this exists: `anchor test` deploys via target/deploy/<program>-keypair.json,
# but the keypair matching the declared program ID is not in this repo (it never is —
# target/ is gitignored). Anchor 1.0 also dropped the [[test.genesis]] config that
# used to preload a .so at a fixed address. So we start the validator ourselves with
# --bpf-program, which installs the built program at its declared ID without needing
# that keypair, then run the suite against it.
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$root"

program_id=$(sed -n 's/^magican_token = "\(.*\)"$/\1/p' Anchor.toml | head -1)
so_path="target/deploy/magican_token.so"
ledger=$(mktemp -d)

if [[ -z "$program_id" ]]; then
  echo "error: could not read program id from Anchor.toml" >&2
  exit 1
fi

if [[ ! -f "$so_path" ]]; then
  echo "error: $so_path not found — run 'anchor build --ignore-keys' first" >&2
  exit 1
fi

cleanup() {
  [[ -n "${validator_pid:-}" ]] && kill "$validator_pid" 2>/dev/null || true
  rm -rf "$ledger"
}
trap cleanup EXIT

echo "Starting validator with $program_id preloaded from $so_path"
solana-test-validator --reset --quiet \
  --ledger "$ledger" \
  --bpf-program "$program_id" "$so_path" &
validator_pid=$!

# Wait for RPC to answer rather than sleeping a fixed amount.
for _ in $(seq 1 60); do
  if solana cluster-version --url http://localhost:8899 >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! solana cluster-version --url http://localhost:8899 >/dev/null 2>&1; then
  echo "error: validator did not become ready within 60s" >&2
  exit 1
fi

anchor test --skip-local-validator --skip-build --skip-deploy
