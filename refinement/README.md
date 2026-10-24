# Rust-source refinement

This Lean package connects Rust code to WideTrail's mathematics through the chain

1. **Recorded Rust source**, identified by SHA-256 (`extract.sha256`);
2. **Aeneas model**: Charon translates the Rust crate to LLBC and Aeneas translates LLBC to a
   pure Lean program (`Extracted/`). Every function returns a `Result`; a Rust panic
   (overflow, out-of-range shift or index) becomes a failure;
3. **Executable mathematical model**: WideTrail's `GF256.xtime` and `GF256.rawMul` on
   `BitVec 8`, and the AES-like execution model `aesLikeRound` / `aesLikeExec` of the main Lean
   package (`lean/Cryptificate/Bridge.lean`) over WideTrail's field `GF256`;
4. **Named properties**: WideTrail's field laws for `GF256`, and the wide-trail active-S-box bound.

`STATUS.md` lists, link by link, what is proved, what is trusted and what is not established,
with the exact theorem statements. `claims.json` is the machine-readable list of the proved
theorems (statement, axioms, toolchain pins, SHA-256 of the Rust sources they cover).

## What is covered

| Rust code | Extraction | Proofs | Main theorems |
| --- | --- | --- | --- |
| `crates/kernels/src/gf256.rs`: `xtime`, `add`, `mul` | `Extracted/CryptificateKernels.lean` | `Refinement/GF256.lean` | `gf256_mul_refines`, `gf256_xtime_refines`, `gf256_add_refines`, `*_field`, field laws |
| `crates/kernels/src/aes_like.rs`: `round`, `encrypt` (design as runtime data) | `Extracted/CryptificateKernels.lean` | `Refinement/AesLike.lean` | `aes_like_round_refines`, `aes_like_encrypt_refines`, `aes_like_encrypt_activity_bound` |
| gf256 crate 0.3.1, `0x11B`, `no-tables`, `no-xmul`: `mul` (expanded source) | `Extracted/Gf256Aes.lean` | `Refinement/Gf256Crate.lean` | `gf256crate_mul_refines`, `gf256crate_mul_eq_kernels` |
| BN254 `Fr` (arkworks) | fails in Aeneas (`bn254-probe/`) | none | not established |

All theorems are in namespace `Cryptificate.Refinement` and hold for every input. They use the
axioms `propext`, `Classical.choice`, `Quot.sound` only, except the gf256-crate theorems, which
also mention `gf256_aes.core.mem.size_of`, the uninterpreted function the extraction declares for
`core::mem::size_of`; they assume `size_of::<u8>() = 1`. `Refinement/Axioms.lean` pins every
theorem's axioms with `#guard_msgs`, so the build fails if one changes. The proofs use the
kernel only: no `native_decide`, `bv_decide` or `sorry`.

## Layout

| Path | Content |
| --- | --- |
| `rust/kernels.rs` | Extraction root: includes the unmodified `crates/kernels/src/{gf256,aes_like}.rs` as crate `cryptificate_kernels` |
| `rust/gf256_aes_expanded.rs` | Expanded gf256 crate configuration, the input of the second extraction |
| `gf256crate/` | Configuration of the gf256 crate, `expand.sh`, the assembly script and a 65,536-product cross-check |
| `extract.sh`, `extract.sha256` | Reproduce both extractions and check every hash |
| `Extracted/` | Aeneas output |
| `Refinement/` | Proofs, the axiom pins (`Axioms.lean`) and the WideTrail modules re-checked here |
| `scripts/` | `PrintClaims.lean` and `claims.py`, which write and check `claims.json` |
| `bn254-probe/` | The attempt to extract arkworks' BN254 multiplication |

The `CryptificateBridge` library in `lakefile.toml` compiles `lean/Cryptificate/Bridge.lean`
and `lean/Cryptificate/Diffusion/Activity.lean` of the main package from their source files, so
the AES-like theorems are stated against the main package's definitions rather than a copy of
them. The main package itself builds on Lean `v4.33.1`; here the same files are compiled with
Lean and Mathlib `v4.35.0`, into this package's build directory. The correspondence is the
identical source text (`claims.json` records its SHA-256), not a shared Lean environment: the
main package's per-design certificates (MDS, offsets, S-box), which discharge the hypotheses of
`aes_like_encrypt_activity_bound` for a concrete design, are checked on `v4.33.1` and are not
imported here.

## WideTrail on Lean and Mathlib v4.35.0

WideTrail at the pinned commit targets Lean and Mathlib `v4.33.1`. Required from this package
with Mathlib pinned to `v4.35.0` first, **the whole library (all 44 modules) builds unchanged**;
no patch or vendored copy was needed. `Refinement/WideTrailModules.lean` imports the modules the
connection needs (`WideTrail.Algebra.GF256`, `MDS`, `AESSbox`, `AESMix`), so `lake build`
re-checks them.

The build reports warnings only:

* deprecated Mathlib names, still accepted: `if_true` (`Algebra/GF256.lean`, twice),
  `if_pos`/`if_neg` (`Differential/Markov.lean`, `Differential/Scheduled.lean`,
  `Hades/Probability.lean`) and `Finset.prod_le_prod'` (`Differential/Bricklayer.lean`,
  `Differential/TrailProb.lean`, `Hades/Counting.lean`, `Hades/Probability.lean`);
* a linter note that `isMDS_injective` (`Algebra/MDS.lean`) has an unused `DecidableEq`
  hypothesis in its type;
* notes in 17 files that the imported Mathlib modules are designed for Lean's module system.

## What is trusted

The theorems are about the Lean programs that Aeneas generates. That these programs have the
behaviour of the Rust source is the job of Charon (Rust MIR to LLBC) and Aeneas (LLBC to Lean),
which are trusted here, as are the Aeneas library's models of integers, shifts, casts, arrays
and slices. For the gf256 crate, the macro expansion that produces the extracted source is
checked by testing all 65,536 products, not proved. Compilation by `rustc` and the hardware are
outside the chain, and nothing is
claimed about timing or other side channels. `STATUS.md` has the full list, including the
axioms the Aeneas library declares for parts of the standard library it does not model (none
of the theorems depends on them).

## Reproducing

Toolchain versions and how to obtain them are in `TOOLCHAIN.md`.

```sh
# from the repository root
refinement/gf256crate/expand.sh                  # re-expand the gf256 crate, compare, check its hash
CHARON=/path/to/charon AENEAS=/path/to/aeneas refinement/extract.sh   # re-extract and compare

# check the proofs
cd refinement
CI=1 lake exe cache get
CI=1 lake build
python3 -I scripts/claims.py --check
```

After a change to a Rust input, `refinement/extract.sh --write` regenerates `Extracted/` and
`extract.sha256` (for the gf256 crate, run `gf256crate/expand.sh --write` first); the proofs must
then build again, and `scripts/claims.py --write` must record the new hashes, before the
refinement claims hold for the new source.
