#!/usr/bin/env bash
# Build the program and its IDL.
#
# Two workarounds are baked in, both unavoidable:
#
# 1. `--ignore-keys`: the keypair matching the declared program ID is not in
#    this repo (target/ is gitignored), so Anchor's program-ID check would abort.
#    The ID in `declare_id!` stays authoritative; never run `anchor keys sync`,
#    which would rewrite it and abandon the deployed address.
#
# 2. Dropping the sbpf rustup toolchain first: cargo-build-sbf links its
#    platform-tools toolchain into rustup on the first build, and on every build
#    after that it re-reads `rustup toolchain list -v` and feeds the whole
#    "name<TAB>path" line back as a toolchain name, which rustup rejects. The
#    build then exits 0 while silently leaving the previous artifacts in place.
#    Removing the link only removes the link — platform-tools itself is untouched
#    and gets re-linked by the build.
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$root"

for toolchain in $(rustup toolchain list | awk '{print $1}' | grep -- '-sbpf-' || true); do
  echo "Dropping stale sbpf toolchain link: $toolchain"
  rustup toolchain uninstall "$toolchain" >/dev/null
done

anchor build --ignore-keys "$@"
