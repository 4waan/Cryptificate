/-
Copyright (c) Cryptificate contributors. Released under the MIT license.
-/
import Refinement.AesLike
import Cryptificate.Sbox
import Cryptificate.Diffusion.Minors4
import Cryptificate.Diffusion.Offsets

/-!
# The activity bound for concrete designs, without design hypotheses

`aes_like_encrypt_activity_bound` (`Refinement/AesLike.lean`) holds for every design, under
three hypotheses on the design: the matrix is MDS, the offsets are diffusion-optimal and the
S-box table has no repeated entry. This file discharges them inside this package, for byte
arrays that pass three Boolean checks the kernel can evaluate, and then for AES.

## Checks on the Rust byte arrays

* the matrix: `minors4Ok (matrixOf m)`, the `69` canonical minors of the main package
  (`lean/Cryptificate/Diffusion/Minors4.lean`, compiled here from the same source), with
  `isMDS_of_minors4Ok`;
* the offsets: `offsetsDistinct o`, the four offsets are different modulo `4`, with
  `diffusionOptimal_of_injective` (`lean/Cryptificate/Diffusion/Offsets.lean`);
* the S-box table: `tableCovers t`, every byte value occurs among the `256` entries. The check
  sets bit `t[x]` of a mask for every entry and compares the mask with `2 ^ 256 - 1`: one pass
  over the table, instead of a comparison of the `65,536` pairs of entries. A table of `256`
  bytes that covers all byte values has no repeated entry (`sboxOf_injective_of_tableCovers`);
  `sboxOf_injective_iff` states that injectivity of `sboxOf t` is exactly the absence of
  repeated entries that `aes_like_encrypt_activity_bound` asks for.

`aes_like_encrypt_activity_bound_of_checks` is the activity bound under these three checks; a
concrete design is then an instance, with each check closed by `decide +kernel`.

## AES

`aesMatrixBytes`, `aesOffsetBytes` and `aesSboxBytes` are the AES `MixColumns` matrix
`[02 03 01 01 / 01 02 03 01 / 01 01 02 03 / 03 01 01 02]` (row-major), the `ShiftRows`
offsets `[0, 1, 2, 3]` and the FIPS 197 S-box table, as values of Aeneas's model of
`[u8; 16]`, `[u8; 4]` and `[u8; 256]`, the types `aes_like::encrypt` takes. They are written
in this file (Lean literals), not extracted from a Rust constant. `matrixOf_aesMatrixBytes`,
`offsetsOf_aesOffsetBytes` and `sboxOf_aesSboxBytes` identify them with the main package's
encodings and with WideTrail's algebraic `AES.sbox` (through `aes_sbox_eq_table`).

`aes_rust_activity_bound`: for any two different input states and any round keys, at least
`r` of them, the executions of `aes_like.encrypt` with these arrays have at least
`activityBound r` S-boxes with different inputs over the first `r` rounds; `_exists` also
says that those executions return normally. For `r = 10` the bound is `55`
(`aes_rust_activity_bound_10`), for `r = 4` it is `25` (`aes_rust_activity_bound_4`). The
model has no special last round, as in `aes_like.rs`.
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

/-- An injective `sboxOf t` has no repeated entry among `t[0], …, t[255]`: the converse of
`sboxOf_injective`. -/
theorem table_injective_of_sboxOf_injective {t : Std.Array U8 256#usize}
    (h : Function.Injective (sboxOf t)) : ∀ a < 256, ∀ b < 256, t[a]! = t[b]! → a = b := by
  intro a ha b hb hab
  have hgf : gf a = gf b := h (by simp only [sboxOf, gf_toNat ha, gf_toNat hb, hab])
  rw [← gf_toNat ha, ← gf_toNat hb, hgf]

/-- Injectivity of `sboxOf t` is exactly the absence of repeated entries among
`t[0], …, t[255]`, the S-box hypothesis of `aes_like_encrypt_activity_bound`. -/
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

/-! ### The checks reject designs that fail them

The checks are evaluated, not assumed. The kernel rejects the all-ones matrix (its `2 × 2`
minors vanish), the offsets `0, 1, 2, 5` (`5` and `1` agree modulo `4`) and a constant
table. -/

example : minors4Ok (matrixOf (Array.repeat 16#usize 1#u8)) = false := by decide +kernel

example : offsetsDistinct (Array.make 4#usize [0#u8, 1#u8, 2#u8, 5#u8] (by rfl)) = false := by
  decide +kernel

example : tableCovers (Array.repeat 256#usize 0#u8) = false := by decide +kernel

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

/-! ### AES -/

/-- The AES `MixColumns` matrix, row-major, as Aeneas's model of `[u8; 16]`. -/
def aesMatrixBytes : Std.Array U8 16#usize := Array.make 16#usize [
    0x02#u8, 0x03#u8, 0x01#u8, 0x01#u8,
    0x01#u8, 0x02#u8, 0x03#u8, 0x01#u8,
    0x01#u8, 0x01#u8, 0x02#u8, 0x03#u8,
    0x03#u8, 0x01#u8, 0x01#u8, 0x02#u8] (by rfl)

/-- The AES `ShiftRows` offsets, as Aeneas's model of `[u8; 4]`. -/
def aesOffsetBytes : Std.Array U8 4#usize := Array.make 4#usize [0#u8, 1#u8, 2#u8, 3#u8] (by rfl)

set_option maxRecDepth 16000 in
/-- The AES S-box table of FIPS 197, entry `x` the image of the byte `x`, as Aeneas's model of
`[u8; 256]`. -/
def aesSboxBytes : Std.Array U8 256#usize := Array.make 256#usize [
    0x63#u8, 0x7C#u8, 0x77#u8, 0x7B#u8, 0xF2#u8, 0x6B#u8, 0x6F#u8, 0xC5#u8,
    0x30#u8, 0x01#u8, 0x67#u8, 0x2B#u8, 0xFE#u8, 0xD7#u8, 0xAB#u8, 0x76#u8,
    0xCA#u8, 0x82#u8, 0xC9#u8, 0x7D#u8, 0xFA#u8, 0x59#u8, 0x47#u8, 0xF0#u8,
    0xAD#u8, 0xD4#u8, 0xA2#u8, 0xAF#u8, 0x9C#u8, 0xA4#u8, 0x72#u8, 0xC0#u8,
    0xB7#u8, 0xFD#u8, 0x93#u8, 0x26#u8, 0x36#u8, 0x3F#u8, 0xF7#u8, 0xCC#u8,
    0x34#u8, 0xA5#u8, 0xE5#u8, 0xF1#u8, 0x71#u8, 0xD8#u8, 0x31#u8, 0x15#u8,
    0x04#u8, 0xC7#u8, 0x23#u8, 0xC3#u8, 0x18#u8, 0x96#u8, 0x05#u8, 0x9A#u8,
    0x07#u8, 0x12#u8, 0x80#u8, 0xE2#u8, 0xEB#u8, 0x27#u8, 0xB2#u8, 0x75#u8,
    0x09#u8, 0x83#u8, 0x2C#u8, 0x1A#u8, 0x1B#u8, 0x6E#u8, 0x5A#u8, 0xA0#u8,
    0x52#u8, 0x3B#u8, 0xD6#u8, 0xB3#u8, 0x29#u8, 0xE3#u8, 0x2F#u8, 0x84#u8,
    0x53#u8, 0xD1#u8, 0x00#u8, 0xED#u8, 0x20#u8, 0xFC#u8, 0xB1#u8, 0x5B#u8,
    0x6A#u8, 0xCB#u8, 0xBE#u8, 0x39#u8, 0x4A#u8, 0x4C#u8, 0x58#u8, 0xCF#u8,
    0xD0#u8, 0xEF#u8, 0xAA#u8, 0xFB#u8, 0x43#u8, 0x4D#u8, 0x33#u8, 0x85#u8,
    0x45#u8, 0xF9#u8, 0x02#u8, 0x7F#u8, 0x50#u8, 0x3C#u8, 0x9F#u8, 0xA8#u8,
    0x51#u8, 0xA3#u8, 0x40#u8, 0x8F#u8, 0x92#u8, 0x9D#u8, 0x38#u8, 0xF5#u8,
    0xBC#u8, 0xB6#u8, 0xDA#u8, 0x21#u8, 0x10#u8, 0xFF#u8, 0xF3#u8, 0xD2#u8,
    0xCD#u8, 0x0C#u8, 0x13#u8, 0xEC#u8, 0x5F#u8, 0x97#u8, 0x44#u8, 0x17#u8,
    0xC4#u8, 0xA7#u8, 0x7E#u8, 0x3D#u8, 0x64#u8, 0x5D#u8, 0x19#u8, 0x73#u8,
    0x60#u8, 0x81#u8, 0x4F#u8, 0xDC#u8, 0x22#u8, 0x2A#u8, 0x90#u8, 0x88#u8,
    0x46#u8, 0xEE#u8, 0xB8#u8, 0x14#u8, 0xDE#u8, 0x5E#u8, 0x0B#u8, 0xDB#u8,
    0xE0#u8, 0x32#u8, 0x3A#u8, 0x0A#u8, 0x49#u8, 0x06#u8, 0x24#u8, 0x5C#u8,
    0xC2#u8, 0xD3#u8, 0xAC#u8, 0x62#u8, 0x91#u8, 0x95#u8, 0xE4#u8, 0x79#u8,
    0xE7#u8, 0xC8#u8, 0x37#u8, 0x6D#u8, 0x8D#u8, 0xD5#u8, 0x4E#u8, 0xA9#u8,
    0x6C#u8, 0x56#u8, 0xF4#u8, 0xEA#u8, 0x65#u8, 0x7A#u8, 0xAE#u8, 0x08#u8,
    0xBA#u8, 0x78#u8, 0x25#u8, 0x2E#u8, 0x1C#u8, 0xA6#u8, 0xB4#u8, 0xC6#u8,
    0xE8#u8, 0xDD#u8, 0x74#u8, 0x1F#u8, 0x4B#u8, 0xBD#u8, 0x8B#u8, 0x8A#u8,
    0x70#u8, 0x3E#u8, 0xB5#u8, 0x66#u8, 0x48#u8, 0x03#u8, 0xF6#u8, 0x0E#u8,
    0x61#u8, 0x35#u8, 0x57#u8, 0xB9#u8, 0x86#u8, 0xC1#u8, 0x1D#u8, 0x9E#u8,
    0xE1#u8, 0xF8#u8, 0x98#u8, 0x11#u8, 0x69#u8, 0xD9#u8, 0x8E#u8, 0x94#u8,
    0x9B#u8, 0x1E#u8, 0x87#u8, 0xE9#u8, 0xCE#u8, 0x55#u8, 0x28#u8, 0xDF#u8,
    0x8C#u8, 0xA1#u8, 0x89#u8, 0x0D#u8, 0xBF#u8, 0xE6#u8, 0x42#u8, 0x68#u8,
    0x41#u8, 0x99#u8, 0x2D#u8, 0x0F#u8, 0xB0#u8, 0x54#u8, 0xBB#u8, 0x16#u8] (by rfl)

/-- The AES matrix passes the canonical-minor check. -/
theorem aesMatrixBytes_minors4Ok : minors4Ok (matrixOf aesMatrixBytes) = true := by
  decide +kernel

/-- The AES offsets are distinct. -/
theorem aesOffsetBytes_distinct : offsetsDistinct aesOffsetBytes = true := by decide +kernel

/-- The AES S-box table covers every byte value. -/
theorem aesSboxBytes_covers : tableCovers aesSboxBytes = true := by decide +kernel

/-- The bytes are the matrix that the main package's certificates write for AES. -/
theorem matrixOf_aesMatrixBytes :
    matrixOf aesMatrixBytes = gfMat4 2 3 1 1 1 2 3 1 1 1 2 3 3 1 1 2 := by
  funext r j
  fin_cases r <;> fin_cases j <;> decide +kernel

/-- The bytes are the offsets `0, 1, 2, 3` of the main package's encoding. -/
theorem offsetsOf_aesOffsetBytes : offsetsOf aesOffsetBytes = offsets4 0 1 2 3 := by
  funext r
  fin_cases r <;> decide +kernel

private theorem aesSboxBytes_eq_table : ∀ n < 256, aesSboxBytes[n]!.val = aesSboxTable n := by
  decide +kernel

/-- **The table is WideTrail's AES S-box**: read as a map of `GF(2⁸)`, `aesSboxBytes` is
`AES.sbox`, defined algebraically (inversion, then the affine map), via the FIPS 197 table
`aesSboxTable` of the main package and `aes_sbox_eq_table`. -/
theorem sboxOf_aesSboxBytes : sboxOf aesSboxBytes = AES.sbox := by
  funext x
  rw [aes_sbox_eq_table]
  unfold sboxOf tableSbox
  have e := aesSboxBytes_eq_table _ (BitVec.isLt x.val)
  generalize aesSboxBytes[x.val.toNat]! = b at e ⊢
  rw [← e]
  exact toField_eq_gf_val b

/-- **The activity bound for AES, from the Rust source, with no design hypothesis.** For any
two different input states `x ≠ y` and any round keys `ks`, at least `r` of them, let
`outX n` and `outY n` be what `aes_like.encrypt` returns after `n` rounds with the AES matrix,
offsets and S-box table. Then over the first `r` rounds at least `activityBound r` S-boxes see
different inputs in the two executions; the S-box inputs of round `n` are `outX n` and
`outY n` plus key `n`. -/
theorem aes_rust_activity_bound (ks : Slice (Std.Array U8 16#usize))
    (x y : Std.Array U8 16#usize) (hxy : x ≠ y)
    (r : ℕ) (hr : r ≤ ks.length) (outX outY : ℕ → Std.Array U8 16#usize)
    (hX : ∀ n : Usize, n.val < r →
      aes_like.encrypt x aesMatrixBytes aesOffsetBytes aesSboxBytes ks n = ok (outX n.val))
    (hY : ∀ n : Usize, n.val < r →
      aes_like.encrypt y aesMatrixBytes aesOffsetBytes aesSboxBytes ks n = ok (outY n.val)) :
    activityBound r ≤ ∑ n ∈ Finset.range r,
      (Finset.univ.filter fun p : Fin 16 =>
        stateOf (outX n) p + keysOf ks n p ≠ stateOf (outY n) p + keysOf ks n p).card :=
  aes_like_encrypt_activity_bound_of_checks aesMatrixBytes aesOffsetBytes aesSboxBytes ks
    aesMatrixBytes_minors4Ok aesOffsetBytes_distinct aesSboxBytes_covers x y hxy r hr outX outY
    hX hY

/-- The same bound, together with the fact that the executions return normally: for any two
different input states and at least `r` round keys, `aes_like.encrypt` returns outputs for
every number of rounds below `r`, and they have at least `activityBound r` S-boxes with
different inputs. -/
theorem aes_rust_activity_bound_exists (ks : Slice (Std.Array U8 16#usize))
    (x y : Std.Array U8 16#usize) (hxy : x ≠ y) (r : ℕ) (hr : r ≤ ks.length) :
    ∃ outX outY : ℕ → Std.Array U8 16#usize,
      (∀ n : Usize, n.val < r →
        aes_like.encrypt x aesMatrixBytes aesOffsetBytes aesSboxBytes ks n = ok (outX n.val)) ∧
      (∀ n : Usize, n.val < r →
        aes_like.encrypt y aesMatrixBytes aesOffsetBytes aesSboxBytes ks n = ok (outY n.val)) ∧
      activityBound r ≤ ∑ n ∈ Finset.range r,
        (Finset.univ.filter fun p : Fin 16 =>
          stateOf (outX n) p + keysOf ks n p ≠ stateOf (outY n) p + keysOf ks n p).card := by
  obtain ⟨outX, hX⟩ := exists_encrypt_outputs x aesMatrixBytes aesOffsetBytes aesSboxBytes ks r hr
  obtain ⟨outY, hY⟩ := exists_encrypt_outputs y aesMatrixBytes aesOffsetBytes aesSboxBytes ks r hr
  exact ⟨outX, outY, hX, hY, aes_rust_activity_bound ks x y hxy r hr outX outY hX hY⟩

/-- **Ten rounds of AES (without the special last round) activate at least `55` S-boxes**, in
the executions of the Rust kernel, for any two different inputs and any ten or more round
keys. -/
theorem aes_rust_activity_bound_10 (ks : Slice (Std.Array U8 16#usize))
    (x y : Std.Array U8 16#usize) (hxy : x ≠ y) (hr : 10 ≤ ks.length) :
    ∃ outX outY : ℕ → Std.Array U8 16#usize,
      (∀ n : Usize, n.val < 10 →
        aes_like.encrypt x aesMatrixBytes aesOffsetBytes aesSboxBytes ks n = ok (outX n.val)) ∧
      (∀ n : Usize, n.val < 10 →
        aes_like.encrypt y aesMatrixBytes aesOffsetBytes aesSboxBytes ks n = ok (outY n.val)) ∧
      55 ≤ ∑ n ∈ Finset.range 10,
        (Finset.univ.filter fun p : Fin 16 =>
          stateOf (outX n) p + keysOf ks n p ≠ stateOf (outY n) p + keysOf ks n p).card := by
  have hb : activityBound 10 = 55 := rfl
  simpa only [hb] using aes_rust_activity_bound_exists ks x y hxy 10 hr

/-- **Four rounds activate at least `25` S-boxes**, the four-round bound of the wide-trail
strategy, in the executions of the Rust kernel. -/
theorem aes_rust_activity_bound_4 (ks : Slice (Std.Array U8 16#usize))
    (x y : Std.Array U8 16#usize) (hxy : x ≠ y) (hr : 4 ≤ ks.length) :
    ∃ outX outY : ℕ → Std.Array U8 16#usize,
      (∀ n : Usize, n.val < 4 →
        aes_like.encrypt x aesMatrixBytes aesOffsetBytes aesSboxBytes ks n = ok (outX n.val)) ∧
      (∀ n : Usize, n.val < 4 →
        aes_like.encrypt y aesMatrixBytes aesOffsetBytes aesSboxBytes ks n = ok (outY n.val)) ∧
      25 ≤ ∑ n ∈ Finset.range 4,
        (Finset.univ.filter fun p : Fin 16 =>
          stateOf (outX n) p + keysOf ks n p ≠ stateOf (outY n) p + keysOf ks n p).card := by
  have hb : activityBound 4 = 25 := rfl
  simpa only [hb] using aes_rust_activity_bound_exists ks x y hxy 4 hr

end Cryptificate.Refinement
