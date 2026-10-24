#!/usr/bin/env bash
# Reproduce the Charon + Aeneas extractions and check the recorded SHA-256 of
# every Rust input and of the generated Lean.
#
# Usage: refinement/extract.sh [--write]
#
#   (no option)  Extract into a temporary directory, check the recorded hashes
#                in refinement/extract.sha256, and compare the freshly generated
#                Lean byte for byte with the files in refinement/Extracted/.
#                Exits non-zero on any difference.
#   --write      Regenerate the files in refinement/Extracted/ and rewrite
#                refinement/extract.sha256. Use after changing a Rust input,
#                then re-check the Lean proofs (lake build in refinement/).
#
# Environment:
#   CHARON   path to the charon binary (default: charon on PATH)
#   AENEAS   path to the aeneas binary (default: aeneas on PATH)
#
# Two crates are extracted:
#
#   cryptificate_kernels  refinement/rust/kernels.rs, which includes the
#                         unmodified crates/kernels/src/{gf256,aes_like}.rs;
#                         output Extracted/CryptificateKernels.lean.
#   gf256_aes             refinement/rust/gf256_aes_expanded.rs, the expanded
#                         gf256 crate configuration (see gf256crate/expand.sh),
#                         from the field multiplication only;
#                         output Extracted/Gf256Aes.lean.
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

rust_inputs=(
  crates/kernels/src/gf256.rs
  crates/kernels/src/aes_like.rs
  refinement/rust/kernels.rs
  refinement/rust/gf256_aes_expanded.rs
)
lean_outputs=(
  refinement/Extracted/CryptificateKernels.lean
  refinement/Extracted/Gf256Aes.lean
)
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
  # The Rust inputs must be the recorded ones before anything is extracted.
  for f in "${rust_inputs[@]}"; do
    grep -F "  $f" "$sums" | sha256sum --check --strict --quiet ||
      die "$f differs from the recorded hash in $sums"
  done
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# extract CRATE_NAME ROOT_FILE OUTPUT_BASENAME [extra charon options...]
extract() {
  local crate=$1 rust_root=$2 base=$3
  shift 3
  "$CHARON" rustc \
    --preset=aeneas \
    --sysroot default \
    "$@" \
    --dest-file "$work/$crate.llbc" \
    -- --crate-name "$crate" --crate-type lib --edition 2021 "$rust_root" \
    >"$work/$crate.charon.log" 2>&1 ||
    { cat "$work/$crate.charon.log" >&2; die "charon failed on $rust_root"; }
  "$AENEAS" -backend lean -no-progress-bar -dest "$work/lean" "$work/$crate.llbc" \
    >"$work/$crate.aeneas.log" 2>&1 ||
    { cat "$work/$crate.aeneas.log" >&2; die "aeneas failed on $crate"; }
  [ -f "$work/lean/$base.lean" ] || die "aeneas did not produce $base.lean"
}

extract cryptificate_kernels refinement/rust/kernels.rs CryptificateKernels
# The expanded crate defines many more items than the field multiplication;
# only `mul` and what it calls are translated.
extract gf256_aes refinement/rust/gf256_aes_expanded.rs Gf256Aes \
  --start-from 'gf256_aes::__gf256_aes_gen::gf256_aes::mul'
# Aeneas names a temporary of type `p8` `p`, and emits the crate's module `p`
# (the polynomial types) as the relative prefix `p.`; inside `mul`, after
# `let p ← ...`, Lean reads `p.__p8_gen.p8.widening_mul` as a field of the
# local `p` and rejects the file. Writing these references with their full
# names (`gf256_aes.p.__p8_gen...`, the names the definitions are declared
# under) resolves them to the same constants. Declaration lines (`def ...`)
# are left alone. No other change is made to the generated file.
sed -E -i '/^def /!s/(^|[^A-Za-z0-9_.])p\.__p(8|16)_gen\./\1gf256_aes.p.__p\2_gen./g' \
  "$work/lean/Gf256Aes.lean"

if [ "$mode" = write ]; then
  for out in "${lean_outputs[@]}"; do
    mkdir -p "$(dirname "$out")"
    cp "$work/lean/$(basename "$out")" "$out"
  done
  sha256sum "${rust_inputs[@]}" "${lean_outputs[@]}" >"$sums"
  echo "wrote ${lean_outputs[*]} and $sums"
else
  for out in "${lean_outputs[@]}"; do
    generated="$work/lean/$(basename "$out")"
    cmp -s "$generated" "$out" ||
      { diff -u "$out" "$generated" >&2 || true; die "generated Lean differs from $out"; }
  done
  sha256sum --check --strict --quiet "$sums" || die "hash mismatch in $sums"
  echo "extraction reproduced: ${lean_outputs[*]} match (charon $charon_version, $aeneas_version, rust $rust_toolchain)"
fi
