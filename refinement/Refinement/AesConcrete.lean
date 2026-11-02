/-
Copyright (c) Cryptificate contributors. Released under the MIT license.
-/
import Refinement.AesLike
import Cryptificate.Sbox
import Cryptificate.Diffusion.Minors4
import Cryptificate.Diffusion.Offsets

/-!
# The activity bound for designs that pass kernel-checked byte checks

`aes_like_encrypt_activity_bound` (`Refinement/AesLike.lean`) holds for every design, under
three hypotheses on the design: the matrix is MDS, the offsets are diffusion-optimal and the
S-box table has no repeated entry. This file discharges them inside this package, for byte
arrays that pass three Boolean checks the kernel can evaluate.

## Checks on the Rust byte arrays

* the matrix: `minors4Ok (matrixOf m)`, the `69` canonical minors of the main package
  (`lean/Cryptificate/Diffusion/Minors4.lean`, compiled here from the same source), with
  `isMDS_of_minors4Ok`;
* the offsets: `offsetsDistinct o`, the four offsets are different modulo `4`, with
  `diffusionOptimal_of_injective` (`lean/Cryptificate/Diffusion/Offsets.lean`);
* the S-box table: `tableCovers t`, every byte value occurs among the `256` entries. The check
  ors `2 ^ t[x]` over all entries and compares with `2 ^ 256 - 1`, one pass over the table
  (comparing all `65,536` pairs of entries is much slower in the kernel). A table of `256`
  bytes that covers all byte values has no repeated entry (`sboxOf_injective_of_tableCovers`);
  `sboxOf_injective_iff` states that injectivity of `sboxOf t` is exactly the absence of
  repeated entries that `aes_like_encrypt_activity_bound` asks for.

`aes_like_encrypt_activity_bound_of_checks` is the activity bound under these three checks; a
concrete design is then an instance, with each check closed by `decide +kernel`.
-/

set_option autoImplicit false

open Aeneas Aeneas.Std Result
open Aeneas.Std.WP
open cryptificate_kernels

namespace Cryptificate.Refinement

/-! ### Reading bytes back -/

/-- The byte `n < 256` as a field element reads back as `n`. -/
private theorem gf_toNat {n : ℕ} (h : n < 256) : (gf n).val.toNat = n := by
  simp [gf, BitVec.toNat_ofNat, Nat.mod_eq_of_lt h]

/-- A byte read as a field element is the byte numeral of its value. -/
theorem toField_eq_gf_val (b : U8) : toField b = gf b.val := by
  simp only [toField, gf, GF256.mk.injEq]
  apply BitVec.eq_of_toNat_eq
  rw [BitVec.toNat_ofNat]
  exact (Nat.mod_eq_of_lt (BitVec.isLt b.bv)).symm

theorem toField_injective : Function.Injective toField := by
  intro a b h
  apply U8.bv_eq_imp_eq
  simpa [toField] using h

private theorem array_getElem!_eq {α : Type} [Inhabited α] {n : Usize} (s : Std.Array α n) (i : ℕ)
    (h : i < s.val.length) : s[i]! = s.val[i] := by
  rw [Array.getElem!_Nat_eq, List.getElem!_eq_getElem?_getD, List.getElem?_eq_getElem h]
  rfl

/-- Different 16-byte arrays are different states. -/
theorem stateOf_injective : Function.Injective stateOf := by
  intro x y h
  apply Aeneas.Std.Array.ext
  have hx := x.property
  have hy := y.property
  apply List.ext_getElem (by rw [hx, hy])
  intro i hi hi'
  have hi16 : i < 16 := by rw [hx] at hi; simpa using hi
  have := congrFun h ⟨i, hi16⟩
  simp only [stateOf] at this
  rw [← array_getElem!_eq x i hi, ← array_getElem!_eq y i hi']
  exact toField_injective this

/-! ### Byte tables that cover every byte value -/

/-- The set of values taken by the entries of `t`, as a bit mask: bit `y` is set iff some entry
equals `y`. -/
def tableMask (t : Std.Array U8 256#usize) : ℕ :=
  t.val.foldl (fun acc b => acc ||| 1 <<< b.val) 0

/-- **Check on an S-box table**: every byte value is an entry of `t`. -/
def tableCovers (t : Std.Array U8 256#usize) : Bool :=
  tableMask t == 2 ^ 256 - 1

private theorem testBit_foldl (l : List U8) (a y : ℕ) :
    (l.foldl (fun acc b => acc ||| 1 <<< b.val) a).testBit y =
      (a.testBit y || l.any fun b => b.val == y) := by
  induction l generalizing a with
  | nil => simp
  | cons b l ih =>
    rw [List.foldl_cons, ih, List.any_cons, Nat.testBit_or, Nat.one_shiftLeft,
      Nat.testBit_two_pow, Bool.or_assoc]
    rfl

/-- A covering table takes every byte value. -/
theorem exists_index_of_tableCovers {t : Std.Array U8 256#usize} (ht : tableCovers t = true)
    {y : ℕ} (hy : y < 256) : ∃ i < 256, t[i]!.val = y := by
  have hmask : tableMask t = 2 ^ 256 - 1 := by simpa [tableCovers] using ht
  have hbit : (tableMask t).testBit y = true := by
    rw [hmask, Nat.testBit_two_pow_sub_one]
    simpa using hy
  rw [tableMask, testBit_foldl] at hbit
  simp only [Nat.zero_testBit, Bool.false_or, List.any_eq_true, beq_iff_eq] at hbit
  obtain ⟨b, hb, hby⟩ := hbit
  obtain ⟨i, hi, rfl⟩ := List.getElem_of_mem hb
  have hlen : t.val.length = 256 := by simp
  refine ⟨i, by omega, ?_⟩
  rw [array_getElem!_eq t i hi, hby]

/-- A covering table read as a map of `GF(2⁸)` is surjective. -/
theorem sboxOf_surjective_of_tableCovers {t : Std.Array U8 256#usize}
    (ht : tableCovers t = true) : Function.Surjective (sboxOf t) := by
  intro z
  obtain ⟨i, hi, hiz⟩ := exists_index_of_tableCovers ht (BitVec.isLt z.val)
  refine ⟨gf i, ?_⟩
  simp only [sboxOf, gf_toNat hi, toField]
  cases z
  simp only [GF256.mk.injEq]
  exact BitVec.eq_of_toNat_eq hiz

/-- **A covering table has no repeated entry**: `256` entries take all `256` values. -/
theorem sboxOf_injective_of_tableCovers {t : Std.Array U8 256#usize}
    (ht : tableCovers t = true) : Function.Injective (sboxOf t) :=
  Finite.injective_iff_surjective.mpr (sboxOf_surjective_of_tableCovers ht)

/-- Injectivity of `sboxOf t` is exactly the absence of repeated entries among
`t[0], …, t[255]`, the hypothesis of `aes_like_encrypt_activity_bound`. The converse of
`sboxOf_injective`. -/
theorem table_injective_of_sboxOf_injective {t : Std.Array U8 256#usize}
    (h : Function.Injective (sboxOf t)) : ∀ a < 256, ∀ b < 256, t[a]! = t[b]! → a = b := by
  intro a ha b hb hab
  have hgf : gf a = gf b := h (by simp only [sboxOf, gf_toNat ha, gf_toNat hb, hab])
  rw [← gf_toNat ha, ← gf_toNat hb, hgf]

theorem sboxOf_injective_iff (t : Std.Array U8 256#usize) :
    Function.Injective (sboxOf t) ↔ ∀ a < 256, ∀ b < 256, t[a]! = t[b]! → a = b :=
  ⟨table_injective_of_sboxOf_injective, sboxOf_injective t⟩

/-! ### Offsets -/

/-- **Check on the offsets**: the four offset bytes are different modulo `4` (the Rust code
reduces them modulo `4`). -/
def offsetsDistinct (o : Std.Array U8 4#usize) : Bool :=
  decide (Function.Injective (offsetsOf o))

theorem diffusionOptimal_of_offsetsDistinct {o : Std.Array U8 4#usize}
    (h : offsetsDistinct o = true) :
    DiffusionOptimal (gridCol 4 4) (shiftRowsPerm 4 4 (offsetsOf o)) :=
  diffusionOptimal_of_injective (of_decide_eq_true h)

/-! ### The activity bound under the three checks -/

/-- **The activity bound for the Rust kernel, for every design that passes the checks.** If the
matrix bytes `m` pass `minors4Ok`, the offset bytes `o` are distinct modulo `4` and the
table `t` covers every byte value, then for any two different input arrays, any round keys
(at least `r`), the executions of `aes_like.encrypt` have at least `activityBound r` S-boxes
with different inputs over the first `r` rounds. Each check is a Boolean the kernel evaluates
for concrete bytes (`decide +kernel`). -/
theorem aes_like_encrypt_activity_bound_of_checks (m : Std.Array U8 16#usize)
    (o : Std.Array U8 4#usize) (t : Std.Array U8 256#usize) (ks : Slice (Std.Array U8 16#usize))
    (hM : minors4Ok (matrixOf m) = true) (hoff : offsetsDistinct o = true)
    (ht : tableCovers t = true)
    (x y : Std.Array U8 16#usize) (hxy : x ≠ y)
    (r : ℕ) (hr : r ≤ ks.length) (outX outY : ℕ → Std.Array U8 16#usize)
    (hX : ∀ n : Usize, n.val < r → aes_like.encrypt x m o t ks n = ok (outX n.val))
    (hY : ∀ n : Usize, n.val < r → aes_like.encrypt y m o t ks n = ok (outY n.val)) :
    activityBound r ≤ ∑ n ∈ Finset.range r,
      (Finset.univ.filter fun p : Fin 16 =>
        stateOf (outX n) p + keysOf ks n p ≠ stateOf (outY n) p + keysOf ks n p).card :=
  aes_like_encrypt_activity_bound m o t ks (isMDS_of_minors4Ok _ hM)
    (diffusionOptimal_of_offsetsDistinct hoff)
    (table_injective_of_sboxOf_injective (sboxOf_injective_of_tableCovers ht))
    x y (fun h => hxy (stateOf_injective h)) r hr outX outY hX hY

/-- With at least `r` round keys, `aes_like.encrypt` returns normally for every number of
rounds below `r`: there is a sequence of outputs `out` with
`aes_like.encrypt x m o t ks n = ok (out n)`. -/
theorem exists_encrypt_outputs (x m : Std.Array U8 16#usize) (o : Std.Array U8 4#usize)
    (t : Std.Array U8 256#usize) (ks : Slice (Std.Array U8 16#usize)) (r : ℕ)
    (hr : r ≤ ks.length) :
    ∃ out : ℕ → Std.Array U8 16#usize,
      ∀ n : Usize, n.val < r → aes_like.encrypt x m o t ks n = ok (out n.val) := by
  have H : ∀ k : ℕ, ∃ v : Std.Array U8 16#usize,
      ∀ n : Usize, n.val = k → n.val < r → aes_like.encrypt x m o t ks n = ok v := by
    intro k
    by_cases hk : k < r
    · have hmax : k < 2 ^ UScalarTy.Usize.numBits := by
        have := Slice.length_ineq ks
        simp only [Slice.length] at hr
        scalar_tac
      let u : Usize := UScalar.ofNatCore k hmax
      have hu : u.val = k := UScalar.ofNatCore_val_eq hmax
      obtain ⟨v, hv, -⟩ := aes_like_encrypt_eq x m o t ks u (by omega)
      refine ⟨v, fun n hn _ => ?_⟩
      have : n = u := by
        rw [UScalar.eq_equiv_bv_eq]
        apply BitVec.eq_of_toNat_eq
        change n.val = u.val
        omega
      rw [this, hv]
    · exact ⟨x, fun n hn hnr => absurd (hn ▸ hnr) hk⟩
  choose out hout using H
  exact ⟨out, fun n hn => hout n.val n rfl hn⟩

end Cryptificate.Refinement
