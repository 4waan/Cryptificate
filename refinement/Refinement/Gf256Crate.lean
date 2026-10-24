/-
Copyright (c) Cryptificate contributors. Released under the MIT license.
-/
import Extracted.Gf256Aes
import Refinement.GF256
import Refinement.AesLike
import Mathlib.Data.Nat.Log

/-!
# Refinement of the gf256 crate's multiplication

The crates.io crate `gf256` (version 0.3.1) generates Galois-field types with its `gf` macro.
`refinement/gf256crate` configures one for the AES polynomial `0x11B` with the crate features
`no-tables` and `no-xmul`; the macro then uses Barrett reduction over the crate's polynomial
types with bitwise carry-less multiplication. `gf256crate/expand.sh` expands that configuration
into one Rust file, `refinement/rust/gf256_aes_expanded.rs`, whose SHA-256 is the identity of
the source covered here. Charon and Aeneas translate its field multiplication
(`gf256_aes::__gf256_aes_gen::gf256_aes::mul` and everything it calls) to
`Extracted.Gf256Aes`.

The translated `mul` computes

    let (lo, hi) = a ⊗ b                 -- naive_widening_mul, 8 masked shift-and-xor steps
    lo ⊕ ((hi ⊗ C).hi ⊕ hi) ⊗ 0x1B       -- naive_wrapping_mul, C = BARRET_CONSTANT

where `C = 0x1A` is computed by the crate itself as the polynomial quotient
`0x1B00 / 0x11B` (`naive_div_barrett`). `crateMul` is this computation on `BitVec 8`.

* `mul_spec`: the translation returns `crateMul` of the input bytes, never panicking;
* `crateMul_eq_rawMul`: `crateMul` is WideTrail's `GF256.rawMul` on all 65,536 inputs. Both are
  additive in each argument (for `crateMul` from the loop structure, for `rawMul` from the field
  laws), so the kernel only checks the 64 products of single-bit bytes;
* `gf256crate_mul_refines`, `gf256crate_mul_field`, `gf256crate_mul_eq_kernels`: the main
  results, the last one stating that the crate and `crates/kernels` return the same products.

**Hypothesis.** The crate computes shift amounts with `core::mem::size_of::<u8>()`, which the
Aeneas library at the pinned commit does not model: the translation declares
`gf256_aes.core.mem.size_of` as an uninterpreted function (a Lean `axiom` of a function type).
The theorems take `SizeOfU8 : size_of U8 = ok 1` as a hypothesis, which the Rust reference
guarantees, and `#print axioms` lists `gf256_aes.core.mem.size_of` for them.
-/

set_option autoImplicit false

open Aeneas Aeneas.Std Result ControlFlow
open Aeneas.Std.WP

namespace Cryptificate.Refinement.Gf256Crate

/-! ### The bit-level computation, mirroring the Rust code -/

/-- `((a as i8) << (7 - k)) >> 7` reinterpreted as a byte: all ones if bit `k` of `a` is set. -/
def maskBit (a : BitVec 8) (k : ℕ) : BitVec 8 := (a <<< (7 - k)).sshiftRight 7

/-- Iteration `k` of `naive_widening_mul`: low and high halves of the carry-less product. -/
def wideStep (a b : BitVec 8) (k : ℕ) (acc : BitVec 8 × BitVec 8) : BitVec 8 × BitVec 8 :=
  (acc.1 ^^^ (maskBit a k &&& (b <<< k)), acc.2 ^^^ (maskBit a k &&& (b >>> (7 - k))))

/-- Iterations `k, k + 1, …, k + n - 1` of `naive_widening_mul`. -/
def wideFrom (a b : BitVec 8) : ℕ → ℕ → BitVec 8 × BitVec 8 → BitVec 8 × BitVec 8
  | _, 0, acc => acc
  | k, n + 1, acc => wideFrom a b (k + 1) n (wideStep a b k acc)

/-- Iteration `k` of `naive_wrapping_mul`: the low half only. -/
def wrapStep (a b : BitVec 8) (k : ℕ) (x : BitVec 8) : BitVec 8 :=
  x ^^^ (maskBit a k &&& (b <<< k))

/-- Iterations `k, k + 1, …, k + n - 1` of `naive_wrapping_mul`. -/
def wrapFrom (a b : BitVec 8) : ℕ → ℕ → BitVec 8 → BitVec 8
  | _, 0, x => x
  | k, n + 1, x => wrapFrom a b (k + 1) n (wrapStep a b k x)

/-- `p8::naive_widening_mul`: `(lo, hi)` of the 15-bit carry-less product. -/
def widening (a b : BitVec 8) : BitVec 8 × BitVec 8 :=
  let r := wideFrom a b 0 8 (0#8, 0#8)
  (r.1, r.2 >>> 1)

/-- `p8::naive_wrapping_mul`: the low byte of the carry-less product. -/
def wrapping (a b : BitVec 8) : BitVec 8 := wrapFrom a b 0 8 0#8

/-- The Barrett constant the crate computes for the polynomial `0x11B`. -/
def barrett : BitVec 8 := 0x1A#8

/-- `gf256_aes::mul` in `barret` mode: `lo + (hi * C).hi + hi) * 0x1B` (carry-less). -/
def crateMul (a b : BitVec 8) : BitVec 8 :=
  let w := widening a b
  w.1 ^^^ wrapping ((widening w.2 barrett).2 ^^^ w.2) 0x1B#8

/-! ### `crateMul` is WideTrail's multiplication

Both `crateMul` and `GF256.rawMul` are additive (for `xor`) in each argument separately, so they
agree everywhere once they agree on the 64 pairs of single-bit bytes. Additivity of `rawMul`
comes from the field laws of WideTrail's `GF256`; additivity of `crateMul` from the shape of
the loops (masked shifts combined with `xor`). -/

/-- Additive for `xor`. -/
def XorLinear (f : BitVec 8 → BitVec 8) : Prop := ∀ x y, f (x ^^^ y) = f x ^^^ f y

theorem XorLinear.map_zero {f : BitVec 8 → BitVec 8} (hf : XorLinear f) : f 0#8 = 0#8 := by
  have h := hf 0#8 0#8
  rw [BitVec.xor_self] at h
  have : f 0#8 ^^^ f 0#8 = 0#8 := BitVec.xor_self
  rw [← h] at this
  exact this

private theorem decompose : ∀ x : BitVec 8, x = (x &&& 1#8) ^^^ (x &&& 2#8) ^^^ (x &&& 4#8) ^^^
    (x &&& 8#8) ^^^ (x &&& 16#8) ^^^ (x &&& 32#8) ^^^ (x &&& 64#8) ^^^ (x &&& 128#8) := by
  decide

/-- The eight single-bit bytes. -/
def basis : List (BitVec 8) := [1#8, 2#8, 4#8, 8#8, 16#8, 32#8, 64#8, 128#8]

private theorem bit_cases : ∀ c ∈ basis, ∀ x : BitVec 8, x &&& c = 0#8 ∨ x &&& c = c := by
  decide

/-- Two additive maps that agree on the single-bit bytes are equal. -/
theorem XorLinear.ext {f g : BitVec 8 → BitVec 8} (hf : XorLinear f) (hg : XorLinear g)
    (h : ∀ c ∈ basis, f c = g c) (x : BitVec 8) : f x = g x := by
  have key : ∀ c ∈ basis, f (x &&& c) = g (x &&& c) := by
    intro c hc
    rcases bit_cases c hc x with h0 | h1
    · rw [h0, hf.map_zero, hg.map_zero]
    · rw [h1, h c hc]
  have hf' : ∀ x y, f (x ^^^ y) = f x ^^^ f y := hf
  have hg' : ∀ x y, g (x ^^^ y) = g x ^^^ g y := hg
  rw [decompose x]
  simp only [hf', hg']
  simp only [basis, List.mem_cons, List.not_mem_nil, or_false] at key
  rw [key _ (by simp), key _ (by simp), key _ (by simp), key _ (by simp), key _ (by simp),
    key _ (by simp), key _ (by simp), key _ (by simp)]

private theorem and_xor_left (m x y : BitVec 8) : m &&& (x ^^^ y) = (m &&& x) ^^^ (m &&& y) := by
  ext i; simp [Bool.and_xor_distrib_left]

private theorem and_xor_right (m m' x : BitVec 8) :
    (m ^^^ m') &&& x = (m &&& x) ^^^ (m' &&& x) := by
  ext i; simp [Bool.and_xor_distrib_right]

theorem maskBit_eq (a : BitVec 8) (k : ℕ) (hk : k < 8) :
    maskBit a k = if a.getLsbD k then BitVec.allOnes 8 else 0#8 := by
  have h : ∀ k : Fin 8, ∀ a : BitVec 8,
      maskBit a k = if a.getLsbD k then BitVec.allOnes 8 else 0#8 := by decide
  exact h ⟨k, hk⟩ a

theorem maskBit_xor (a a' : BitVec 8) (k : ℕ) (hk : k < 8) :
    maskBit (a ^^^ a') k = maskBit a k ^^^ maskBit a' k := by
  rw [maskBit_eq _ _ hk, maskBit_eq _ _ hk, maskBit_eq _ _ hk, BitVec.getLsbD_xor]
  cases a.getLsbD k <;> cases a'.getLsbD k <;> simp

/-- Componentwise `xor` of pairs of bytes. -/
def pxor (p q : BitVec 8 × BitVec 8) : BitVec 8 × BitVec 8 := (p.1 ^^^ q.1, p.2 ^^^ q.2)

theorem wideFrom_xor_left (b : BitVec 8) (n : ℕ) : ∀ (k : ℕ), k + n ≤ 8 →
    ∀ (a a' : BitVec 8) (acc acc' : BitVec 8 × BitVec 8),
    wideFrom (a ^^^ a') b k n (pxor acc acc') = pxor (wideFrom a b k n acc) (wideFrom a' b k n acc') := by
  induction n with
  | zero => intro k _ a a' acc acc'; rfl
  | succ n ih =>
    intro k hk a a' acc acc'
    simp only [wideFrom]
    rw [← ih (k + 1) (by omega)]
    congr 1
    simp only [wideStep, pxor, maskBit_xor a a' k (by omega), and_xor_right, Prod.mk.injEq]
    constructor <;> ac_rfl

theorem wideFrom_xor_right (a : BitVec 8) (n : ℕ) : ∀ (k : ℕ),
    ∀ (b b' : BitVec 8) (acc acc' : BitVec 8 × BitVec 8),
    wideFrom a (b ^^^ b') k n (pxor acc acc') = pxor (wideFrom a b k n acc) (wideFrom a b' k n acc') := by
  induction n with
  | zero => intro k b b' acc acc'; rfl
  | succ n ih =>
    intro k b b' acc acc'
    simp only [wideFrom]
    rw [← ih (k + 1)]
    congr 1
    simp only [wideStep, pxor, BitVec.shiftLeft_xor_distrib, BitVec.ushiftRight_xor_distrib,
      and_xor_left, Prod.mk.injEq]
    constructor <;> ac_rfl

theorem wrapFrom_xor_left (b : BitVec 8) (n : ℕ) : ∀ (k : ℕ), k + n ≤ 8 →
    ∀ (a a' x x' : BitVec 8),
    wrapFrom (a ^^^ a') b k n (x ^^^ x') = wrapFrom a b k n x ^^^ wrapFrom a' b k n x' := by
  induction n with
  | zero => intro k _ a a' x x'; rfl
  | succ n ih =>
    intro k hk a a' x x'
    simp only [wrapFrom]
    rw [← ih (k + 1) (by omega)]
    congr 1
    simp only [wrapStep, maskBit_xor a a' k (by omega), and_xor_right]
    ac_rfl

private theorem pxor_zero : pxor (0#8, 0#8) (0#8, 0#8) = (0#8, 0#8) := rfl

theorem widening_xor_left (a a' b : BitVec 8) :
    widening (a ^^^ a') b = pxor (widening a b) (widening a' b) := by
  simp only [widening]
  rw [← pxor_zero, wideFrom_xor_left b 8 0 (by omega)]
  simp only [pxor, BitVec.ushiftRight_xor_distrib, BitVec.xor_self]

theorem widening_xor_right (a b b' : BitVec 8) :
    widening a (b ^^^ b') = pxor (widening a b) (widening a b') := by
  simp only [widening]
  rw [← pxor_zero, wideFrom_xor_right a 8 0]
  simp only [pxor, BitVec.ushiftRight_xor_distrib, BitVec.xor_self]

theorem wrapping_xor_left (a a' b : BitVec 8) :
    wrapping (a ^^^ a') b = wrapping a b ^^^ wrapping a' b := by
  simp only [wrapping]
  rw [← wrapFrom_xor_left b 8 0 (by omega), BitVec.xor_self]

/-- The reduction step of `crateMul`, as a function of the high half. -/
def reduceHigh (h : BitVec 8) : BitVec 8 := wrapping ((widening h barrett).2 ^^^ h) 0x1B#8

theorem reduceHigh_linear : XorLinear reduceHigh := by
  intro h h'
  simp only [reduceHigh, widening_xor_left, pxor]
  rw [show (widening h barrett).2 ^^^ (widening h' barrett).2 ^^^ (h ^^^ h')
      = ((widening h barrett).2 ^^^ h) ^^^ ((widening h' barrett).2 ^^^ h') by ac_rfl,
    wrapping_xor_left]

theorem crateMul_eq (a b : BitVec 8) :
    crateMul a b = (widening a b).1 ^^^ reduceHigh (widening a b).2 := rfl

theorem crateMul_linear_left (b : BitVec 8) : XorLinear (fun a => crateMul a b) := by
  intro a a'
  simp only [crateMul_eq, widening_xor_left, pxor, reduceHigh_linear _ _]
  ac_rfl

theorem crateMul_linear_right (a : BitVec 8) : XorLinear (fun b => crateMul a b) := by
  intro b b'
  simp only [crateMul_eq, widening_xor_right, pxor, reduceHigh_linear _ _]
  ac_rfl

theorem rawMul_linear_left (b : BitVec 8) : XorLinear (fun a => GF256.rawMul a b) := by
  intro a a'
  exact congrArg GF256.val (add_mul (GF256.mk a) (GF256.mk a') (GF256.mk b))

theorem rawMul_linear_right (a : BitVec 8) : XorLinear (fun b => GF256.rawMul a b) := by
  intro b b'
  exact congrArg GF256.val (mul_add (GF256.mk a) (GF256.mk b) (GF256.mk b'))

/-- The 64 products of single-bit bytes, evaluated by the kernel. -/
theorem crateMul_basis : ∀ c ∈ basis, ∀ c' ∈ basis, crateMul c c' = GF256.rawMul c c' := by
  decide

/-- **`crateMul` is WideTrail's `rawMul`**, for all 65,536 pairs of bytes. -/
theorem crateMul_eq_rawMul (a b : BitVec 8) : crateMul a b = GF256.rawMul a b := by
  have hb : ∀ c ∈ basis, ∀ y, crateMul c y = GF256.rawMul c y := fun c hc =>
    XorLinear.ext (crateMul_linear_right c) (rawMul_linear_right c) (crateMul_basis c hc)
  exact XorLinear.ext (f := fun x => crateMul x b) (g := fun x => GF256.rawMul x b)
    (crateMul_linear_left b) (rawMul_linear_left b) (fun c hc => hb c hc b) a

/-! ### Primitive steps of the translation -/

/-- The loop counter (`i32`) at iteration `k`. -/
def idx (k : ℕ) : I32 := ⟨BitVec.ofNat 32 k⟩

private theorem idx_lt (k : ℕ) (hk : k < 8) : idx k < 8#i32 := by
  interval_cases k <;> decide

private theorem idx_eight_not_lt : ¬ (idx 8 < 8#i32) := by decide

private theorem idx_add (k : ℕ) (hk : k < 8) : (idx k + 1#i32 : Result I32) = ok (idx (k + 1)) := by
  interval_cases k <;> rfl

private theorem seven : (8#i32 - 1#i32 : Result I32) = ok 7#i32 := rfl

private theorem seven_sub (k : ℕ) (hk : k < 8) : (7#i32 - idx k : Result I32) = ok (idx (7 - k)) := by
  interval_cases k <;> rfl

private theorem shl_i8 (x : I8) (k : ℕ) (hk : k < 8) : (x <<< idx k : Result I8) = ok ⟨x.bv <<< k⟩ := by
  interval_cases k <;> rfl

private theorem sar_i8 (y : I8) : (y >>> 7#i32 : Result I8) = ok ⟨y.bv.sshiftRight 7⟩ := rfl

private theorem shl_u8 (b : U8) (k : ℕ) (hk : k < 8) : (b <<< idx k : Result U8) = ok ⟨b.bv <<< k⟩ := by
  interval_cases k <;> rfl

private theorem shr_u8 (b : U8) (k : ℕ) (hk : k < 8) : (b >>> idx k : Result U8) = ok ⟨b.bv >>> k⟩ := by
  interval_cases k <;> rfl

private theorem shr_u8_one (b : U8) : (b >>> 1#i32 : Result U8) = ok ⟨b.bv >>> 1⟩ := rfl

private theorem hcast_u8_i8 (a : U8) : UScalar.hcast .I8 a = (⟨a.bv⟩ : I8) := rfl

private theorem hcast_i8_u8 (y : I8) : IScalar.hcast .U8 y = (⟨y.bv⟩ : U8) := by
  have h : ∀ v : BitVec 8, v.signExtend 8 = v := fun v => BitVec.signExtend_eq v
  exact congrArg (fun v => (⟨v⟩ : U8)) (h y.bv)

/-! ### `naive_widening_mul` and `naive_wrapping_mul` -/

private theorem wide_loop_unfold (a b lo hi : U8) (i : I32) :
    gf256_aes.p.__p8_gen.p8.naive_widening_mul_loop a b lo hi i =
      Std.bind (gf256_aes.p.__p8_gen.p8.naive_widening_mul_loop.body a b lo hi i) (fun r =>
        match r with
        | .cont s => gf256_aes.p.__p8_gen.p8.naive_widening_mul_loop a b s.1 s.2.1 s.2.2
        | .done v => ok v) := by
  unfold gf256_aes.p.__p8_gen.p8.naive_widening_mul_loop
  rw [loop]
  congr 1
  funext r
  cases r <;> rfl

theorem wide_loop (a b : U8) (n : ℕ) : ∀ k, k + n = 8 → ∀ lo hi : U8,
    gf256_aes.p.__p8_gen.p8.naive_widening_mul_loop a b lo hi (idx k) =
      ok (⟨(wideFrom a.bv b.bv k n (lo.bv, hi.bv)).1⟩, ⟨(wideFrom a.bv b.bv k n (lo.bv, hi.bv)).2⟩) := by
  induction n with
  | zero =>
    intro k hk lo hi
    obtain rfl : k = 8 := by omega
    rw [wide_loop_unfold]
    simp only [gf256_aes.p.__p8_gen.p8.naive_widening_mul_loop.body, idx_eight_not_lt,
      ↓reduceIte, bind_ok, wideFrom]
  | succ n ih =>
    intro k hk lo hi
    have hk8 : k < 8 := by omega
    rw [wide_loop_unfold]
    simp only [gf256_aes.p.__p8_gen.p8.naive_widening_mul_loop.body, idx_lt k hk8, ↓reduceIte,
      lift, bind_ok, hcast_u8_i8, seven, seven_sub k hk8, shl_i8 _ _ (show 7 - k < 8 by omega),
      sar_i8, hcast_i8_u8, shl_u8 _ _ hk8, shr_u8 _ _ (show 7 - k < 8 by omega), idx_add k hk8]
    rw [ih (k + 1) (by omega)]
    rfl

private theorem wrap_loop_unfold (a b x : U8) (i : I32) :
    gf256_aes.p.__p8_gen.p8.naive_wrapping_mul_loop a b x i =
      Std.bind (gf256_aes.p.__p8_gen.p8.naive_wrapping_mul_loop.body a b x i) (fun r =>
        match r with
        | .cont s => gf256_aes.p.__p8_gen.p8.naive_wrapping_mul_loop a b s.1 s.2
        | .done v => ok v) := by
  unfold gf256_aes.p.__p8_gen.p8.naive_wrapping_mul_loop
  rw [loop]
  congr 1
  funext r
  cases r <;> rfl

theorem wrap_loop (a b : U8) (n : ℕ) : ∀ k, k + n = 8 → ∀ x : U8,
    gf256_aes.p.__p8_gen.p8.naive_wrapping_mul_loop a b x (idx k) =
      ok ⟨wrapFrom a.bv b.bv k n x.bv⟩ := by
  induction n with
  | zero =>
    intro k hk x
    obtain rfl : k = 8 := by omega
    rw [wrap_loop_unfold]
    simp only [gf256_aes.p.__p8_gen.p8.naive_wrapping_mul_loop.body, idx_eight_not_lt,
      ↓reduceIte, bind_ok, wrapFrom]
  | succ n ih =>
    intro k hk x
    have hk8 : k < 8 := by omega
    rw [wrap_loop_unfold]
    simp only [gf256_aes.p.__p8_gen.p8.naive_wrapping_mul_loop.body, idx_lt k hk8, ↓reduceIte,
      lift, bind_ok, hcast_u8_i8, seven, seven_sub k hk8, shl_i8 _ _ (show 7 - k < 8 by omega),
      sar_i8, hcast_i8_u8, shl_u8 _ _ hk8, idx_add k hk8]
    rw [ih (k + 1) (by omega)]
    rfl

@[step]
theorem widening_mul_spec (a b : U8) :
    gf256_aes.p.__p8_gen.p8.widening_mul a b ⦃ r =>
      r = (⟨(widening a.bv b.bv).1⟩, ⟨(widening a.bv b.bv).2⟩) ⦄ := by
  simp only [gf256_aes.p.__p8_gen.p8.widening_mul, gf256_aes.p.__p8_gen.p8.naive_widening_mul]
  rw [show (0#i32 : I32) = idx 0 from rfl, wide_loop a b 8 0 rfl]
  simp only [bind_ok, shr_u8_one]
  exact (spec_ok _).mpr rfl

@[step]
theorem wrapping_mul_spec (a b : U8) :
    gf256_aes.p.__p8_gen.p8.wrapping_mul a b ⦃ r => r = ⟨wrapping a.bv b.bv⟩ ⦄ := by
  simp only [gf256_aes.p.__p8_gen.p8.wrapping_mul, gf256_aes.p.__p8_gen.p8.naive_wrapping_mul]
  rw [show (0#i32 : I32) = idx 0 from rfl, wrap_loop a b 8 0 rfl]
  simp only [bind_ok, spec_ok]
  rfl

@[step]
theorem add_p8_spec (a b : U8) :
    gf256_aes.p.__p8_gen.p8.Insts.CoreOpsArithAddp8p8.add a b ⦃ r => r = a ^^^ b ⦄ := by
  simp only [gf256_aes.p.__p8_gen.p8.Insts.CoreOpsArithAddp8p8.add, gf256_aes.p.__p8_gen.p8.add,
    lift, bind_ok, spec_ok]

/-! ### The Barrett constant

`size_of::<u8>()` is not modelled by the Aeneas library at the pinned commit: the extraction
declares `gf256_aes.core.mem.size_of` as an uninterpreted function. The results below assume
`size_of::<u8>() = 1`, which the Rust reference guarantees. -/

/-- The hypothesis on the uninterpreted `size_of`: a `u8` occupies one byte. -/
abbrev SizeOfU8 : Prop := gf256_aes.core.mem.size_of Std.U8 = ok 1#usize

private theorem lz16 (v m : ℕ) (hv : v < 2 ^ 16) (h1 : 2 ^ m ≤ v) (h2 : v < 2 ^ (m + 1)) :
    core.num.U16.leading_zeros (⟨BitVec.ofNat 16 v⟩ : U16) = ⟨BitVec.ofNat 32 (16 - m - 1)⟩ := by
  have hne : BitVec.ofNat 16 v ≠ 0 := by
    intro h
    have h' := congrArg BitVec.toNat h
    rw [BitVec.toNat_ofNat, Nat.mod_eq_of_lt hv] at h'
    simp at h'
    have := Nat.one_le_two_pow (n := m)
    omega
  have hlz : BitVec.leadingZeros (BitVec.ofNat 16 v) = 16 - m - 1 := by
    unfold BitVec.leadingZeros
    simp only [hne, ↓reduceIte]
    rw [BitVec.toNat_ofNat, Nat.mod_eq_of_lt hv, Nat.log_eq_of_pow_le_of_lt_pow h1 h2]
  show (⟨(BitVec.leadingZeros (BitVec.ofNat 16 v) : BitVec 32)⟩ : U32) = _
  rw [hlz]
  rfl

private theorem lz_1B00 : core.num.U16.leading_zeros 0x1B00#u16 = 3#u32 :=
  lz16 0x1B00 12 (by norm_num) (by norm_num) (by norm_num)
private theorem lz_11B : core.num.U16.leading_zeros 0x11B#u16 = 7#u32 :=
  lz16 0x11B 8 (by norm_num) (by norm_num) (by norm_num)
private theorem lz_AB0 : core.num.U16.leading_zeros 0xAB0#u16 = 4#u32 :=
  lz16 0xAB0 11 (by norm_num) (by norm_num) (by norm_num)
private theorem lz_268 : core.num.U16.leading_zeros 0x268#u16 = 6#u32 :=
  lz16 0x268 9 (by norm_num) (by norm_num) (by norm_num)
private theorem lz_5E : core.num.U16.leading_zeros 0x5E#u16 = 9#u32 :=
  lz16 0x5E 6 (by norm_num) (by norm_num) (by norm_num)

private theorem div_loop_unfold (a b x : U16) :
    gf256_aes.p.__p16_gen.p16.naive_checked_div_loop a b x =
      Std.bind (gf256_aes.p.__p16_gen.p16.naive_checked_div_loop.body b a x) (fun r =>
        match r with
        | .cont s => gf256_aes.p.__p16_gen.p16.naive_checked_div_loop s.1 b s.2
        | .done v => ok v) := by
  unfold gf256_aes.p.__p16_gen.p16.naive_checked_div_loop
  rw [loop]
  congr 1
  funext r
  cases r <;> rfl

/-- The polynomial quotient `(x^12 + x^11 + x^9 + x^8) / (x^8 + x^4 + x^3 + x + 1)`, i.e.
`0x1B00 / 0x11B = 0x1A`, the division the crate evaluates for its Barrett constant. Three
iterations of the long division, then the stop test. -/
theorem naive_div_barrett :
    gf256_aes.p.__p16_gen.p16.naive_div 0x1B00#u16 0x11B#u16 = ok 0x1A#u16 := by
  simp only [gf256_aes.p.__p16_gen.p16.naive_div, gf256_aes.p.__p16_gen.p16.naive_checked_div,
    show ¬ ((0x11B#u16 : U16) = 0#u16) from by decide, ↓reduceIte]
  rw [div_loop_unfold]
  simp only [gf256_aes.p.__p16_gen.p16.naive_checked_div_loop.body, lift, bind_ok, lz_1B00, lz_11B,
    show (3#u32 ≤ 7#u32) from by decide, ↓reduceIte,
    show (7#u32 - 3#u32 : Result U32) = ok 4#u32 from rfl,
    show (1#u16 <<< 4#u32 : Result U16) = ok 0x10#u16 from rfl,
    show (0x11B#u16 <<< 4#u32 : Result U16) = ok 0x11B0#u16 from rfl,
    show (0x1B00#u16 ^^^ 0x11B0#u16 : U16) = 0xAB0#u16 from rfl,
    show (0#u16 ^^^ 0x10#u16 : U16) = 0x10#u16 from rfl]
  rw [div_loop_unfold]
  simp only [gf256_aes.p.__p16_gen.p16.naive_checked_div_loop.body, lift, bind_ok, lz_AB0, lz_11B,
    show (4#u32 ≤ 7#u32) from by decide, ↓reduceIte,
    show (7#u32 - 4#u32 : Result U32) = ok 3#u32 from rfl,
    show (1#u16 <<< 3#u32 : Result U16) = ok 0x8#u16 from rfl,
    show (0x11B#u16 <<< 3#u32 : Result U16) = ok 0x8D8#u16 from rfl,
    show (0xAB0#u16 ^^^ 0x8D8#u16 : U16) = 0x268#u16 from rfl,
    show (0x10#u16 ^^^ 0x8#u16 : U16) = 0x18#u16 from rfl]
  rw [div_loop_unfold]
  simp only [gf256_aes.p.__p16_gen.p16.naive_checked_div_loop.body, lift, bind_ok, lz_268, lz_11B,
    show (6#u32 ≤ 7#u32) from by decide, ↓reduceIte,
    show (7#u32 - 6#u32 : Result U32) = ok 1#u32 from rfl,
    show (1#u16 <<< 1#u32 : Result U16) = ok 0x2#u16 from rfl,
    show (0x11B#u16 <<< 1#u32 : Result U16) = ok 0x236#u16 from rfl,
    show (0x268#u16 ^^^ 0x236#u16 : U16) = 0x5E#u16 from rfl,
    show (0x18#u16 ^^^ 0x2#u16 : U16) = 0x1A#u16 from rfl]
  rw [div_loop_unfold]
  simp only [gf256_aes.p.__p16_gen.p16.naive_checked_div_loop.body, lift, bind_ok, lz_5E, lz_11B,
    show ¬ (9#u32 ≤ 7#u32) from by decide, ↓reduceIte]

@[step]
theorem barrett_spec (hsize : SizeOfU8) :
    gf256_aes.__gf256_aes_gen.gf256_aes.BARRET_CONSTANT ⦃ c => c = 0x1A#u8 ⦄ := by
  unfold gf256_aes.__gf256_aes_gen.gf256_aes.BARRET_CONSTANT
  rw [hsize]
  step*
  have h6 : i6 = 0x1B00#u16 := by
    apply (UScalar.eq_equiv_bv_eq _ _).mpr
    have h5 : i5.val = 8 := by scalar_tac
    simp only [i6_post1, i_post1, h5]
    rfl
  have h9 : i9 = 0x11B#u16 := by
    apply (UScalar.eq_equiv_bv_eq _ _).mpr
    have h8 : i8.val = 0 := by scalar_tac
    simp only [i9_post1, h8]
    rfl
  rw [h6, h9, naive_div_barrett]
  simp only [bind_ok, lift, spec_ok]
  rfl

/-- With `size_of::<u8>() = 1`, the crate's `mul` never panics and computes `crateMul`. -/
theorem mul_spec (hsize : SizeOfU8) (a b : U8) :
    gf256_aes.__gf256_aes_gen.gf256_aes.mul a b ⦃ c => c = ⟨crateMul a.bv b.bv⟩ ⦄ := by
  unfold gf256_aes.__gf256_aes_gen.gf256_aes.mul
  rw [hsize]
  step*
  have h2 : i2.val = 0 := by scalar_tac
  have h6 : i6.val = 0 := by scalar_tac
  have h9 : i9.val = 0 := by scalar_tac
  have h3 : i3.bv = a.bv := by simp only [i3_post1, h2, BitVec.shiftLeft_zero]
  have h7 : i7.bv = 0x1B#8 := by
    simp only [i7_post1, h6, i4_post1, BitVec.shiftLeft_zero]
    rfl
  apply (UScalar.eq_equiv_bv_eq _ _).mpr
  simp only [i10_post1, h9, BitVec.ushiftRight_zero, x_post, p3_post, p2_post, p1_post, lo_post,
    hi_post, p_post, h3, h7]
  rfl

/-! ### Main results -/

/-- **Refinement of the gf256 crate's multiplication.** If `size_of::<u8>()` returns `1`, the
extracted `gf256_aes::mul` (crate gf256 0.3.1, polynomial `0x11B`, `no-tables`, `no-xmul`)
never panics and returns WideTrail's `GF256.rawMul` of the two bytes. -/
theorem gf256crate_mul_refines (hsize : SizeOfU8) (a b : U8) :
    gf256_aes.__gf256_aes_gen.gf256_aes.mul a b = ok ⟨GF256.rawMul a.bv b.bv⟩ := by
  obtain ⟨v, hv, hpost⟩ := (spec_iff_exists_ok _ _).mp (mul_spec hsize a b)
  rw [hv, hpost, crateMul_eq_rawMul]

/-- The same in WideTrail's field `GF256`. -/
theorem gf256crate_mul_field (hsize : SizeOfU8) (a b : U8) :
    gf256_aes.__gf256_aes_gen.gf256_aes.mul a b = ok (ofField (toField a * toField b)) :=
  gf256crate_mul_refines hsize a b

/-- The gf256 crate and `crates/kernels` compute the same products: both translations return
the same byte for every pair of inputs. -/
theorem gf256crate_mul_eq_kernels (hsize : SizeOfU8) (a b : U8) :
    gf256_aes.__gf256_aes_gen.gf256_aes.mul a b = cryptificate_kernels.gf256.mul a b := by
  rw [gf256crate_mul_refines hsize, gf256_mul_refines]

end Cryptificate.Refinement.Gf256Crate
