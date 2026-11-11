/-
Copyright (c) Cryptificate contributors. Released under the MIT license.
-/
import Extracted.CryptificateKernels
import Mathlib.Tactic.LinearCombination
import WideTrail.Poseidon2.BN254Parameters

/-!
# Refinement of the BN254 Montgomery kernel

`Extracted.CryptificateKernels` contains the Lean translation, produced by Charon and Aeneas, of
`crates/kernels/src/bn254_mont.rs`: arithmetic modulo the BN254 scalar-field prime
`p = Poseidon2.BN254.modulus` on four little-endian 64-bit limbs, in Montgomery form with
`R = 2^256`. In that translation every Rust function returns a `Result`: `ok v` for a normal
return, a failure for a panic (arithmetic overflow, out-of-range index).

`val4 x` is the natural number held by the limbs `x`, and `toField x = val4 x · R⁻¹` is the
element of WideTrail's field `Poseidon2.BN254.F = ZMod p` that `x` represents in Montgomery
form. `Rinv` is `R⁻¹ mod p` as a natural number (`Rinv_spec`).

Main results (`m ⦃ r => P r ⦄` is Aeneas's total-correctness predicate: `m` returns `ok r` with
`P r`, so in particular it does not panic):

* `bn254_mont_mul_refines`: for `val4 a < p` and any `b`, `mul a b` returns `r` with
  `val4 r < p`, `val4 r = val4 a · val4 b · R⁻¹ mod p` and `toField r = toField a * toField b`;
* `bn254_mont_add_refines`, `bn254_mont_sub_refines`: for `val4 a, val4 b < p`, `add` and `sub`
  return the canonical sum and difference modulo `p`, which are `toField a ± toField b`;
* `bn254_mont_to_mont_refines`: for any `x`, `to_mont x` is `val4 x · R mod p`, and
  `toField (to_mont x)` is `val4 x` read in `F`;
* `bn254_mont_from_mont_refines`: for any `x`, `from_mont x` is `val4 x · R⁻¹ mod p`, the
  canonical representative of `toField x`.

The `_eq` corollaries restate the first three as `∃ r, f a b = ok r ∧ …`.

The proof is structured as limb-level specifications of `mac`, `adc` and `sbb` (by Aeneas's
`step` tactic and `omega`), the arithmetic of one CIOS row on natural numbers (`row_arith`:
`2^64 · t' = t + a·bᵢ + m·p` and `t' < 2p`), the four rows of `mul` combined over the integers,
and the final conditional subtraction (`reduce_once_spec`). All proofs are checked by the kernel
without `native_decide`, `bv_decide` or `sorry`; `Refinement/Axioms.lean` pins their axioms.
-/

set_option autoImplicit false

open Aeneas Aeneas.Std Result
open Aeneas.Std.WP
open cryptificate_kernels
open Poseidon2.BN254 (F modulus)

namespace Cryptificate.Refinement.BN254Mont

/-! Powers of `2^64` and the modulus, written as numerals so that `omega` reads them as
constants. -/

local notation "W1" => 18446744073709551616
local notation "W2" => 340282366920938463463374607431768211456
local notation "W3" => 6277101735386680763835789423207666416102355444464034512896
local notation "W4" =>
  115792089237316195423570985008687907853269984665640564039457584007913129639936
local notation "PN" =>
  21888242871839275222246405745257275088548364400416034343698204186575808495617

/-! ### Limb helpers -/

private theorem cast128 (x : U64) : (UScalar.cast .U128 x).val = x.val := by
  rw [UScalar.cast_val_eq]; have := U64.lt_succ_max x; simp only [UScalarTy.numBits]; omega

private theorem cast64 (x : U128) : (UScalar.cast .U64 x).val = x.val % 2^64 := by
  rw [UScalar.cast_val_eq]; rfl

/-- `mac acc a b c` returns the low and high limbs of `acc + a·b + c`. -/
@[step]
theorem mac_spec (acc a b c : U64) :
    bn254_mont.mac acc a b c ⦃ r =>
      r.1.val + 2^64 * r.2.val = acc.val + a.val * b.val + c.val ⦄ := by
  unfold bn254_mont.mac
  step*

/-- `adc a b c` returns the low limb and the carry of `a + b + c`. -/
@[step]
theorem adc_spec (a b c : U64) :
    bn254_mont.adc a b c ⦃ r => r.1.val + 2^64 * r.2.val = a.val + b.val + c.val ⦄ := by
  unfold bn254_mont.adc
  step*

/-- The low limb of `adc` alone, for the last limb of a sum whose carry is dropped. -/
theorem adc_lo_spec (a b c : U64) :
    bn254_mont.adc a b c ⦃ r => r.1.val = (a.val + b.val + c.val) % W1 ⦄ := by
  apply spec_mono (adc_spec a b c)
  rintro ⟨lo, hi⟩ h
  dsimp only at h ⊢
  have := U64.lt_succ_max lo
  omega

/-- For an incoming borrow of `0` or `1`, `sbb a b c` returns `a - b - c` modulo `2^64` and the
outgoing borrow, `0` or `1`. -/
@[step]
theorem sbb_spec (a b c : U64) (hc : c.val ≤ 1) :
    bn254_mont.sbb a b c ⦃ r =>
      r.2.val ≤ 1 ∧ r.1.val + b.val + c.val = a.val + 2^64 * r.2.val ⦄ := by
  unfold bn254_mont.sbb
  step*
  rw [i_post, cast128] at i1_post
  rw [i2_post, cast128] at i3_post1 i3_post
  rw [i4_post, cast128] at t_post t_post1
  rw [i5_post, cast64]
  rw [i7_post, cast64] at i8_post i8_post1
  rw [Nat.shiftRight_eq_div_pow] at i6_post
  have := U64.lt_succ_max a; have := U64.lt_succ_max b
  omega

/-! ### Limb values and constants -/

/-- The BN254 scalar-field modulus as a numeral (`P_eq`: it is `Poseidon2.BN254.modulus`). -/
def P : ℕ := PN

theorem P_eq : P = modulus := rfl

/-- The natural number held by four little-endian 64-bit limbs. -/
def val4 (x : Array U64 4#usize) : ℕ :=
  (x.val[0]'(by simp)).val + 2^64 * (x.val[1]'(by simp)).val
    + 2^128 * (x.val[2]'(by simp)).val + 2^192 * (x.val[3]'(by simp)).val

@[simp] theorem val4_make (a b c d : U64) (h) :
    val4 (Array.make 4#usize [a, b, c, d] h) =
      a.val + 2^64 * b.val + 2^128 * c.val + 2^192 * d.val := by
  simp [val4]

theorem val4_repeat_zero : val4 (Array.repeat 4#usize 0#u64) = 0 := by
  simp [val4]

@[simp] theorem P0_val : bn254_mont.P0.val = 4891460686036598785 := by unfold bn254_mont.P0; rfl
@[simp] theorem P1_val : bn254_mont.P1.val = 2896914383306846353 := by unfold bn254_mont.P1; rfl
@[simp] theorem P2_val : bn254_mont.P2.val = 13281191951274694749 := by
  unfold bn254_mont.P2; rfl
@[simp] theorem P3_val : bn254_mont.P3.val = 3486998266802970665 := by unfold bn254_mont.P3; rfl
@[simp] theorem INV_val : bn254_mont.INV.val = 14042775128853446655 := by
  unfold bn254_mont.INV; rfl
@[simp] theorem R2_0_val : bn254_mont.R2_0.val = 1997599621687373223 := by
  unfold bn254_mont.R2_0; rfl
@[simp] theorem R2_1_val : bn254_mont.R2_1.val = 6052339484930628067 := by
  unfold bn254_mont.R2_1; rfl
@[simp] theorem R2_2_val : bn254_mont.R2_2.val = 10108755138030829701 := by
  unfold bn254_mont.R2_2; rfl
@[simp] theorem R2_3_val : bn254_mont.R2_3.val = 150537098327114917 := by
  unfold bn254_mont.R2_3; rfl

/-! ### Conditional subtraction -/

/-- `reduce_once t` subtracts `p` once when `t ≥ p`: for `t < 2p` it returns `t mod p`. -/
theorem reduce_once_spec (t : Array U64 4#usize) (ht : val4 t < 2 * P) :
    bn254_mont.reduce_once t ⦃ r => val4 r < P ∧ val4 r = val4 t % P ⦄ := by
  unfold bn254_mont.reduce_once
  step*
  · have hb : b3.val = 0 := by simp_all
    simp only [val4_make]
    simp only [val4, P] at ht ⊢
    simp only [P0_val, P1_val, P2_val, P3_val] at *
    subst_vars
    omega
  · rename_i hne
    have hb : b3.val = 1 := by
      have : b3.val ≠ 0 := fun h => hne (by scalar_tac)
      omega
    simp only [val4, P] at ht ⊢
    simp only [P0_val, P1_val, P2_val, P3_val] at *
    have := U64.lt_succ_max d0; have := U64.lt_succ_max d1; have := U64.lt_succ_max d2
    have := U64.lt_succ_max d3
    subst_vars
    omega

/-! ### One CIOS row -/

/-- The arithmetic of one CIOS row on natural numbers. The four multiply-accumulates of
`t + a·b` (equations `e0`–`e3`) and of the reduction by `m·p` (`f0`–`f3`, where `f0` says the
low limb is cleared) give `2^64 · t' = t + a·b + m·p`; for `t < 2p` and `a·b ≤ (p-1)(2^64-1)`
the new accumulator `t'` is below `2p`. -/
theorem row_arith
    (t0 t1 t2 t3 ab0 ab1 ab2 ab3 r0 r1 r2 r3 r4 c c1 c2 m c3 s0 s1 s2 c4 c5 c6 : ℕ)
    (hT : t0 + W1 * t1 + W2 * t2 + W3 * t3 < 2 * PN)
    (hAB : ab0 + W1 * ab1 + W2 * ab2 + W3 * ab3 ≤ (PN - 1) * (W1 - 1))
    (e0 : r0 + W1 * c = t0 + ab0) (e1 : r1 + W1 * c1 = t1 + ab1 + c)
    (e2 : r2 + W1 * c2 = t2 + ab2 + c1) (e3 : r3 + W1 * r4 = t3 + ab3 + c2)
    (hmB : m < W1)
    (f0 : W1 * c3 = r0 + m * 4891460686036598785)
    (f1 : s0 + W1 * c4 = r1 + m * 2896914383306846353 + c3)
    (f2 : s1 + W1 * c5 = r2 + m * 13281191951274694749 + c4)
    (f3 : s2 + W1 * c6 = r3 + m * 3486998266802970665 + c5) :
    W1 * (s0 + W1 * s1 + W2 * s2 + W3 * (r4 + c6)) =
        (t0 + W1 * t1 + W2 * t2 + W3 * t3) + (ab0 + W1 * ab1 + W2 * ab2 + W3 * ab3)
          + m * PN ∧
      s0 + W1 * s1 + W2 * s2 + W3 * (r4 + c6) < 2 * PN := by
  omega

/-- The first multiply-accumulate of the reduction clears the low limb: with
`m = r0 · INV mod 2^64` and `INV · P0 ≡ -1 (mod 2^64)`, `r0 + m · P0` is a multiple of `2^64`.
(The Rust code discards that low limb; this specification states only the carry.) -/
theorem mac_clear_spec (r0 m : U64) (hm : m = core.num.U64.wrapping_mul r0 bn254_mont.INV) :
    bn254_mont.mac r0 m bn254_mont.P0 0#u64 ⦃ r =>
      W1 * r.2.val = r0.val + m.val * 4891460686036598785 ⦄ := by
  apply spec_mono (mac_spec r0 m bn254_mont.P0 0#u64)
  rintro ⟨lo, hi⟩ h
  dsimp only at h ⊢
  have hm' : r0.val * 14042775128853446655 =
      m.val + W1 * (r0.val * 14042775128853446655 / W1) := by
    rw [hm, core.num.U64.wrapping_mul_val_eq, INV_val]
    simp only [UScalar.size, UScalarTy.numBits]
    omega
  have := U64.lt_succ_max lo
  simp only [P0_val, Nat.reducePow] at h
  have h0 : (0#u64 : U64).val = 0 := by simp
  omega

/-- One CIOS row: for `t < 2p` and `a < p`, `mont_row t a b` returns `t'` with
`2^64 · t' = t + a·b + m·p` for some `m`, and `t' < 2p`. -/
theorem mont_row_spec (t a : Array U64 4#usize) (b : U64) (ht : val4 t < 2 * P)
    (ha : val4 a < P) :
    bn254_mont.mont_row t a b ⦃ r => val4 r < 2 * P ∧
      ∃ m : ℕ, 2^64 * val4 r = val4 t + val4 a * b.val + m * P ⦄ := by
  unfold bn254_mont.mont_row
  step as ⟨t0, ht0⟩
  step as ⟨a0, ha0⟩
  step as ⟨r0, c0, e0⟩
  step as ⟨t1, ht1⟩
  step as ⟨a1, ha1⟩
  step as ⟨r1, c1, e1⟩
  step as ⟨t2, ht2⟩
  step as ⟨a2, ha2⟩
  step as ⟨r2, c2, e2⟩
  step as ⟨t3, ht3⟩
  step as ⟨a3, ha3⟩
  step as ⟨r3, r4, e3⟩
  step as ⟨m, hm⟩
  step with mac_clear_spec as ⟨x, c3, f0⟩
  step as ⟨s0, c4, f1⟩
  step as ⟨s1, c5, f2⟩
  step as ⟨s2, c6, f3⟩
  have hvt : val4 t = t0.val + W1 * t1.val + W2 * t2.val + W3 * t3.val := by
    simp only [val4, Nat.reducePow]; rw [ht0, ht1, ht2, ht3]
  have hva : val4 a = a0.val + W1 * a1.val + W2 * a2.val + W3 * a3.val := by
    simp only [val4, Nat.reducePow]; rw [ha0, ha1, ha2, ha3]
  have hT : t0.val + W1 * t1.val + W2 * t2.val + W3 * t3.val < 2 * PN := by
    rw [← hvt]; exact ht
  have hA : (a0.val + W1 * a1.val + W2 * a2.val + W3 * a3.val) * b.val ≤ (PN - 1) * (W1 - 1) := by
    apply Nat.mul_le_mul
    · rw [← hva]; simp only [P] at ha; omega
    · have := U64.lt_succ_max b; omega
  simp only [P1_val, P2_val, P3_val, Nat.add_zero, Nat.reducePow] at e0 e1 e2 e3 f1 f2 f3
  simp only [Nat.add_mul, Nat.mul_assoc] at hA
  obtain ⟨key, hlt⟩ := row_arith t0.val t1.val t2.val t3.val (a0.val * b.val) (a1.val * b.val)
    (a2.val * b.val) (a3.val * b.val) r0.val r1.val r2.val r3.val r4.val c0.val c1.val c2.val
    m.val c3.val s0.val s1.val s2.val c4.val c5.val c6.val hT hA e0 e1 e2 e3 (U64.lt_succ_max m)
    f0 f1 f2 f3
  -- The last limb `r4 + c6` does not overflow, because the row result is below `2p < 2^255`.
  have hs : r4.val + c6.val < W1 := by omega
  step as ⟨s3, hs3⟩
  refine ⟨?_, m.val, ?_⟩
  · simp only [val4_make, P, Nat.reducePow]
    rw [hs3]
    omega
  · simp only [val4_make, Nat.reducePow]
    rw [hvt, hva, hs3, P]
    zify at key ⊢
    linear_combination key

/-! ### Multiplication, addition, subtraction, conversions (natural-number statements) -/

/-- Montgomery multiplication: for `a < p` and any `b`, `mul a b` returns `r < p` with
`2^256 · r ≡ a · b (mod p)`. -/
theorem mul_spec (a b : Array U64 4#usize) (ha : val4 a < P) :
    bn254_mont.mul a b ⦃ r =>
      val4 r < P ∧ (2^256 * val4 r) % P = (val4 a * val4 b) % P ⦄ := by
  have hz : val4 (Array.repeat 4#usize 0#u64) < 2 * P := by rw [val4_repeat_zero]; simp [P]
  unfold bn254_mont.mul
  step as ⟨b0, hb0⟩
  step with mont_row_spec as ⟨T1, h1, m1, e1⟩
  step as ⟨b1, hb1⟩
  step with mont_row_spec as ⟨T2, h2, m2, e2⟩
  step as ⟨b2, hb2⟩
  step with mont_row_spec as ⟨T3, h3, m3, e3⟩
  step as ⟨b3, hb3⟩
  step with mont_row_spec as ⟨T4, h4, m4, e4⟩
  apply spec_mono (reduce_once_spec T4 h4)
  rintro r ⟨hr, hrv⟩
  refine ⟨hr, ?_⟩
  have hvb : val4 b = b0.val + 2^64 * b1.val + 2^128 * b2.val + 2^192 * b3.val := by
    simp only [val4]; rw [hb0, hb1, hb2, hb3]
  rw [val4_repeat_zero] at e1
  have key : 2^256 * val4 T4 =
      val4 a * val4 b + P * (m1 + 2^64 * m2 + 2^128 * m3 + 2^192 * m4) := by
    rw [hvb]
    zify at e1 e2 e3 e4 ⊢
    linear_combination 2^192 * e4 + 2^128 * e3 + 2^64 * e2 + e1
  rw [hrv, Nat.mul_mod, Nat.mod_mod, ← Nat.mul_mod, key, Nat.add_mul_mod_self_left]

/-- Addition: for `a, b < p`, `add a b` returns `(a + b) mod p`. -/
theorem add_spec (a b : Array U64 4#usize) (ha : val4 a < P) (hb : val4 b < P) :
    bn254_mont.add a b ⦃ r => val4 r < P ∧ val4 r = (val4 a + val4 b) % P ⦄ := by
  unfold bn254_mont.add
  step as ⟨a0, ha0⟩
  step as ⟨b0, hb0⟩
  step as ⟨s0, c0, e0⟩
  step as ⟨a1, ha1⟩
  step as ⟨b1, hb1⟩
  step as ⟨s1, c1, e1⟩
  step as ⟨a2, ha2⟩
  step as ⟨b2, hb2⟩
  step as ⟨s2, c2, e2⟩
  step as ⟨a3, ha3⟩
  step as ⟨b3, hb3⟩
  step with adc_lo_spec as ⟨s3, c3, e3⟩
  have hab : val4 a + val4 b = a0.val + b0.val + W1 * (a1.val + b1.val)
      + W2 * (a2.val + b2.val) + W3 * (a3.val + b3.val) := by
    simp only [val4, Nat.reducePow]; rw [ha0, ha1, ha2, ha3, hb0, hb1, hb2, hb3]; ring
  -- `a + b < 2p < 2^256`, so the dropped carry is zero.
  have hsum : val4 (Array.make 4#usize [s0, s1, s2, s3] (by simp)) = val4 a + val4 b := by
    simp only [val4_make, Nat.reducePow]
    simp only [P] at ha hb
    simp only [Nat.reducePow] at e0 e1 e2
    have h0 : (0#u64 : U64).val = 0 := by simp
    omega
  apply spec_mono (reduce_once_spec _ (by rw [hsum]; omega))
  rintro r ⟨hr, hrv⟩
  exact ⟨hr, hrv.trans (by rw [hsum])⟩

/-- Subtraction: for `a, b < p`, `sub a b` returns `(a + p - b) mod p`, that is `a - b` when
`a ≥ b` and `a + p - b` otherwise. -/
theorem sub_spec (a b : Array U64 4#usize) (ha : val4 a < P) (hb : val4 b < P) :
    bn254_mont.sub a b ⦃ r => val4 r < P ∧ val4 r = (val4 a + P - val4 b) % P ⦄ := by
  have hva : val4 a = (a.val[0]'(by simp)).val + W1 * (a.val[1]'(by simp)).val
      + W2 * (a.val[2]'(by simp)).val + W3 * (a.val[3]'(by simp)).val := by
    simp only [val4, Nat.reducePow]
  have hvb : val4 b = (b.val[0]'(by simp)).val + W1 * (b.val[1]'(by simp)).val
      + W2 * (b.val[2]'(by simp)).val + W3 * (b.val[3]'(by simp)).val := by
    simp only [val4, Nat.reducePow]
  have h0 : (0#u64 : U64).val = 0 := by simp
  simp only [P] at ha hb ⊢
  unfold bn254_mont.sub
  step as ⟨a0, ha0⟩
  step as ⟨b0, hb0⟩
  step as ⟨d0, br0, hbr0, e0⟩
  step as ⟨a1, ha1⟩
  step as ⟨b1, hb1⟩
  step as ⟨d1, br1, hbr1, e1⟩
  step as ⟨a2, ha2⟩
  step as ⟨b2, hb2⟩
  step as ⟨d2, br2, hbr2, e2⟩
  step as ⟨a3, ha3⟩
  step as ⟨b3, hb3⟩
  step as ⟨d3, br3, hbr3, e3⟩
  subst ha0 ha1 ha2 ha3 hb0 hb1 hb2 hb3
  simp only [Nat.reducePow] at e0 e1 e2 e3
  split
  · -- no borrow: `a ≥ b` and the limbs hold `a - b`
    rename_i hz
    have hz' : br3.val = 0 := by simp [hz]
    simp only [spec_ok, val4_make, Nat.reducePow]
    have hD : (d0.val + W1 * d1.val + W2 * d2.val + W3 * d3.val) + val4 b = val4 a := by
      rw [hva, hvb]; omega
    have hsub : (val4 a + PN - val4 b) % PN = val4 a - val4 b := by
      rw [show val4 a + PN - val4 b = (val4 a - val4 b) + PN by omega, Nat.add_mod_right,
        Nat.mod_eq_of_lt (by omega)]
    rw [hsub]
    omega
  · -- borrow: the limbs hold `a - b + 2^256`, and adding `p` with the carry dropped gives
    -- `a + p - b`
    rename_i hne
    have hb1' : br3.val = 1 := by
      have : br3.val ≠ 0 := fun h => hne (by scalar_tac)
      omega
    step as ⟨s0, c0, f0⟩
    step as ⟨s1, c1, f1⟩
    step as ⟨s2, c2, f2⟩
    step with adc_lo_spec as ⟨s3, c3, f3⟩
    simp only [val4_make, Nat.reducePow]
    simp only [P0_val, P1_val, P2_val, P3_val, Nat.reducePow] at f0 f1 f2 f3
    have := U64.lt_succ_max d0; have := U64.lt_succ_max d1; have := U64.lt_succ_max d2
    have := U64.lt_succ_max d3
    have hD : (d0.val + W1 * d1.val + W2 * d2.val + W3 * d3.val) + val4 b = val4 a + W4 := by
      rw [hva, hvb]; omega
    have hsub : (val4 a + PN - val4 b) % PN = val4 a + PN - val4 b := by
      apply Nat.mod_eq_of_lt; omega
    rw [hsub]
    have hS : s0.val + W1 * s1.val + W2 * s2.val
        + W3 * ((d3.val + 3486998266802970665 + c2.val) % W1) + W4 =
        (d0.val + W1 * d1.val + W2 * d2.val + W3 * d3.val) + PN := by
      have := U64.lt_succ_max s0; have := U64.lt_succ_max s1; have := U64.lt_succ_max s2
      clear hva hvb hsub
      omega
    rw [f3]
    omega

/-- Entering Montgomery form: for any `x`, `to_mont x` returns `r < p` with
`2^256 · r ≡ 2^256 · 2^256 · x (mod p)`. -/
theorem to_mont_spec (x : Array U64 4#usize) :
    bn254_mont.to_mont x ⦃ r =>
      val4 r < P ∧ (2^256 * val4 r) % P = (2^256 * 2^256 * val4 x) % P ⦄ := by
  unfold bn254_mont.to_mont
  have hR : val4 (Array.make 4#usize [bn254_mont.R2_0, bn254_mont.R2_1, bn254_mont.R2_2,
      bn254_mont.R2_3] (by simp)) = 2^256 * 2^256 % P := by
    simp only [val4_make, R2_0_val, R2_1_val, R2_2_val, R2_3_val, P]; norm_num
  apply spec_mono (mul_spec _ x (by rw [hR]; exact Nat.mod_lt _ (by simp [P])))
  rintro r ⟨hr, hrv⟩
  refine ⟨hr, ?_⟩
  rw [hrv, hR, Nat.mod_mul_mod]

/-- Leaving Montgomery form: for any `x`, `from_mont x` returns `r < p` with
`2^256 · r ≡ x (mod p)`. -/
theorem from_mont_spec (x : Array U64 4#usize) :
    bn254_mont.from_mont x ⦃ r => val4 r < P ∧ (2^256 * val4 r) % P = val4 x % P ⦄ := by
  unfold bn254_mont.from_mont
  have h1 : val4 (Array.make 4#usize [1#u64, 0#u64, 0#u64, 0#u64] (by simp)) = 1 := by
    simp [val4_make]
  apply spec_mono (mul_spec _ x (by rw [h1]; simp [P]))
  rintro r ⟨hr, hrv⟩
  exact ⟨hr, by rw [hrv, h1, Nat.one_mul]⟩

/-! ### Montgomery decoding into `Poseidon2.BN254.F` -/

/-- `R⁻¹ mod p` for `R = 2^256`, as a natural number (`Rinv_spec`). -/
def Rinv : ℕ := 9915499612839321149637521777990102151350674507940716049588462388200839649614

theorem Rinv_spec : 2^256 * Rinv % modulus = 1 := by
  simp only [Rinv, modulus]; norm_num

/-- The field element that the limbs `x` represent in Montgomery form: `val4 x · R⁻¹`. -/
def toField (x : Array U64 4#usize) : F := (val4 x : F) * ((2 : F)^256)⁻¹

theorem natCast_eq_iff (u v : ℕ) : (u : F) = (v : F) ↔ u % P = v % P :=
  ZMod.natCast_eq_natCast_iff' u v modulus

theorem natCast_P : ((P : ℕ) : F) = 0 := ZMod.natCast_self modulus

theorem two_pow_ne_zero : (2 : F)^256 ≠ 0 := by
  apply pow_ne_zero
  intro h
  have : ((2 : ℕ) : F) = ((0 : ℕ) : F) := by simpa using h
  rw [natCast_eq_iff] at this
  simp [P] at this

theorem Rinv_cast : ((Rinv : ℕ) : F) = ((2 : F)^256)⁻¹ := by
  apply eq_inv_of_mul_eq_one_left
  have : ((Rinv * 2^256 : ℕ) : F) = ((1 : ℕ) : F) := by
    rw [natCast_eq_iff, Nat.mul_comm]; exact Rinv_spec
  rwa [Nat.cast_mul, Nat.cast_pow, Nat.cast_ofNat, Nat.cast_one] at this

/-- From the Montgomery relation `2^256 · r ≡ u (mod p)` to the field: `r = u · R⁻¹`. -/
theorem field_of_mont (r u : ℕ) (h : (2^256 * r) % P = u % P) :
    (r : F) = (u : F) * ((2 : F)^256)⁻¹ := by
  have h' : ((2^256 * r : ℕ) : F) = (u : F) := (natCast_eq_iff _ _).mpr h
  rw [Nat.cast_mul, Nat.cast_pow, Nat.cast_ofNat] at h'
  rw [← h', mul_comm, inv_mul_cancel_left₀ two_pow_ne_zero]

/-! ### Main theorems -/

/-- The Rust `mul` never panics on `a < p` (and any `b`), and returns the canonical
representative of `a · b · R⁻¹ mod p`, which represents the product `toField a * toField b`. -/
theorem bn254_mont_mul_refines (a b : Array U64 4#usize) (ha : val4 a < modulus) :
    bn254_mont.mul a b ⦃ r => val4 r < modulus ∧ val4 r = val4 a * val4 b * Rinv % modulus ∧
      toField r = toField a * toField b ⦄ := by
  apply spec_mono (mul_spec a b ha)
  rintro r ⟨hr, hrv⟩
  have hf := field_of_mont _ _ hrv
  rw [Nat.cast_mul] at hf
  refine ⟨hr, ?_, ?_⟩
  · rw [← Nat.mod_eq_of_lt hr, ← P_eq, ← natCast_eq_iff, Nat.cast_mul, Nat.cast_mul, hf,
      Rinv_cast]
  · simp only [toField, hf]; ring

/-- The Rust `add` never panics on `a, b < p`, and returns the canonical representative of
`a + b mod p`, which represents `toField a + toField b`. -/
theorem bn254_mont_add_refines (a b : Array U64 4#usize) (ha : val4 a < modulus)
    (hb : val4 b < modulus) :
    bn254_mont.add a b ⦃ r => val4 r < modulus ∧ val4 r = (val4 a + val4 b) % modulus ∧
      toField r = toField a + toField b ⦄ := by
  apply spec_mono (add_spec a b ha hb)
  rintro r ⟨hr, hrv⟩
  refine ⟨hr, hrv, ?_⟩
  have : (val4 r : F) = ((val4 a + val4 b : ℕ) : F) := by
    rw [natCast_eq_iff, hrv, Nat.mod_mod]
  rw [Nat.cast_add] at this
  simp only [toField, this]; ring

/-- The Rust `sub` never panics on `a, b < p`, and returns the canonical representative of
`a - b mod p`, which represents `toField a - toField b`. -/
theorem bn254_mont_sub_refines (a b : Array U64 4#usize) (ha : val4 a < modulus)
    (hb : val4 b < modulus) :
    bn254_mont.sub a b ⦃ r => val4 r < modulus ∧
      val4 r = (val4 a + modulus - val4 b) % modulus ∧ toField r = toField a - toField b ⦄ := by
  apply spec_mono (sub_spec a b ha hb)
  rintro r ⟨hr, hrv⟩
  refine ⟨hr, hrv, ?_⟩
  have : (val4 r : F) = ((val4 a + P - val4 b : ℕ) : F) := by
    rw [natCast_eq_iff, hrv, Nat.mod_mod]
  rw [Nat.cast_sub (by rw [P_eq]; omega), Nat.cast_add, natCast_P, add_zero] at this
  simp only [toField, this]; ring

/-- The Rust `to_mont` never panics, and returns the canonical representative of
`x · R mod p` for any 256-bit `x`; it represents `x` read in the field. -/
theorem bn254_mont_to_mont_refines (x : Array U64 4#usize) :
    bn254_mont.to_mont x ⦃ r => val4 r < modulus ∧ val4 r = val4 x * 2^256 % modulus ∧
      toField r = (val4 x : F) ⦄ := by
  apply spec_mono (to_mont_spec x)
  rintro r ⟨hr, hrv⟩
  have hf := field_of_mont _ _ hrv
  rw [Nat.cast_mul, Nat.cast_mul, Nat.cast_pow, Nat.cast_ofNat] at hf
  have h2 := two_pow_ne_zero
  have hr' : (val4 r : F) = (val4 x : F) * (2 : F)^256 := by
    rw [hf]
    generalize (2 : F)^256 = R at h2 ⊢
    field_simp
  refine ⟨hr, ?_, ?_⟩
  · rw [← Nat.mod_eq_of_lt hr, ← P_eq, ← natCast_eq_iff, hr', Nat.cast_mul, Nat.cast_pow,
      Nat.cast_ofNat]
  · rw [toField, hr']
    generalize (2 : F)^256 = R at h2 ⊢
    field_simp

/-- The Rust `from_mont` never panics, and returns the canonical representative of
`x · R⁻¹ mod p` for any 256-bit `x`, the integer that `x` represents in Montgomery form. -/
theorem bn254_mont_from_mont_refines (x : Array U64 4#usize) :
    bn254_mont.from_mont x ⦃ r => val4 r < modulus ∧ val4 r = val4 x * Rinv % modulus ∧
      (val4 r : F) = toField x ⦄ := by
  apply spec_mono (from_mont_spec x)
  rintro r ⟨hr, hrv⟩
  have hf := field_of_mont _ _ hrv
  refine ⟨hr, ?_, hf⟩
  rw [← Nat.mod_eq_of_lt hr, ← P_eq, ← natCast_eq_iff, hf, Nat.cast_mul, Rinv_cast]

/-! ### The same facts as equations -/

/-- Aeneas's total-correctness predicate is "returns `ok v` for some `v` satisfying `p`" (as
`spec_iff_exists_ok` in `Refinement/AesLike.lean`, restated to keep this file independent). -/
private theorem exists_ok_of_spec {α : Type} (m : Result α) (p : α → Prop)
    (h : m ⦃ v => p v ⦄) : ∃ v, m = ok v ∧ p v := by
  cases m <;> simp_all

theorem bn254_mont_mul_eq (a b : Array U64 4#usize) (ha : val4 a < modulus) :
    ∃ r, bn254_mont.mul a b = ok r ∧ val4 r < modulus ∧
      val4 r = val4 a * val4 b * Rinv % modulus ∧ toField r = toField a * toField b :=
  exists_ok_of_spec _ _ (bn254_mont_mul_refines a b ha)

theorem bn254_mont_add_eq (a b : Array U64 4#usize) (ha : val4 a < modulus)
    (hb : val4 b < modulus) :
    ∃ r, bn254_mont.add a b = ok r ∧ val4 r < modulus ∧
      val4 r = (val4 a + val4 b) % modulus ∧ toField r = toField a + toField b :=
  exists_ok_of_spec _ _ (bn254_mont_add_refines a b ha hb)

theorem bn254_mont_sub_eq (a b : Array U64 4#usize) (ha : val4 a < modulus)
    (hb : val4 b < modulus) :
    ∃ r, bn254_mont.sub a b = ok r ∧ val4 r < modulus ∧
      val4 r = (val4 a + modulus - val4 b) % modulus ∧ toField r = toField a - toField b :=
  exists_ok_of_spec _ _ (bn254_mont_sub_refines a b ha hb)

/-- On canonical limbs (below `p`), the Montgomery decoding is injective, so the field
equations above determine the Rust results. -/
theorem toField_injective (x y : Array U64 4#usize) (hx : val4 x < modulus)
    (hy : val4 y < modulus) (h : toField x = toField y) : val4 x = val4 y := by
  have h' : (val4 x : F) = (val4 y : F) :=
    mul_right_cancel₀ (inv_ne_zero two_pow_ne_zero) h
  rw [natCast_eq_iff, P_eq, Nat.mod_eq_of_lt hx, Nat.mod_eq_of_lt hy] at h'
  exact h'

end Cryptificate.Refinement.BN254Mont
