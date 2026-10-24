#!/usr/bin/env bash
# Expand the gf256 configuration of this directory into one Rust file and check
# (or, with --write, record) its SHA-256, the identity of the Rust source that
# the gf256 refinement covers.
#
# Usage: refinement/gf256crate/expand.sh [--write]
#
#   (no option)  Expand into a temporary file and compare it byte for byte with
#                refinement/rust/gf256_aes_expanded.rs and its recorded hash.
#   --write      Rewrite refinement/rust/gf256_aes_expanded.rs and its hash.
#
# Needs network access (or a populated Cargo cache) for the gf256 sources, and
# the Rust toolchain named in rust-toolchain.toml.

set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
root=$(cd "$here/../.." && pwd)
cd "$here"

toolchain=nightly-2026-09-17
out=refinement/rust/gf256_aes_expanded.rs
sums=refinement/gf256crate/expanded.sha256

mode=check
case "${1:-}" in
  "") ;;
  --write) mode=write ;;
  *) echo "usage: $0 [--write]" >&2; exit 2 ;;
esac

die() { echo "expand.sh: $*" >&2; exit 1; }

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
export CARGO_TARGET_DIR="$work/target"

cargo "+$toolchain" rustc --locked --quiet --lib -- -Zunpretty=expanded >"$work/user.rs" ||
  die "expansion of src/lib.rs failed"
cargo "+$toolchain" rustc --locked --quiet -p gf256 --lib -- -Zunpretty=expanded >"$work/crate.rs" ||
  die "expansion of the gf256 crate failed"
python3 -I assemble.py "$work/crate.rs" "$work/user.rs" "$work/expanded.rs"

cd "$root"
if [ "$mode" = write ]; then
  cp "$work/expanded.rs" "$out"
  sha256sum "$out" >"$sums"
  echo "wrote $out and $sums"
else
  cmp -s "$work/expanded.rs" "$out" ||
    { diff -u "$out" "$work/expanded.rs" | head -50 >&2 || true; die "expansion differs from $out"; }
  sha256sum --check --strict --quiet "$sums" || die "hash mismatch in $sums"
  echo "expansion reproduced: $out ($(cut -d' ' -f1 "$sums"))"
fi
