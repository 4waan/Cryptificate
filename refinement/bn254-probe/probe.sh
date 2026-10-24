#!/usr/bin/env bash
# Run the pinned Charon and Aeneas on the arkworks BN254 multiplication.
#
# Usage: CHARON=... AENEAS=... refinement/bn254-probe/probe.sh
#
# Prints the tools' diagnostics and exits with Aeneas's status.

set -uo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
cd "$here"
CHARON=${CHARON:-charon}
AENEAS=${AENEAS:-aeneas}

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
export CARGO_TARGET_DIR="$work/target"

"$CHARON" cargo --preset=aeneas --start-from 'bn254_probe::fr_mul' \
  --dest-file "$work/bn254_probe.llbc" -- --locked 2>&1 | grep -v '^ *Compiling'
echo "charon exit status: ${PIPESTATUS[0]}"
"$AENEAS" -backend lean -no-progress-bar -dest "$work/lean" "$work/bn254_probe.llbc"
status=$?
echo "aeneas exit status: $status"
exit "$status"
