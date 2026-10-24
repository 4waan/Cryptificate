# Rust-source refinement

This Lean package connects the Rust arithmetic kernels that every native variant uses
(`crates/kernels`) to the WideTrail specification of `GF(2⁸)`. The chain is

1. **Recorded Rust source.** `crates/kernels/src/gf256.rs` (`xtime`, `add`, `mul`), with its
   SHA-256 recorded in `extract.sha256`. `rust/kernels_gf256.rs` is a two-line crate root that
   includes that file unchanged as module `gf256`, so the extracted items keep their real paths
   `cryptificate_kernels::gf256::{xtime, add, mul}`.
2. **Aeneas model.** Charon translates the crate to LLBC and Aeneas translates LLBC to the pure
   Lean program `Extracted/CryptificateKernels.lean` (also hashed in `extract.sha256`). Every
   function returns a `Result`; a Rust panic (overflow, out-of-range shift) becomes a failure.
3. **Executable mathematical model.** WideTrail's `GF256.xtime` and shift-and-add multiplier
   `GF256.rawMul` on `BitVec 8`, the same functions WideTrail uses to build the field `GF256`.
4. **Named properties.** WideTrail's `Field GF256` instance (field laws, inverses), carried back
   to the Rust functions.

`extract.sh` reproduces step 2 from step 1 and checks the hashes; `lake build` checks steps 2 to
4.

## What is proved

All theorems are in `Refinement/GF256.lean`, namespace `Cryptificate.Refinement`, and hold for
every input. `U8` is the Aeneas model of `u8` (a structure around `bv : BitVec 8`), `ok` the
successful `Result`, and `toField a = GF256.mk a.bv`, `ofField x = ⟨x.val⟩` convert between a
byte and WideTrail's field element.

Refinement of each kernel (no panic, and the result is the specification):

```lean
theorem gf256_xtime_refines (a : U8) : gf256.xtime a = ok ⟨GF256.xtime a.bv⟩
theorem gf256_add_refines (a b : U8) : gf256.add a b = ok ⟨a.bv ^^^ b.bv⟩
theorem gf256_mul_refines (a b : U8) : gf256.mul a b = ok ⟨GF256.rawMul a.bv b.bv⟩
```

The loop of `mul` is handled by an invariant on the translated loop `gf256.mul_loop`, where
`loopIndex n` is the `i32` loop counter when `n` iterations remain:

```lean
theorem gf256_mul_loop_refines (n : Nat) (hn : n ≤ 8) (acc x y : U8) :
    gf256.mul_loop acc x y (loopIndex n) = ok ⟨GF256.mulAux n x.bv y.bv acc.bv⟩
```

The same facts in WideTrail's field (`GF256.mk 0x02#8` is the element `x`, the byte `02`):

```lean
theorem gf256_mul_field (a b : U8) : gf256.mul a b = ok (ofField (toField a * toField b))
theorem gf256_add_field (a b : U8) : gf256.add a b = ok (ofField (toField a + toField b))
theorem gf256_xtime_field (a : U8) : gf256.xtime a = ok (ofField (GF256.mk 0x02#8 * toField a))
```

Field laws carried to the Rust functions:

```lean
theorem gf256_mul_comm (a b : U8) : gf256.mul a b = gf256.mul b a
theorem gf256_mul_assoc (a b c : U8) :
    (do let ab ← gf256.mul a b; gf256.mul ab c) = (do let bc ← gf256.mul b c; gf256.mul a bc)
theorem gf256_mul_add (a b c : U8) :
    (do let s ← gf256.add b c; gf256.mul a s) =
      (do let p ← gf256.mul a b; let q ← gf256.mul a c; gf256.add p q)
theorem gf256_mul_two (a : U8) : gf256.mul 0x02#u8 a = gf256.xtime a
theorem gf256_mul_inv (a : U8) (ha : a ≠ 0#u8) : gf256.mul a (ofField (toField a)⁻¹) = ok 0x01#u8
```

and, as a check of the reduction, `gf256.mul 0x02#u8 0x80#u8 = ok 0x1B#u8`.

The proofs use the kernel only: closed facts over the 256 bytes are checked with `decide`, the
loop by induction; there is no `native_decide`, `bv_decide` or `sorry`.

## Axioms

`Refinement/Axioms.lean` pins, with `#guard_msgs`, the output of `#print axioms` for the main
theorems, so the build fails if it changes:

* `gf256_add_refines`: `propext`, `Quot.sound`;
* all others listed there: `propext`, `Classical.choice`, `Quot.sound`.

The Aeneas Lean library declares axioms of its own for parts of the Rust standard library it
does not model: `Aeneas.Std.get_target`, `get_target.spec` and `target_feature_enabled`
(`Std/Target.lean`), the opaque types `core.sync.atomic.AtomicBool`, `AtomicU32`,
`core.panic.panic_info.PanicInfo`, `core.pin.Pin` and `core.pin.helper.PinHelper`, and
`core.slice.Slice.get_unchecked_SliceIndexUsizeSlice_spec` (`Std/Slice.lean`). None of the
theorems above depends on any of them, as `#print axioms` confirms.

## What is trusted

The theorems are about the Lean program that Aeneas generates. That this program has the
behaviour of the Rust source is the job of Charon (Rust MIR to LLBC) and Aeneas (LLBC to Lean),
which are trusted here, as are the Aeneas library's models of `u8`/`i32` arithmetic, shifts and
`wrapping_*` operations. Compilation of the Rust source to machine code by `rustc` is outside the
chain. The extraction covers `crates/kernels/src/gf256.rs` only; the BN254 module (arkworks) is
not extracted.

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

## Reproducing

Toolchain versions and how to obtain them are in `TOOLCHAIN.md`.

```sh
# from the repository root: re-extract and compare with the recorded files
CHARON=/path/to/charon AENEAS=/path/to/aeneas refinement/extract.sh

# check the proofs
cd refinement
CI=1 lake exe cache get
CI=1 lake build
```

After a change to `gf256.rs`, `refinement/extract.sh --write` regenerates
`Extracted/CryptificateKernels.lean` and `extract.sha256`; the proofs must then build again
before the refinement claim holds for the new source.
