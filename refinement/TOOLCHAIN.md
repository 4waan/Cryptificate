# Refinement toolchain

Exact versions used to produce and check the Rust-source refinement in this directory, and how
each one was obtained.

## Extraction: Charon and Aeneas

| Tool | Version | Identifier |
| --- | --- | --- |
| Aeneas | commit `74aabd52f77001cf9eaad51b4f4b867a7dc6b111` | `aeneas -version` prints the nightly release tag ending in `-74aabd5` |
| Charon | 0.1.294, commit `260ba2c82588291b1f9efaf4f42d7100adc9c6c2` | `charon version` prints `0.1.294 (260ba2c82588291b1f9efaf4f42d7100adc9c6c2)` |
| Rust (for Charon) | `nightly-2026-09-17`, rustc 1.100.0-nightly, commit `923c95cdf5ba65cea505aa2ea829f578e1506ed8` | `charon toolchain-version` |

The Charon commit is the one named in Aeneas's `charon-pin` file at the Aeneas commit above.

**How they were obtained.** Both binaries come from the prebuilt Linux release that the Aeneas
project publishes for each nightly build: the GitHub release of `AeneasVerif/aeneas` whose tag
ends in `-74aabd5`, asset `aeneas-linux-x86_64.tar.gz`. That archive contains `aeneas`
(statically linked), `charon`, `charon-driver`, Charon's `rust-toolchain` file and the Aeneas
Lean backend. No Nix or source build was needed.

| File | SHA-256 |
| --- | --- |
| `aeneas-linux-x86_64.tar.gz` | `0c2d6acf44e3e4f38a9b04ca14f909cf049bed1033a85b4591da5fd46663eeeb` |
| `aeneas` | `c3511329bd2abf07c6e5bcf3d3bef1ac3b6042267dc7734cb4d4614c197f910b` |
| `charon` | `7d63205393e8f3714e4392101187663e282ed92a64d127e0096af947de48534a` |
| `charon-driver` | `feb79081eab70ac8239e0a123d3282dd2711aa7c4f9b0bfddfc2d90f0b7ecb5c` |

**Rust toolchain.** `charon-driver` is linked against `librustc_driver` of the toolchain named
in Charon's `rust-toolchain` file at commit `260ba2c8`, and `charon` runs it through
`rustup run <channel>`. That file asks for:

```toml
[toolchain]
channel = "nightly-2026-09-17"
components = [ "rustc-dev", "llvm-tools", "rust-src", "miri" ]
```

It was installed with

```sh
rustup toolchain install nightly-2026-09-17 --profile minimal \
  --component rustc-dev,llvm-tools,rust-src,miri
```

for the host target `x86_64-unknown-linux-gnu` only. The file also lists cross-compilation
targets (macOS, Windows, aarch64, riscv, ...) that Charon's own test suite uses; they are not
needed to extract this crate and were not installed.

**Invocation.** `refinement/extract.sh` checks both version strings before running and calls

```sh
charon rustc --preset=aeneas --sysroot default --dest-file <tmp>/cryptificate_kernels.llbc \
  -- --crate-name cryptificate_kernels --crate-type lib --edition 2021 refinement/rust/kernels_gf256.rs
aeneas -backend lean -dest <tmp>/lean <tmp>/cryptificate_kernels.llbc
```

from the repository root. `--sysroot default` uses the distributed standard library instead of
building a full-MIR sysroot: the only standard-library functions the kernels call,
`u8::wrapping_mul` and `u8::wrapping_sub`, are modelled directly by the Aeneas Lean library.

## Lean side

| Component | Version |
| --- | --- |
| Lean | `leanprover/lean4:v4.35.0` (commit `eb6cafb7290e8bd5f2937522d8d804f58f02bafc`), Lake 5.0.0 |
| Mathlib | tag `v4.35.0`, commit `56a005855ea17e0b0958f73ec801ae140b0a1679` |
| Aeneas Lean library | `backends/lean` of Aeneas commit `74aabd52f77001cf9eaad51b4f4b867a7dc6b111` |
| WideTrail | `github.com/4waan/Wide-Trail-formal-verification`, commit `162c0f8a9e59841032ec5d66874fee31cf3b6298`, unmodified |

The transitive dependencies (Batteries, Aesop, Qq, ProofWidgets, Plausible, LeanSearchClient,
ImportGraph, Cli) are pinned in `lake-manifest.json` to the revisions in the Aeneas Lean
backend's own manifest, which are the ones Mathlib `v4.35.0` uses.

`mathlib` is the first `require` in `lakefile.toml`, so its `v4.35.0` pin also applies to
WideTrail, whose own lakefile asks for Mathlib `v4.33.1` (see the compatibility notes in
`README.md`).

**How the build artifacts were obtained.**

* Lean `v4.35.0` through `elan` (`refinement/lean-toolchain`).
* Mathlib `.olean` files from the Mathlib cache: `lake exe cache get` fetches all of them. On
  a machine short of disk, `lake exe cache get <modules>` fetches only the listed modules and
  their imports; the closure needed here (the Mathlib imports of the Aeneas library and of
  WideTrail) is about 2,000 of Mathlib's 8,600 modules.
* The Aeneas Lean library's `.olean` files from the Aeneas release: its lakefile sets
  `preferReleaseBuild`, so Lake downloads `lean-build-aeneas-x86_64-unknown-linux-gnu.tar.gz`
  (SHA-256 `1f62806794b86033386ef051594b12a83bf71b6501dcf1f61d8638ef4d5e1a3f`) from the same
  release instead of compiling the library.
* WideTrail is compiled locally (about 2.5 minutes on two cores for the whole library).

Builds were run with the environment variable `CI=1`. The Aeneas lakefile turns
`precompileModules` off for `AeneasMeta` when `CI` is set, which is how the release archive
was built; without it Lake recompiles `AeneasMeta` into a shared library locally.

```sh
cd refinement
CI=1 lake exe cache get
CI=1 lake build
```
