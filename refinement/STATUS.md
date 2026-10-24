# Rust-source refinement: status

The chain is **recorded Rust source → Aeneas model → executable mathematical model → named
properties**. This file lists, for each Rust kernel, which links are proved by Lean, which are
trusted, and which are not established. `claims.json` is the machine-readable form of the
proved theorems; `scripts/claims.py --check` compares it with Lean and with the source hashes.

Statuses: **proved** (checked by Lean, axioms listed), **trusted** (assumed, not checked),
**not established** (no proof exists; this is not a refutation).

## Summary

| Link | GF(2⁸) arithmetic (`crates/kernels/src/gf256.rs`) | AES-like round (`crates/kernels/src/aes_like.rs`) | gf256 crate 0.3.1, `0x11B`, `no-tables`, `no-xmul` | BN254 `Fr` (arkworks) |
| --- | --- | --- | --- | --- |
| 1. Rust source identity | recorded: SHA-256 in `extract.sha256` | recorded: SHA-256 in `extract.sha256` | recorded: expanded source `rust/gf256_aes_expanded.rs`, SHA-256 in `gf256crate/expanded.sha256` and `extract.sha256` | not established: not extracted |
| 2. Rust → Aeneas model | trusted (Charon, Aeneas); reproduced byte for byte by `extract.sh` | trusted; reproduced by `extract.sh` | trusted; reproduced by `extract.sh`, with one documented renaming (below) | not established: Aeneas fails (below) |
| 3. Aeneas model compiles in Lean | yes | yes | yes | — |
| 4. Model = specification | **proved** | **proved** | **proved**, under the hypothesis `size_of::<u8>() = 1` | not established |
| 5. Specification → named properties | **proved**: WideTrail's field `GF256` (field laws carried to the Rust functions) | **proved** as a conditional theorem: the active-S-box bound for Rust executions, assuming MDS, diffusion-optimal offsets and an injective S-box table | **proved**: equal to WideTrail's multiplier, hence to the kernels' `mul` | not established |

## 1. GF(2⁸) arithmetic of `crates/kernels`

Proof file `Refinement/GF256.lean`, namespace `Cryptificate.Refinement`; `U8` is Aeneas's model of
`u8`, `toField a = GF256.mk a.bv`, `ofField x = ⟨x.val⟩`.

```lean
theorem gf256_xtime_refines (a : U8) : gf256.xtime a = ok ⟨GF256.xtime a.bv⟩
theorem gf256_add_refines (a b : U8) : gf256.add a b = ok ⟨a.bv ^^^ b.bv⟩
theorem gf256_mul_refines (a b : U8) : gf256.mul a b = ok ⟨GF256.rawMul a.bv b.bv⟩
theorem gf256_mul_field (a b : U8) : gf256.mul a b = ok (ofField (toField a * toField b))
theorem gf256_add_field (a b : U8) : gf256.add a b = ok (ofField (toField a + toField b))
theorem gf256_xtime_field (a : U8) : gf256.xtime a = ok (ofField (GF256.mk 0x02#8 * toField a))
```

and the field laws `gf256_mul_comm`, `gf256_mul_assoc`, `gf256_mul_add`, `gf256_mul_two`,
`gf256_mul_inv`. Axioms: `propext`, `Classical.choice`, `Quot.sound` (`gf256_add_refines` and
`gf256_add_field`: `propext`, `Quot.sound`).

## 2. Parametric AES-like round of `crates/kernels`

`aes_like::round(state, matrix, offsets, sbox, round_key)` and
`aes_like::encrypt(state, matrix, offsets, sbox, round_keys, rounds)` take the design as runtime
data, so these theorems cover every AES-like design at once. Proof file
`Refinement/AesLike.lean`. The specification is the execution model of the main Lean package,
`Cryptificate.aesLikeRound` and `Cryptificate.aesLikeExec` from `lean/Cryptificate/Bridge.lean`;
the refinement package compiles that file (and `lean/Cryptificate/Diffusion/Activity.lean`,
which it imports) from the same sources, under Lean and Mathlib `v4.35.0`, instead of copying
the definitions.

Reading the Rust data: `stateOf s p = toField s[p]` (byte `4·c + r` is row `r`, column `c`),
`matrixOf m r j = toField m[4·r + j]`, `offsetsOf o r = o[r] mod 4`, `sboxOf t x = toField t[x]`,
`keysOf ks n = stateOf ks[n]`. The Rust code reduces offsets modulo 4, so the theorems hold for
every offset byte; for offsets below 4, `offsetsOf o r = o[r]` (`offsetsOf_of_lt`).

```lean
theorem aes_like_round_refines (s m o t k) :
    aes_like.round s m o t k ⦃ out =>
      stateOf out = aesLikeRound (matrixOf m) (offsetsOf o) (sboxOf t) (stateOf k) (stateOf s) ⦄
theorem aes_like_round_eq (s m o t k) :
    ∃ out, aes_like.round s m o t k = ok out ∧
      stateOf out = aesLikeRound (matrixOf m) (offsetsOf o) (sboxOf t) (stateOf k) (stateOf s)
theorem aes_like_encrypt_refines (s m o t ks rounds) (hks : rounds.val ≤ ks.length) :
    aes_like.encrypt s m o t ks rounds ⦃ out =>
      stateOf out = aesLikeExec (matrixOf m) (offsetsOf o) (sboxOf t) (keysOf ks) (stateOf s) rounds.val ⦄
theorem aes_like_encrypt_eq (…) (hks : rounds.val ≤ ks.length) :
    ∃ out, aes_like.encrypt s m o t ks rounds = ok out ∧ stateOf out = aesLikeExec … rounds.val
```

`m ⦃ v => P v ⦄` is Aeneas's total-correctness predicate (`WP.spec`): `m` returns normally
(no panic, no divergence) with a value satisfying `P`; `spec_iff_exists_ok` turns it into the
`∃ out, … = ok out ∧ …` form. So `round` never panics, and `encrypt` never panics when there are
at least `rounds` round keys (it panics otherwise, by indexing past the slice).

Connection to the wide-trail bound (`Cryptificate.activeSboxes_bound` of the main package, from
WideTrail's `IsTrail.bound_rounds`):

```lean
theorem aes_like_encrypt_activity_bound (m o t ks)
    (hM : IsMDS (matrixOf m))
    (hoff : DiffusionOptimal (gridCol 4 4) (shiftRowsPerm 4 4 (offsetsOf o)))
    (ht : ∀ a < 256, ∀ b < 256, t[a]! = t[b]! → a = b)
    (x y) (hxy : stateOf x ≠ stateOf y) (r) (hr : r ≤ ks.length) (outX outY : ℕ → Array U8 16)
    (hX : ∀ n : Usize, n.val < r → aes_like.encrypt x m o t ks n = ok (outX n.val))
    (hY : ∀ n : Usize, n.val < r → aes_like.encrypt y m o t ks n = ok (outY n.val)) :
    activityBound r ≤ ∑ n ∈ range r,
      #{p | stateOf (outX n) p + keysOf ks n p ≠ stateOf (outY n) p + keysOf ks n p}
```

The right-hand side counts S-boxes whose inputs differ between the two Rust executions, read
from what `aes_like.encrypt` returns. All four theorems use `propext`, `Classical.choice`,
`Quot.sound` only.

**Scope.** The hypotheses `hM`, `hoff`, `ht` are stated in the main package's terms (WideTrail's
`IsMDS`, `DiffusionOptimal`). For a concrete design they are what the main package's per-design
certificates prove (`matrix.mds`, `offsets.dispersion`, `sbox.bijective`), but those
certificates are checked by the main package on Lean `v4.33.1`; combining a certificate with
this theorem in one Lean environment is not done here. The model has no special last round
(as in `Bridge.lean`).

## 3. The gf256 crate (crates.io, version 0.3.1)

Configuration (`gf256crate/`): `#[gf(polynomial = 0x11b, generator = 0x3)]` with the crate
features `no-tables` and `no-xmul`. The macro then uses Barrett reduction (`barret` mode) over
the crate's polynomial types `p8`/`p16`, whose carry-less multiplication uses the bitwise loops
(`HAS_XMUL = false`).

**Expanded-source identity.** `gf256crate/expand.sh` expands the configuration with
`rustc -Zunpretty=expanded` (toolchain `nightly-2026-09-17`, dependencies locked by
`gf256crate/Cargo.lock`) and assembles one crate, `rust/gf256_aes_expanded.rs`, SHA-256
`53c324b9d62d448aaedf38c7741c8eba6bc4a2448dc888fa255529c859ddf824`. The assembly
(`gf256crate/assemble.py`) changes no executable code: it adds the internal feature gates and
two lint allowances that expanded derive and `panic!` code needs, adds
`extern crate self as gf256;` so the type's `::gf256::…` paths resolve inside the one crate,
drops the crate's predefined field types (`0x11D` and wider fields), macro imports and
documentation.
`cargo test` in `gf256crate/` checks that the expanded source, the crate itself and
`crates/kernels` agree on all 65,536 products.

**Extraction.** Charon translates the expanded crate starting from
`gf256_aes::__gf256_aes_gen::gf256_aes::mul`. Two problems, both handled explicitly:

* Aeneas emits Lean that does not compile: inside `mul` it names a temporary of type `p8` `p`,
  and Lean then reads the next reference to the crate module `p` (`p.__p8_gen.p8.widening_mul`)
  as a field of that local. `extract.sh` rewrites such references to their full names
  (`gf256_aes.p.__p8_gen.p8.widening_mul`), the names the definitions are declared under; no
  other change is made.
* `core::mem::size_of` (used for shift amounts) is not modelled by the Aeneas library at the
  pinned commit, so the translation declares `axiom gf256_aes.core.mem.size_of (T : Type) :
  Result Usize`, an uninterpreted function. The theorems assume
  `SizeOfU8 : gf256_aes.core.mem.size_of U8 = ok 1#usize` (`size_of::<u8>() == 1` is guaranteed
  by Rust), and `#print axioms` lists `gf256_aes.core.mem.size_of` for them.

Proof file `Refinement/Gf256Crate.lean`, namespace `Cryptificate.Refinement.Gf256Crate`:

```lean
theorem gf256crate_mul_refines (hsize : SizeOfU8) (a b : U8) :
    gf256_aes.__gf256_aes_gen.gf256_aes.mul a b = ok ⟨GF256.rawMul a.bv b.bv⟩
theorem gf256crate_mul_field (hsize : SizeOfU8) (a b : U8) :
    gf256_aes.__gf256_aes_gen.gf256_aes.mul a b = ok (ofField (toField a * toField b))
theorem gf256crate_mul_eq_kernels (hsize : SizeOfU8) (a b : U8) :
    gf256_aes.__gf256_aes_gen.gf256_aes.mul a b = cryptificate_kernels.gf256.mul a b
```

Axioms: `propext`, `Classical.choice`, `Quot.sound`, `gf256_aes.core.mem.size_of`. The proof
evaluates the crate's Barrett constant (`0x1B00 / 0x11B = 0x1A`, `naive_div_barrett`), proves
the loops of `naive_widening_mul` and `naive_wrapping_mul` by induction, and shows that the
resulting bit-level function equals `GF256.rawMul` (`crateMul_eq_rawMul`, axioms `propext`,
`Quot.sound`): both are additive in each argument, so the kernel checks the 64 products of
single-bit bytes and additivity extends them to all 65,536.

## 4. BN254 scalar field (arkworks): not established

`crates/kernels` re-exports `ark_bn254::Fr` (ark-bn254 / ark-ff 0.6), whose multiplication is
arkworks' generic Montgomery multiplication (`MontBackend<T, 4>`). No refinement theorem covers
it, and none covers a HADES round over it. What blocks the chain at this toolchain:

* `bn254-probe/probe.sh` runs the pinned Charon and Aeneas on `a * b` for `Fr`. Charon
  translates it with two warnings (`GATs cannot work with the --lift-associated-types option
  (implied by --preset=aeneas)` on the trait `ark_ff::Field`, `ark-ff-0.6.0/src/fields/mod.rs`
  line 160). Aeneas then fails: it reports mutually recursive groups mixing traits, types and
  functions (`Field`, `AdditiveGroup`, `PrimeField`, `FftField`, `FpConfig`,
  `SqrtPrecomputation`, the `Fp` trait implementations) as not supported, internal errors on
  the signatures of `Fp::mul` and of `MontBackend`'s `mul_assign`, `add_assign`, … and finally
  `Unimplemented` at `ark-ff-0.6.0/src/fields/mod.rs` lines 160–201, exiting with status 2.
  No Lean model of the arkworks code exists.
* Even with a model, the proof would have to show that arkworks' Montgomery multiplication
  (4×64-bit limbs, with carries in `u128`) and its final conditional subtraction compute
  `a·b·R⁻¹ mod p` for the BN254 modulus, and relate the Montgomery representation to
  WideTrail's `Poseidon2.BN254.F`. That proof has not been attempted.

So for designs over BN254, the evidence label "Rust-source refinement (Aeneas)" does not apply.
A possible route is a self-contained Montgomery kernel in `crates/kernels`, written in the
subset Aeneas handles, proved against `ZMod p`, and used by the native code instead of
arkworks; that is not done.

## Trusted components

* **Charon and Aeneas**: that the Lean model has the behaviour of the Rust source. The
  extraction is reproducible (`extract.sh` regenerates it byte for byte and checks the hashes),
  but its faithfulness is not proved.
* **The Aeneas Lean library**: its models of Rust integers (`U8`, `I8`, `I32`, `U16`, `U32`,
  `Usize`), shifts, casts, arrays and slices. It also declares axioms of its own for parts of
  the standard library it does not model (`Aeneas.Std.get_target`, `get_target.spec`,
  `target_feature_enabled`, the opaque types `core.sync.atomic.AtomicBool`, `AtomicU32`,
  `core.panic.panic_info.PanicInfo`, `core.pin.Pin`, `core.pin.helper.PinHelper`, and
  `core.slice.Slice.get_unchecked_SliceIndexUsizeSlice_spec`); none of the theorems above
  depends on them (`Refinement/Axioms.lean` pins every theorem's axioms with `#guard_msgs`).
* **The Lean kernel** (Lean `v4.35.0`).
* **rustc**: compilation of the Rust source to machine code is outside the chain, as are the
  optimizer and linker. The theorems are about the source.
* **The hardware.**

Not claimed: constant-time execution or the absence of other side channels; anything about the
generated native variants (`crates/native`) beyond their calls to these kernel functions; the
BN254 arithmetic.

## Reproducing

```sh
# from the repository root
refinement/gf256crate/expand.sh                 # expanded-source identity of the gf256 crate
CHARON=… AENEAS=… refinement/extract.sh         # both extractions, byte for byte
(cd refinement && CI=1 lake build)              # all proofs, with the axiom pins
python3 -I refinement/scripts/claims.py --check # claims.json against Lean and the sources
(cd refinement/gf256crate && cargo test)        # expansion = crate = kernels on 65,536 products
CHARON=… AENEAS=… refinement/bn254-probe/probe.sh   # the BN254 failure above
```
