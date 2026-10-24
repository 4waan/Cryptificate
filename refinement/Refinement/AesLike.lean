/-
Copyright (c) Cryptificate contributors. Released under the MIT license.
-/
import Extracted.CryptificateKernels
import Refinement.GF256
import Cryptificate.Bridge

/-!
# Refinement of the parametric AES-like round

`crates/kernels/src/aes_like.rs` implements one AES-like round, and `rounds` of them, with the
design as runtime data: the mixing matrix, the row offsets, the S-box table and the round
keys are arguments. Aeneas translates it (`Extracted.CryptificateKernels`, namespace
`cryptificate_kernels.aes_like`); this file proves that the translation computes the execution
model of the main Lean package, `Cryptificate.aesLikeRound` and `Cryptificate.aesLikeExec`
(`lean/Cryptificate/Bridge.lean`, compiled here from the same source file), over WideTrail's
field `GF256`.

Because the design is an argument, the theorems hold for every matrix, every offset vector,
every S-box table and every key schedule at once: one proof covers every submitted design.

## Reading Rust data as the model's data

* `stateOf s p = toField s[p]`: the 16-byte array as a state `Fin 16 → GF256`; byte `p` holds
  row `p % 4`, column `p / 4` in both (`Cryptificate.bytePos r c = 4 * c + r`);
* `matrixOf m r j = toField m[4 * r + j]`: the row-major matrix;
* `offsetsOf o r = o[r] mod 4`: the Rust code reduces offsets modulo 4, so every byte value is
  accepted; for offsets below 4 this is the offset itself;
* `sboxOf t x = toField t[x]`: the S-box table as a map on field elements;
* `keysOf ks n = stateOf ks[n]`: the round keys.

## Main results

* `aes_like_round_refines`: `aes_like.round` never panics and returns a state whose reading is
  `aesLikeRound (matrixOf m) (offsetsOf o) (sboxOf t) (stateOf k) (stateOf s)`;
* `aes_like_encrypt_refines`: with at least `rounds` round keys, `aes_like.encrypt` never panics
  and returns `aesLikeExec … (keysOf ks) (stateOf s) rounds`.

Both are stated with Aeneas's total-correctness predicate `m ⦃ v => P v ⦄` (`WP.spec`): `m`
terminates normally, without a panic, with a value `v` satisfying `P`. `spec_iff_ok` turns it into
an equation `m = ok v`.
-/

set_option autoImplicit false

open Aeneas Aeneas.Std Result ControlFlow
open Aeneas.Std.WP
open cryptificate_kernels

namespace Cryptificate.Refinement

/-! ### Specifications of the field kernels, in the form `step` uses -/

@[step]
theorem gf256_add_spec (a b : U8) : gf256.add a b ⦃ c => c = a ^^^ b ⦄ := by
  rw [gf256_add_refines]; simp only [spec_ok]; rfl

@[step]
theorem gf256_mul_spec (a b : U8) :
    gf256.mul a b ⦃ c => c = ofField (toField a * toField b) ⦄ := by
  rw [gf256_mul_field]; simp only [spec_ok]

theorem toField_xor (a b : U8) : toField (a ^^^ b) = toField a + toField b := rfl

/-! ### Reading Rust data -/

/-- A 16-byte array as a state of field elements: byte `p` is `toField s[p]`. -/
def stateOf (s : Std.Array U8 16#usize) : Fin 16 → GF256 := fun p => toField s[p.val]!

/-- The row-major matrix: entry `(r, j)` is byte `4 * r + j`. -/
def matrixOf (m : Std.Array U8 16#usize) : Matrix (Fin 4) (Fin 4) GF256 :=
  fun r j => toField m[4 * r.val + j.val]!

/-- The row offsets, reduced modulo 4 as the Rust code does. -/
def offsetsOf (o : Std.Array U8 4#usize) : Fin 4 → Fin 4 :=
  fun r => ⟨o[r.val]!.val % 4, Nat.mod_lt _ (by norm_num)⟩

/-- The S-box table as a map on field elements. -/
def sboxOf (t : Std.Array U8 256#usize) : GF256 → GF256 := fun x => toField t[x.val.toNat]!

/-- The round keys: key `n` is `stateOf ks[n]`. -/
def keysOf (ks : Slice (Std.Array U8 16#usize)) : ℕ → Fin 16 → GF256 := fun n => stateOf ks[n]!

theorem offsetsOf_of_lt (o : Std.Array U8 4#usize) (r : Fin 4) (h : o[r.val]!.val < 4) :
    (offsetsOf o r).val = o[r.val]!.val := Nat.mod_eq_of_lt h

/-! ### Loops that rewrite a 16-byte array position by position

The four stages of a round are each one `while` loop over `i = 0, …, 15` that writes position
`i` of the state and nothing else. `MapStep G` describes one iteration of such a loop, where
`G j x` is the byte written at position `j` when the state holds `x` there; `map_loop` turns it
into the effect of the whole loop. -/

/-- One iteration writes `G i s[i]` at position `i` and moves to `i + 1`, or stops at `16`. -/
def MapStep (G : ℕ → U8 → U8) (s : Std.Array U8 16#usize) (i : Usize)
    (r : ControlFlow (Std.Array U8 16#usize × Usize) (Std.Array U8 16#usize)) : Prop :=
  match r with
  | .cont (s', i') => i.val < 16 ∧ i'.val = i.val + 1 ∧ s' = s.set i (G i.val s[i.val]!)
  | .done s' => 16 ≤ i.val ∧ s' = s

theorem map_loop
    (body : Std.Array U8 16#usize × Usize →
      Result (ControlFlow (Std.Array U8 16#usize × Usize) (Std.Array U8 16#usize)))
    (G : ℕ → U8 → U8) (hbody : ∀ s i, body (s, i) ⦃ r => MapStep G s i r ⦄)
    (s : Std.Array U8 16#usize) (i : Usize) (hi : i.val ≤ 16) :
    loop body (s, i) ⦃ s' => ∀ j < 16, s'[j]! = if j < i.val then s[j]! else G j s[j]! ⦄ := by
  apply loop.spec_decr_nat (fun x => 16 - x.2.val)
    (fun x => i.val ≤ x.2.val ∧ x.2.val ≤ 16 ∧ ∀ j < 16,
      x.1[j]! = if j < i.val then s[j]! else if j < x.2.val then G j s[j]! else s[j]!)
  · rintro ⟨t, k⟩ ⟨hik, hk, ht⟩
    dsimp only at hik hk ht ⊢
    apply spec_mono (hbody t k)
    intro r hr
    cases r with
    | cont x =>
      obtain ⟨t', k'⟩ := x
      obtain ⟨hk16, hk', rfl⟩ := hr
      dsimp only
      refine ⟨⟨by omega, by omega, ?_⟩, by omega⟩
      intro j hj
      by_cases hjk : j = k.val
      · subst hjk
        rw [Array.getElem!_Nat_set_eq _ _ _ _ ⟨rfl, by simp; omega⟩, ht k.val hk16]
        simp only [show ¬ k.val < i.val by omega, show ¬ k.val < k.val by omega, ↓reduceIte,
          show k.val < k'.val by omega]
      · rw [Array.getElem!_Nat_set_ne _ _ _ _ (Ne.symm hjk), ht j hj]
        by_cases hji : j < i.val
        · simp only [hji, ↓reduceIte]
        · simp only [hji, ↓reduceIte]
          by_cases hjk' : j < k.val
          · simp only [hjk', ↓reduceIte, show j < k'.val by omega]
          · simp only [hjk', ↓reduceIte, show ¬ j < k'.val by omega]
    | done x =>
      obtain ⟨hk16, rfl⟩ := hr
      intro j hj
      rw [ht j hj]
      by_cases hji : j < i.val
      · simp only [hji, ↓reduceIte]
      · simp only [hji, ↓reduceIte, show j < k.val by omega]
  · refine ⟨le_rfl, hi, fun j _ => ?_⟩
    by_cases hji : j < i.val
    · simp only [hji, ↓reduceIte]
    · simp only [hji, ↓reduceIte]

/-- The effect of a loop started at `0`: every position is rewritten. -/
theorem map_loop_zero
    (body : Std.Array U8 16#usize × Usize →
      Result (ControlFlow (Std.Array U8 16#usize × Usize) (Std.Array U8 16#usize)))
    (G : ℕ → U8 → U8) (hbody : ∀ s i, body (s, i) ⦃ r => MapStep G s i r ⦄)
    (s : Std.Array U8 16#usize) :
    loop body (s, 0#usize) ⦃ s' => ∀ j < 16, s'[j]! = G j s[j]! ⦄ := by
  apply spec_mono (map_loop body G hbody s 0#usize (by simp))
  intro s' h j hj
  rw [h j hj]
  simp

/-! ### The four stages -/

private theorem getElem!_eq_getElem {n : Usize} (s : Std.Array U8 n) (i : Usize)
    (h : i.val < s.length) : s[i.val]! = s.val[i.val] := by
  rw [Array.getElem!_Nat_eq, List.getElem!_eq_getElem?_getD, List.getElem?_eq_getElem h]
  rfl

private theorem val_getElem {n : Usize} (s : Std.Array U8 n) (k : ℕ) (h : k < s.val.length) :
    s.val[k] = s[k]! := by
  rw [Array.getElem!_Nat_eq, List.getElem!_eq_getElem?_getD, List.getElem?_eq_getElem h]
  rfl

theorem add_round_key_spec (s key : Std.Array U8 16#usize) :
    aes_like.add_round_key s key ⦃ s' => ∀ j < 16, s'[j]! = s[j]! ^^^ key[j]! ⦄ := by
  unfold aes_like.add_round_key aes_like.add_round_key_loop
  apply map_loop_zero _ (fun j x => x ^^^ key[j]!)
  intro t i
  simp only [aes_like.add_round_key_loop.body]
  split
  · step as ⟨ a, ha ⟩
    step as ⟨ b, hb ⟩
    step as ⟨ c, hc ⟩
    step as ⟨ d, hd ⟩
    step as ⟨ e, he ⟩
    refine ⟨by scalar_tac, he, ?_⟩
    subst_vars
    simp only []
    rw [getElem!_eq_getElem t i (by scalar_tac), getElem!_eq_getElem key i (by scalar_tac)]
  · simp only [spec_ok, MapStep, and_true]
    scalar_tac

theorem sub_bytes_spec (s : Std.Array U8 16#usize) (t : Std.Array U8 256#usize) :
    aes_like.sub_bytes s t ⦃ s' => ∀ j < 16, s'[j]! = t[s[j]!.val]! ⦄ := by
  unfold aes_like.sub_bytes aes_like.sub_bytes_loop
  apply map_loop_zero _ (fun _ x => t[x.val]!)
  intro u i
  simp only [aes_like.sub_bytes_loop.body]
  split
  · step as ⟨ a, ha ⟩
    step as ⟨ b, hb ⟩
    step as ⟨ c, hc ⟩
    step as ⟨ d, hd ⟩
    step as ⟨ e, he ⟩
    refine ⟨by scalar_tac, he, ?_⟩
    subst_vars
    simp only []
    rw [val_getElem t, val_getElem u]
    simp only [U8.cast_Usize_val_eq]
  · simp only [spec_ok, MapStep, and_true]
    scalar_tac

/-- The byte that shift rows moves to position `j`: row `j % 4`, column `j / 4` of the output
is row `j % 4`, column `(j / 4 + offsets[j % 4]) % 4` of the input. -/
def shiftSource (o : Std.Array U8 4#usize) (j : ℕ) : ℕ :=
  4 * ((j / 4 + o[j % 4]!.val) % 4) + j % 4

theorem shiftSource_lt (o : Std.Array U8 4#usize) (j : ℕ) : shiftSource o j < 16 := by
  unfold shiftSource; omega

theorem shift_rows_spec (s : Std.Array U8 16#usize) (o : Std.Array U8 4#usize) :
    aes_like.shift_rows s o ⦃ s' => ∀ j < 16, s'[j]! = s[shiftSource o j]! ⦄ := by
  unfold aes_like.shift_rows aes_like.shift_rows_loop
  apply map_loop_zero _ (fun j _ => s[shiftSource o j]!)
  intro u i
  simp only [aes_like.shift_rows_loop.body]
  split
  · step as ⟨ r, hr ⟩
    step as ⟨ c, hc ⟩
    step as ⟨ a, ha ⟩
    step as ⟨ b, hb ⟩
    step as ⟨ d, hd ⟩
    step as ⟨ e, he ⟩
    step as ⟨ f, hf ⟩
    step as ⟨ g, hg ⟩
    step as ⟨ x, hx ⟩
    step as ⟨ v, hv ⟩
    step as ⟨ w, hw ⟩
    refine ⟨by scalar_tac, hw, ?_⟩
    subst_vars
    simp only []
    rw [val_getElem s]
    rw [val_getElem o, U8.cast_Usize_val_eq, hr] at hd
    have hgv : g.val = shiftSource o i.val := by
      simp only [shiftSource, hg, hf, he, hd, hc, hr]
    rw [hgv]
  · simp only [spec_ok, MapStep, and_true]
    scalar_tac

/-- Entry `(r, c)` of `M x` for column `c` of `inp`, read in the field. -/
def mixValue (m inp : Std.Array U8 16#usize) (r c : ℕ) : GF256 :=
  ∑ k : Fin 4, toField m[4 * r + k.val]! * toField inp[4 * c + k.val]!

@[step]
theorem mix_byte_spec (m inp : Std.Array U8 16#usize) (r c : Usize) (hr : r.val < 4)
    (hc : c.val < 4) :
    aes_like.mix_byte m inp r c ⦃ v => toField v = mixValue m inp r.val c.val ⦄ := by
  unfold aes_like.mix_byte
  step*
  subst_vars
  simp only [mixValue, Fin.sum_univ_four, toField_xor, toField_ofField, val_getElem, i_post,
    i2_post, i4_post, i6_post, i8_post, i10_post, i12_post, i14_post, Fin.val_zero, Fin.val_one,
    Fin.val_two, Nat.add_zero]
  rfl

theorem mix_columns_spec (s m : Std.Array U8 16#usize) :
    aes_like.mix_columns s m ⦃ s' => ∀ j < 16, toField s'[j]! = mixValue m s (j % 4) (j / 4) ⦄ := by
  unfold aes_like.mix_columns aes_like.mix_columns_loop
  apply spec_mono (map_loop_zero _ (fun j _ => ofField (mixValue m s (j % 4) (j / 4))) ?_ s)
  · intro s' h j hj
    rw [h j hj, toField_ofField]
  intro u i
  simp only [aes_like.mix_columns_loop.body]
  split
  · step as ⟨ r, hr ⟩
    step as ⟨ c, hc ⟩
    step as ⟨ v, hv ⟩
    step as ⟨ d, hd ⟩
    step as ⟨ e, he ⟩
    refine ⟨by scalar_tac, he, ?_⟩
    subst_vars
    simp only []
    rw [← hr, ← hc, ← hv, ofField_toField]
  · simp only [spec_ok, MapStep, and_true]
    scalar_tac

/-! ### One round -/

/-- `aes_like.round` never panics and computes `aesLikeRound` of the main Lean package on the
field reading of its arguments. -/
theorem aes_like_round_refines (s m : Std.Array U8 16#usize) (o : Std.Array U8 4#usize)
    (t : Std.Array U8 256#usize) (k : Std.Array U8 16#usize) :
    aes_like.round s m o t k ⦃ out =>
      stateOf out = aesLikeRound (matrixOf m) (offsetsOf o) (sboxOf t) (stateOf k) (stateOf s) ⦄ := by
  unfold aes_like.round
  step with add_round_key_spec as ⟨ s1, h1 ⟩
  step with sub_bytes_spec as ⟨ s2, h2 ⟩
  step with shift_rows_spec as ⟨ s3, h3 ⟩
  step with mix_columns_spec as ⟨ s4, h4 ⟩
  funext p
  simp only [stateOf, aesLikeRound, mixColumns]
  rw [h4 p.val p.isLt]
  simp only [mixValue]
  refine Finset.sum_congr rfl (fun j _ => ?_)
  congr 1
  have e1 : (4 * (p.val / 4) + j.val) % 4 = j.val := by omega
  have e2 : (4 * (p.val / 4) + j.val) / 4 = p.val / 4 := by omega
  have hq : shiftSource o (4 * (p.val / 4) + j.val)
      = (bytePos j (byteCol p + offsetsOf o j)).val := by
    simp only [shiftSource, e1, e2, bytePos, byteCol, offsetsOf, Fin.val_add]
    omega
  rw [h3 _ (by omega), h2 _ (shiftSource_lt o _), h1 _ (shiftSource_lt o _), hq]
  simp only [shiftRows, subBytes, addRoundKey, sboxOf, stateOf, byteRow_bytePos, byteCol_bytePos]
  rfl

/-! ### Several rounds -/

private theorem slice_val_getElem (ks : Slice (Std.Array U8 16#usize)) (n : ℕ)
    (h : n < ks.val.length) : ks.val[n] = ks[n]! := by
  rw [Slice.getElem!_Nat_eq, List.getElem!_eq_getElem?_getD, List.getElem?_eq_getElem h]
  rfl

/-- With at least `rounds` round keys, `aes_like.encrypt` never panics and computes
`aesLikeExec` of the main Lean package: `rounds` rounds, round `n` with key `ks[n]`. -/
theorem aes_like_encrypt_refines (s m : Std.Array U8 16#usize) (o : Std.Array U8 4#usize)
    (t : Std.Array U8 256#usize) (ks : Slice (Std.Array U8 16#usize)) (rounds : Usize)
    (hks : rounds.val ≤ ks.length) :
    aes_like.encrypt s m o t ks rounds ⦃ out =>
      stateOf out =
        aesLikeExec (matrixOf m) (offsetsOf o) (sboxOf t) (keysOf ks) (stateOf s) rounds.val ⦄ := by
  unfold aes_like.encrypt aes_like.encrypt_loop
  apply loop.spec_decr_nat (fun x => rounds.val - x.2.val)
    (fun x => x.2.val ≤ rounds.val ∧ stateOf x.1 =
      aesLikeExec (matrixOf m) (offsetsOf o) (sboxOf t) (keysOf ks) (stateOf s) x.2.val)
  · rintro ⟨u, n⟩ ⟨hn, hu⟩
    dsimp only at hn hu ⊢
    simp only [aes_like.encrypt_loop.body]
    split
    · step as ⟨ key, hkey ⟩
      step with aes_like_round_refines as ⟨ u', hu' ⟩
      step as ⟨ n', hn' ⟩
      have hlt : n.val < rounds.val := by scalar_tac
      refine ⟨by omega, ?_, by omega⟩
      rw [hu', hn', aesLikeExec_succ, ← hu, hkey, slice_val_getElem]
      rfl
    · simp only [spec_ok]
      have : n.val = rounds.val := by scalar_tac
      rw [hu, this]
  · exact ⟨by simp, rfl⟩

/-! ### The same results as equations -/

/-- Aeneas's total-correctness predicate is "returns `ok v` for some `v` satisfying `p`". -/
theorem spec_iff_exists_ok {α : Type} (m : Result α) (p : α → Prop) :
    m ⦃ v => p v ⦄ ↔ ∃ v, m = ok v ∧ p v := by
  constructor
  · intro h
    cases m <;> simp_all
  · rintro ⟨v, rfl, hv⟩
    simpa using hv

/-- `aes_like.round` returns `ok`, and the result reads as `aesLikeRound`. -/
theorem aes_like_round_eq (s m : Std.Array U8 16#usize) (o : Std.Array U8 4#usize)
    (t : Std.Array U8 256#usize) (k : Std.Array U8 16#usize) :
    ∃ out, aes_like.round s m o t k = ok out ∧
      stateOf out = aesLikeRound (matrixOf m) (offsetsOf o) (sboxOf t) (stateOf k) (stateOf s) :=
  (spec_iff_exists_ok _ _).mp (aes_like_round_refines s m o t k)

/-- With at least `rounds` keys, `aes_like.encrypt` returns `ok`, and the result reads as
`aesLikeExec`. -/
theorem aes_like_encrypt_eq (s m : Std.Array U8 16#usize) (o : Std.Array U8 4#usize)
    (t : Std.Array U8 256#usize) (ks : Slice (Std.Array U8 16#usize)) (rounds : Usize)
    (hks : rounds.val ≤ ks.length) :
    ∃ out, aes_like.encrypt s m o t ks rounds = ok out ∧
      stateOf out =
        aesLikeExec (matrixOf m) (offsetsOf o) (sboxOf t) (keysOf ks) (stateOf s) rounds.val :=
  (spec_iff_exists_ok _ _).mp (aes_like_encrypt_refines s m o t ks rounds hks)

/-! ### Connection to the active-S-box bound

`Cryptificate.activeSboxes_bound` (main package, from WideTrail's wide-trail bound) counts, for
two executions of `aesLikeExec` under the same round keys, the S-boxes whose inputs differ. By
`aes_like_encrypt_refines` those executions are the Rust ones, so the bound holds for the
outputs of `aes_like.encrypt` itself. -/

/-- An S-box table without repeated entries is an injective map on field elements. -/
theorem sboxOf_injective (t : Std.Array U8 256#usize)
    (ht : ∀ a < 256, ∀ b < 256, t[a]! = t[b]! → a = b) : Function.Injective (sboxOf t) := by
  intro x y hxy
  have hb : t[x.val.toNat]! = t[y.val.toNat]! := by
    have := congrArg ofField hxy
    simpa [sboxOf] using this
  have := ht _ (BitVec.isLt x.val) _ (BitVec.isLt y.val) hb
  cases x; cases y
  simp only [GF256.mk.injEq]
  exact BitVec.eq_of_toNat_eq this

/-- **The activity bound for the Rust kernel.** Let `outX n` and `outY n` be what
`aes_like.encrypt` returns after `n` rounds from the states `x` and `y` (same matrix, offsets,
S-box table and keys). If the matrix is MDS, the offsets are diffusion-optimal, the S-box table
has no repeated entry and the inputs differ, then over the first `r` rounds at least
`activityBound r` S-boxes see different inputs in the two Rust executions; the S-box inputs of
round `n` are `outX n` and `outY n` plus key `n`. -/
theorem aes_like_encrypt_activity_bound (m : Std.Array U8 16#usize) (o : Std.Array U8 4#usize)
    (t : Std.Array U8 256#usize) (ks : Slice (Std.Array U8 16#usize))
    (hM : IsMDS (matrixOf m))
    (hoff : DiffusionOptimal (gridCol 4 4) (shiftRowsPerm 4 4 (offsetsOf o)))
    (ht : ∀ a < 256, ∀ b < 256, t[a]! = t[b]! → a = b)
    (x y : Std.Array U8 16#usize) (hxy : stateOf x ≠ stateOf y)
    (r : ℕ) (hr : r ≤ ks.length) (outX outY : ℕ → Std.Array U8 16#usize)
    (hX : ∀ n : Usize, n.val < r → aes_like.encrypt x m o t ks n = ok (outX n.val))
    (hY : ∀ n : Usize, n.val < r → aes_like.encrypt y m o t ks n = ok (outY n.val)) :
    activityBound r ≤ ∑ n ∈ Finset.range r,
      (Finset.univ.filter fun p : Fin 16 =>
        stateOf (outX n) p + keysOf ks n p ≠ stateOf (outY n) p + keysOf ks n p).card := by
  have reading : ∀ (z : Std.Array U8 16#usize) (outZ : ℕ → Std.Array U8 16#usize),
      (∀ n : Usize, n.val < r → aes_like.encrypt z m o t ks n = ok (outZ n.val)) →
      ∀ n < r, stateOf (outZ n) =
        aesLikeExec (matrixOf m) (offsetsOf o) (sboxOf t) (keysOf ks) (stateOf z) n := by
    intro z outZ hZ n hn
    have hmax : n < 2 ^ UScalarTy.Usize.numBits := by
      have := Slice.length_ineq ks
      simp only [Slice.length] at hr
      scalar_tac
    let u : Usize := UScalar.ofNatCore n hmax
    have hu : u.val = n := UScalar.ofNatCore_val_eq hmax
    have h := aes_like_encrypt_refines z m o t ks u (by rw [hu]; omega)
    rw [hZ u (by rw [hu]; exact hn), spec_ok, hu] at h
    exact h
  have hbound := activeSboxes_bound hM hoff (sboxOf_injective t ht) (keysOf ks) hxy r
  refine hbound.trans (le_of_eq (Finset.sum_congr rfl fun n hn => ?_))
  have hn' : n < r := Finset.mem_range.mp hn
  simp only [activeSboxesAt, addRoundKey, reading x outX hX n hn', reading y outY hY n hn']
  congr 1

end Cryptificate.Refinement
