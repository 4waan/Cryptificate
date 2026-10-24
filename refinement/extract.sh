#!/usr/bin/env bash
# Reproduce the Charon + Aeneas extraction of the GF(2^8) kernels and check the
# recorded SHA-256 of the Rust input and of the generated Lean.
#
# Usage: refinement/extract.sh [--write]
#
#   (no option)  Extract into a temporary directory, check the recorded hashes
#                in refinement/extract.sha256, and compare the freshly generated
#                Lean byte for byte with refinement/Extracted/CryptificateKernels.lean.
#                Exits non-zero on any difference.
#   --write      Regenerate refinement/Extracted/CryptificateKernels.lean and
#                rewrite refinement/extract.sha256. Use after changing the Rust
#                source, then re-check the Lean proofs (lake build in refinement/).
#
# Environment:
#   CHARON   path to the charon binary (default: charon on PATH)
#   AENEAS   path to the aeneas binary (default: aeneas on PATH)
#
# The pinned versions are listed in refinement/TOOLCHAIN.md. Charon runs rustc
# through rustup with the nightly toolchain recorded in its own rust-toolchain
# file, so that toolchain (with the rustc-dev component) must be installed.

set -euo pipefail

expected_charon="0.1.294 (260ba2c82588291b1f9efaf4f42d7100adc9c6c2)"
expected_aeneas_commit="74aabd5"

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
root=$(cd "$here/.." && pwd)
# Source paths recorded in the generated Lean are relative to the repository
# root, so every tool runs from there.
cd "$root"

CHARON=${CHARON:-charon}
AENEAS=${AENEAS:-aeneas}

mode=check
case "${1:-}" in
  "") ;;
  --write) mode=write ;;
  *) echo "usage: $0 [--write]" >&2; exit 2 ;;
esac

die() { echo "extract.sh: $*" >&2; exit 1; }

rust_root=refinement/rust/kernels_gf256.rs
rust_module=crates/kernels/src/gf256.rs
lean_out=refinement/Extracted/CryptificateKernels.lean
sums=refinement/extract.sha256

charon_version=$("$CHARON" version) || die "cannot run charon ($CHARON)"
[ "$charon_version" = "$expected_charon" ] ||
  die "charon reports '$charon_version', expected '$expected_charon'"
aeneas_version=$("$AENEAS" -version) || die "cannot run aeneas ($AENEAS)"
case "$aeneas_version" in
  *-"$expected_aeneas_commit") ;;
  *) die "aeneas reports '$aeneas_version', expected a build of commit $expected_aeneas_commit" ;;
esac
rust_toolchain=$("$CHARON" toolchain-version)

if [ "$mode" = check ]; then
  # The Rust input must be the recorded one before anything is extracted.
  grep -F -e "  $rust_module" -e "  $rust_root" "$sums" | sha256sum --check --strict --quiet ||
    die "Rust source differs from the recorded hash in $sums"
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

"$CHARON" rustc \
  --preset=aeneas \
  --sysroot default \
  --dest-file "$work/cryptificate_kernels.llbc" \
  -- --crate-name cryptificate_kernels --crate-type lib --edition 2021 "$rust_root"

"$AENEAS" -backend lean -no-progress-bar -dest "$work/lean" "$work/cryptificate_kernels.llbc" >"$work/aeneas.log" 2>&1 ||
  { cat "$work/aeneas.log" >&2; die "aeneas failed"; }
generated="$work/lean/CryptificateKernels.lean"
[ -f "$generated" ] || die "aeneas did not produce CryptificateKernels.lean"

if [ "$mode" = write ]; then
  mkdir -p "$(dirname "$lean_out")"
  cp "$generated" "$lean_out"
  sha256sum "$rust_module" "$rust_root" "$lean_out" >"$sums"
  echo "wrote $lean_out and $sums"
else
  cmp -s "$generated" "$lean_out" ||
    { diff -u "$lean_out" "$generated" >&2 || true; die "generated Lean differs from $lean_out"; }
  sha256sum --check --strict --quiet "$sums" || die "hash mismatch in $sums"
  echo "extraction reproduced: $lean_out matches (charon $charon_version, $aeneas_version, rust $rust_toolchain)"
fi
