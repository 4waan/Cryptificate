#!/usr/bin/env bash
# Fetch the pinned toolchains and build everything Cryptificate needs.
# Safe to run repeatedly: each step skips work that is already done.
#
#   scripts/setup.sh [--offline] [--skip-lean] [--skip-rust] [--skip-web] [--with-refinement]
#
# Network access is needed for:
#   - the elan installer, when elan is not installed yet;
#   - the Lean toolchain named in lean/lean-toolchain, when not installed yet;
#   - the Lake packages pinned in lean/lake-manifest.json and the Mathlib build cache
#     (`lake exe cache get`), unless already present in lean/.lake;
#   - crates listed in Cargo.lock, unless already in the cargo cache;
#   - npm packages listed in package-lock.json, unless node_modules is current.
# With --offline every network step is skipped and reported if it would be required.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OFFLINE=0
SKIP_LEAN=0
SKIP_RUST=0
SKIP_WEB=0
WITH_REFINEMENT=0
for arg in "$@"; do
  case "$arg" in
    --offline) OFFLINE=1 ;;
    --skip-lean) SKIP_LEAN=1 ;;
    --skip-rust) SKIP_RUST=1 ;;
    --skip-web) SKIP_WEB=1 ;;
    --with-refinement) WITH_REFINEMENT=1 ;;
    -h|--help) sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "setup: unknown option $arg" >&2; exit 2 ;;
  esac
done

JOBS="${CRYPTIFICATE_BUILD_JOBS:-2}"
MISSING=()

step() { printf '\n== %s\n' "$*"; }
note() { printf '   %s\n' "$*"; }
needs_network() {
  if [ "$OFFLINE" -eq 1 ]; then
    note "skipped (needs network): $*"
    MISSING+=("$*")
    return 1
  fi
  note "network: $*"
  return 0
}

# ---------------------------------------------------------------- Lean
setup_lean() {
  local toolchain
  toolchain="$(tr -d '[:space:]' < "$ROOT/lean/lean-toolchain")"
  step "Lean ($toolchain)"
  if [ -f "$HOME/.elan/env" ]; then
    # shellcheck disable=SC1091
    . "$HOME/.elan/env"
  fi
  if ! command -v elan >/dev/null 2>&1; then
    if needs_network "elan installer"; then
      curl -sSfL https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh -o "${TMPDIR:-/tmp}/elan-init.sh"
      sh "${TMPDIR:-/tmp}/elan-init.sh" -y --default-toolchain none --no-modify-path
      # shellcheck disable=SC1091
      . "$HOME/.elan/env"
    else
      return 0
    fi
  else
    note "elan: $(elan --version | head -n1)"
  fi
  if elan toolchain list 2>/dev/null | grep -q "^${toolchain}"; then
    note "toolchain installed"
  elif needs_network "Lean toolchain $toolchain"; then
    elan toolchain install "$toolchain"
  else
    return 0
  fi

  cd "$ROOT/lean"
  if [ -d .lake/packages/mathlib/.lake/build/lib ]; then
    note "Mathlib build cache present"
  elif needs_network "Lake packages and the Mathlib build cache"; then
    lake exe cache get
  else
    cd "$ROOT"
    return 0
  fi
  note "building the trusted Lean library (lake build)"
  lake build Cryptificate
  cd "$ROOT"
}

setup_refinement() {
  [ -d "$ROOT/refinement" ] || return 0
  local toolchain
  toolchain="$(tr -d '[:space:]' < "$ROOT/refinement/lean-toolchain")"
  step "Refinement proofs ($toolchain)"
  if ! elan toolchain list 2>/dev/null | grep -q "^${toolchain}"; then
    needs_network "Lean toolchain $toolchain" || return 0
    elan toolchain install "$toolchain"
  fi
  cd "$ROOT/refinement"
  if [ ! -d .lake/packages/mathlib/.lake/build/lib ]; then
    if needs_network "refinement Lake packages and Mathlib cache"; then
      lake exe cache get
    else
      cd "$ROOT"
      return 0
    fi
  fi
  if lake build; then
    # Record the check for the service: it reports the refinement claim only
    # while the kernel source keeps this digest.
    local state="${CRYPTIFICATE_HOME:-$ROOT/.cryptificate}"
    mkdir -p "$state"
    printf '{"checked": true, "kernelsSha256": "%s", "toolchain": "%s"}\n' \
      "$(sha256sum "$ROOT/crates/kernels/src/gf256.rs" | cut -d' ' -f1)" "$toolchain" > "$state/refinement.json"
    note "refinement proofs checked"
  else
    note "refinement proofs did not build"
    MISSING+=("refinement proofs")
  fi
  cd "$ROOT"
}

# ---------------------------------------------------------------- Rust
setup_rust() {
  step "Rust engine"
  if [ -f "$HOME/.cargo/env" ]; then
    # shellcheck disable=SC1091
    . "$HOME/.cargo/env"
  fi
  if ! command -v cargo >/dev/null 2>&1; then
    note "cargo not found: install Rust (https://rustup.rs) and rerun"
    MISSING+=("Rust toolchain")
    return 0
  fi
  note "$(rustc -V)"
  if [ ! -d "$ROOT/crates/cli" ]; then
    note "crates/cli is not present in this checkout; skipping the engine build"
    return 0
  fi
  local flags=(--release --locked -j "$JOBS")
  if [ "$OFFLINE" -eq 1 ]; then
    flags+=(--offline)
  else
    note "network: crates from Cargo.lock that are not cached yet"
  fi
  (cd "$ROOT" && cargo build "${flags[@]}" --bin cryptificate-engine) || {
    note "engine build failed"
    MISSING+=("cryptificate-engine build")
  }
}

# ---------------------------------------------------------------- Node
setup_node() {
  step "Node packages, service and web UI"
  if ! command -v npm >/dev/null 2>&1; then
    note "npm not found: install Node.js 20 or newer and rerun"
    MISSING+=("Node.js")
    return 0
  fi
  note "node $(node -v), npm $(npm -v)"
  cd "$ROOT"
  if [ -f node_modules/.package-lock.json ] && [ ! package-lock.json -nt node_modules/.package-lock.json ]; then
    note "node_modules is current"
  elif needs_network "npm packages"; then
    npm ci --no-audit --no-fund
  else
    return 0
  fi
  npm run build -w packages/schema
  npm run build -w apps/server
  if [ -d apps/web ]; then
    npm run build -w apps/web || {
      note "web UI build failed"
      MISSING+=("web UI build")
    }
  fi
}

[ "$SKIP_LEAN" -eq 1 ] || setup_lean
[ "$WITH_REFINEMENT" -eq 0 ] || [ "$SKIP_LEAN" -eq 1 ] || setup_refinement
[ "$SKIP_RUST" -eq 1 ] || setup_rust
[ "$SKIP_WEB" -eq 1 ] || setup_node

step "Summary"
if [ "${#MISSING[@]}" -eq 0 ]; then
  note "ready: run 'npx cryptificate serve' and open http://127.0.0.1:4173/"
else
  note "incomplete:"
  for m in "${MISSING[@]}"; do note "  - $m"; done
  exit 1
fi
