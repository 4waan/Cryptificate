/-
Copyright (c) Cryptificate contributors. Released under the MIT license.
-/
import Extracted.CryptificateKernels
import WideTrail.Algebra.GF256

/-!
# Refinement of the GF(2⁸) kernels

`Extracted.CryptificateKernels` is the Lean translation, produced by Charon and Aeneas, of
`crates/kernels/src/gf256.rs`; `refinement/extract.sh` reproduces it and checks the recorded
SHA-256 of both files. In that translation every Rust function returns a `Result`: `ok v` for
a normal return, a failure for a panic (arithmetic overflow, out-of-range shift).

The specification is the executable model of `GF(2⁸)` in WideTrail
(`WideTrail.Algebra.GF256`): `GF256.xtime` and the shift-and-add multiplier `GF256.rawMul` on
`BitVec 8`, from which WideTrail builds the field `GF256` and proves the field laws.

Main results, for every input:

* `gf256_xtime_refines`: the Rust `xtime a` returns `ok` of `GF256.xtime` on the byte of `a`;
* `gf256_add_refines`: the Rust `add a b` returns `ok` of the xor of the bytes;
* `gf256_mul_refines`: the Rust `mul a b` returns `ok` of `GF256.rawMul` on the bytes.

Each statement is an equation `f … = ok …`, so it also says that the function cannot panic.
The `*_field` corollaries restate them with the field operations of WideTrail's `GF256`
(`toField` reads a `U8` as a field element), and the last section carries field laws back to
the Rust functions.

All proofs are checked by the kernel without `native_decide`, `bv_decide` or `sorry`; the
`#guard_msgs` blocks at the end of `Refinement.lean` pin the axioms they use.
-/

set_option autoImplicit false

open Aeneas Aeneas.Std Result
open cryptificate_kernels

namespace Cryptificate.Refinement

/-! ### Reading bytes as field elements -/

/-- The field element whose byte representation is held by `a`. -/
def toField (a : U8) : GF256 := ⟨a.bv⟩

/-- The `U8` that holds the byte representation of `x`. -/
def ofField (x : GF256) : U8 := ⟨x.val⟩

@[simp] theorem toField_ofField (x : GF256) : toField (ofField x) = x := rfl

@[simp] theorem ofField_toField (a : U8) : ofField (toField a) = a := rfl

/-! ### Primitive steps of the translation

The shift amounts in the Rust source are the literals `1` and `7` (typed `i32` by rustc), so
the translated shifts can be evaluated: they never fail. -/

private theorem shl_one (a : U8) : (a <<< 1#i32 : Result U8) = ok ⟨a.bv <<< 1⟩ := rfl

private theorem shr_seven (a : U8) : (a >>> 7#i32 : Result U8) = ok ⟨a.bv >>> 7⟩ := rfl

private theorem shr_one (a : U8) : (a >>> 1#i32 : Result U8) = ok ⟨a.bv >>> 1⟩ := rfl

/-- The branch-free reduction of the Rust `xtime` agrees with WideTrail's `if`-based one on all
`256` bytes. -/
private theorem xtime_bv :
    ∀ a : BitVec 8, (a <<< 1) ^^^ (((a >>> 7) &&& 1#8) * 0x1B#8) = GF256.xtime a := by
  decide

/-- One iteration of the Rust multiplier adds `x` to the accumulator through the mask
`0 - (y & 1)` (all ones or all zeros); WideTrail's `mulAux` tests the low bit instead. -/
private theorem masked_add_bv (acc x y : BitVec 8) :
    acc ^^^ (x &&& (0#8 - (y &&& 1#8))) = if y.getLsbD 0 then acc ^^^ x else acc := by
  have mask : ∀ y : BitVec 8,
      0#8 - (y &&& 1#8) = if y.getLsbD 0 then BitVec.allOnes 8 else 0#8 := by
    decide
  rw [mask]
  split <;> simp only [BitVec.and_allOnes, BitVec.and_zero, BitVec.xor_zero]

/-! ### `xtime` and `add` -/

/-- The Rust `xtime` never panics and computes WideTrail's `GF256.xtime`. -/
theorem gf256_xtime_refines (a : U8) : gf256.xtime a = ok ⟨GF256.xtime a.bv⟩ := by
  rw [← xtime_bv]
  simp only [gf256.xtime, shl_one, shr_seven, lift, bind_ok]
  rfl

/-- The Rust `add` never panics and computes the xor of the two bytes. -/
theorem gf256_add_refines (a b : U8) : gf256.add a b = ok ⟨a.bv ^^^ b.bv⟩ := rfl

/-! ### `mul`

Aeneas translates the `while` loop of `mul` into `gf256.mul_loop`, a call to the fixpoint
combinator `loop` on the loop body `gf256.mul_loop.body`. The loop counter `i` is an `i32`
that runs from `0` to `8`; `loopIndex n` is its value when `n` iterations remain. -/

/-- The loop counter when `n` iterations remain. -/
def loopIndex (n : Nat) : I32 := ⟨BitVec.ofNat 32 (8 - n)⟩

private theorem loopIndex_succ_add_one (n : Nat) (hn : n < 8) :
    loopIndex (n + 1) + 1#i32 = ok (loopIndex n) := by
  rcases n with _ | _ | _ | _ | _ | _ | _ | _ | n <;> first | omega | rfl

private theorem loopIndex_succ_lt (n : Nat) (hn : n < 8) : loopIndex (n + 1) < 8#i32 := by
  rcases n with _ | _ | _ | _ | _ | _ | _ | _ | n <;> first | omega | decide

private theorem loopIndex_zero_not_lt : ¬ (loopIndex 0 < 8#i32) := by decide

/-- One unfolding of the translated loop. -/
private theorem mul_loop_unfold (acc x y : U8) (i : I32) :
    gf256.mul_loop acc x y i =
      Std.bind (gf256.mul_loop.body acc x y i) (fun r =>
        match r with
        | .cont s => gf256.mul_loop s.1 s.2.1 s.2.2.1 s.2.2.2
        | .done v => ok v) := by
  unfold gf256.mul_loop
  rw [loop]
  congr 1
  funext r
  cases r <;> rfl

/-- Loop invariant: with `n` iterations remaining, the translated loop returns `ok` of
WideTrail's `mulAux n`, the same shift-and-add recursion run for `n` more steps. -/
theorem gf256_mul_loop_refines (n : Nat) (hn : n ≤ 8) (acc x y : U8) :
    gf256.mul_loop acc x y (loopIndex n) = ok ⟨GF256.mulAux n x.bv y.bv acc.bv⟩ := by
  induction n generalizing acc x y with
  | zero =>
    rw [mul_loop_unfold]
    simp only [gf256.mul_loop.body, loopIndex_zero_not_lt, ↓reduceIte, bind_ok, GF256.mulAux]
  | succ n ih =>
    rw [mul_loop_unfold]
    simp only [gf256.mul_loop.body, loopIndex_succ_lt n (by omega), ↓reduceIte, lift, bind_ok,
      gf256_xtime_refines, shr_one, loopIndex_succ_add_one n (by omega)]
    rw [ih (by omega)]
    simp only [GF256.mulAux]
    rw [← masked_add_bv]
    rfl

/-- The Rust `mul` never panics and computes WideTrail's `GF256.rawMul`. -/
theorem gf256_mul_refines (a b : U8) : gf256.mul a b = ok ⟨GF256.rawMul a.bv b.bv⟩ :=
  gf256_mul_loop_refines 8 le_rfl 0#u8 a b

/-! ### The same facts in the field `GF256` -/

/-- WideTrail's `xtime` is multiplication by the field element `x` (the byte `02`). -/
private theorem xtime_eq_rawMul_two : ∀ v : BitVec 8, GF256.xtime v = GF256.rawMul 0x02#8 v := by
  decide

/-- The Rust `mul` is multiplication in WideTrail's field `GF256`. -/
theorem gf256_mul_field (a b : U8) : gf256.mul a b = ok (ofField (toField a * toField b)) :=
  gf256_mul_refines a b

/-- The Rust `add` is addition in WideTrail's field `GF256`. -/
theorem gf256_add_field (a b : U8) : gf256.add a b = ok (ofField (toField a + toField b)) :=
  gf256_add_refines a b

/-- The Rust `xtime` is multiplication by the field element `x`, i.e. `GF256.mk 0x02#8`
(not the numeral `2`, which is `0` in characteristic 2). -/
theorem gf256_xtime_field (a : U8) :
    gf256.xtime a = ok (ofField (GF256.mk 0x02#8 * toField a)) := by
  rw [gf256_xtime_refines, xtime_eq_rawMul_two]
  rfl

/-! ### Field laws carried to the Rust functions -/

/-- The Rust `mul` is commutative. -/
theorem gf256_mul_comm (a b : U8) : gf256.mul a b = gf256.mul b a := by
  rw [gf256_mul_field, gf256_mul_field, mul_comm]

/-- The Rust `mul` is associative (both evaluation orders return the same byte). -/
theorem gf256_mul_assoc (a b c : U8) :
    (do let ab ← gf256.mul a b; gf256.mul ab c) = (do let bc ← gf256.mul b c; gf256.mul a bc) := by
  simp only [gf256_mul_field, bind_ok, bind_tc_ok, toField_ofField, mul_assoc]

/-- The Rust `mul` distributes over the Rust `add`. -/
theorem gf256_mul_add (a b c : U8) :
    (do let s ← gf256.add b c; gf256.mul a s) =
      (do let p ← gf256.mul a b; let q ← gf256.mul a c; gf256.add p q) := by
  simp only [gf256_mul_field, gf256_add_field, bind_ok, bind_tc_ok, toField_ofField, mul_add]

/-- Multiplying by the byte `02` with the Rust `mul` is the Rust `xtime`. -/
theorem gf256_mul_two (a : U8) : gf256.mul 0x02#u8 a = gf256.xtime a := by
  rw [gf256_mul_field, gf256_xtime_field]
  rfl

/-- Every nonzero byte has a Rust-`mul` inverse. -/
theorem gf256_mul_inv (a : U8) (ha : a ≠ 0#u8) :
    gf256.mul a (ofField (toField a)⁻¹) = ok 0x01#u8 := by
  have hne : toField a ≠ 0 := by
    intro h
    apply ha
    have := congrArg ofField h
    rw [ofField_toField] at this
    exact this.trans rfl
  rw [gf256_mul_field, toField_ofField, mul_inv_cancel₀ hne]
  rfl

/-- The reduction gate: `02 · 80 = 1B`. -/
example : gf256.mul 0x02#u8 0x80#u8 = ok 0x1B#u8 := by
  rw [gf256_mul_refines]
  rfl

end Cryptificate.Refinement
