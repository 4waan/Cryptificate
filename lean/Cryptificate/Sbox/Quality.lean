import Cryptificate.Sbox

/-!
# Differential uniformity and linearity of a byte S-box

Two standard measures of a byte S-box `F : GF(2⁸) → GF(2⁸)`, stated over WideTrail's
definitions and with an exact value for a concrete table:

* **differential uniformity**, `differentialUniformity F`: the largest entry of the difference
  distribution table outside the row `a = 0`, i.e. the maximum over `a ≠ 0` and `b` of
  `diffCount F a b = #{x : F (x + a) - F x = b}` (WideTrail's `diffCount`; in characteristic
  two `+` and `-` are both xor). `differentialUniformity F ≤ u` is WideTrail's
  `IsDiffUniform F u` (`isDiffUniform_iff`), the hypothesis of its trail-probability results.
* **linearity**, `linearity F`: the largest absolute Walsh coefficient
  `walsh F a b = ∑ x, (-1) ^ (a · x + b · F x)` over all `a` and all `b ≠ 0`, where `a · x` is
  the inner product of the bit vectors over `GF(2)` (`dot`).

For the AES S-box these are `4` and `32` (`aes_sbox_differentialUniformity`,
`aes_sbox_linearity`). A linearity of `32` is the usual nonlinearity `112 = 128 - 32 / 2`; this
file states the Walsh value and does not define nonlinearity separately.

Both are properties of one table. They are not a bound on a trail, a differential or a linear
hull of a cipher, and they say nothing about keys.

## How the kernel checks them

Evaluating the definitions directly would cost `2⁸ · 2⁸ · 2⁸` table look-ups, far beyond what
`decide` can do. The checks below work on natural numbers instead, whose arithmetic the kernel
performs with GMP, and each one is proved equal to, or sound for, the definition once, here:

* `packTable f` packs the table into one number, entry `x` in bits `8x … 8x + 7`, and `byteAt`
  reads an entry back with a shift and a mask (`byteAt_packTable`).
* **Difference table rows.** For each `a`, `ddtCounts T a` adds `2 ^ (10 · d)` for the output
  difference `d` of every input, so the number holds the whole row of the table as `256`
  counters of ten bits (`ddtCounts_eq`). One addition and one mask then test every counter
  of the row against the bound at once (`ddtRowBounded`, `count_le_of_ddtRowBounded`): a
  counter above `u` is exactly one that sets bit `9` of its field after `511 - u` is added.
* **Walsh coefficients.** For an output mask `b`, the Boolean function `x ↦ b · F x` becomes a
  row of `256` counters (`spreadOf`), and a fast Walsh-Hadamard transform in counting form
  turns it, in eight butterfly stages of a few operations each on the whole row, into the
  number of inputs on which `b · F x` and `a · x` differ, for every input mask `a` at once
  (`fwhtStage_eq`, `tIter_eight`). That number `c` gives `walsh F a b = 256 - 2c`, and the
  same add-and-mask test bounds all `256` of them. The output masks are visited by a walk over
  the subsets of the eight bit positions, one xor of a basis function per step (`xorWalk`,
  `xorSel_basis`).

`differentialUniformity_tableSbox` and `linearity_tableSbox` turn a successful check and a
witness `(a, b)`, recounted directly, into the exact value. The AES S-box values are checked
once in this file through `aes_sbox_eq_table`, so a certificate for a candidate that names the
AES S-box does not evaluate a table.
-/

set_option autoImplicit false

namespace Cryptificate

open Finset

/-! ### The two measures -/

/-- The differential uniformity of `F`: the largest number of inputs `x` with
`F (x + a) - F x = b`, over all input differences `a ≠ 0` and output differences `b`. -/
def differentialUniformity (F : GF256 → GF256) : ℕ :=
  (univ.filter (· ≠ (0 : GF256))).sup fun a => univ.sup fun b => diffCount F a b

/-- `bitDot k a x`: the inner product over `GF(2)` of the low `k` bits of `a` and `x`, the xor
of `aᵢ ∧ xᵢ` for `i < k`. -/
def bitDot : ℕ → ℕ → ℕ → Bool
  | 0, _, _ => false
  | k + 1, a, x => bitDot k a x ^^ (a.testBit k && x.testBit k)

/-- The inner product `a · x` of two bytes as bit vectors over `GF(2)`. -/
def dot (a x : GF256) : Bool := bitDot 8 a.val.toNat x.val.toNat

/-- The Walsh coefficient of `F` at the input mask `a` and output mask `b`:
`∑ x, (-1) ^ (a · x + b · F x)`, i.e. the number of `x` with `a · x = b · F x` minus the number
of `x` without. -/
def walsh (F : GF256 → GF256) (a b : GF256) : ℤ :=
  ∑ x, if dot a x = dot b (F x) then 1 else -1

/-- The linearity of `F`: the largest absolute Walsh coefficient over all input masks `a` and
all nonzero output masks `b`. -/
def linearity (F : GF256 → GF256) : ℕ :=
  univ.sup fun a => (univ.filter (· ≠ (0 : GF256))).sup fun b => (walsh F a b).natAbs

/-- **Differential uniformity is WideTrail's uniformity bound.** -/
theorem isDiffUniform_iff (F : GF256 → GF256) (u : ℕ) :
    IsDiffUniform F u ↔ differentialUniformity F ≤ u := by
  simp only [IsDiffUniform, differentialUniformity, Finset.sup_le_iff, mem_filter, mem_univ,
    true_and, true_implies]

/-- A bound on every count at a nonzero input difference and one count attaining it give the
exact differential uniformity. -/
theorem differentialUniformity_eq {F : GF256 → GF256} {u : ℕ} (h : IsDiffUniform F u)
    {a b : GF256} (ha : a ≠ 0) (hw : diffCount F a b = u) : differentialUniformity F = u := by
  refine le_antisymm ((isDiffUniform_iff F u).mp h) ?_
  rw [← hw]
  exact le_trans (Finset.le_sup (f := fun b => diffCount F a b) (mem_univ b))
    (Finset.le_sup (f := fun a => univ.sup fun b => diffCount F a b) (by simpa using ha))

/-- A bound on every Walsh coefficient at a nonzero output mask and one coefficient attaining
it give the exact linearity. -/
theorem linearity_eq {F : GF256 → GF256} {l : ℕ}
    (h : ∀ a b, b ≠ 0 → (walsh F a b).natAbs ≤ l)
    {a b : GF256} (hb : b ≠ 0) (hw : (walsh F a b).natAbs = l) : linearity F = l := by
  refine le_antisymm ?_ ?_
  · simp only [linearity, Finset.sup_le_iff, mem_filter, mem_univ, true_and]
    exact fun a _ b hb => h a b hb
  · rw [← hw]
    exact le_trans
      (Finset.le_sup (f := fun b => (walsh F a b).natAbs) (by simpa using hb))
      (Finset.le_sup (f := fun a => (univ.filter (· ≠ (0 : GF256))).sup
        fun b => (walsh F a b).natAbs) (mem_univ a))

/-! ### Loops the kernel runs

The checks are written with `Nat.rec` and with `Nat.add`, `Nat.shiftRight`, `Nat.land` and
`Nat.xor` applied directly, so that the kernel unfolds as little as possible per step and does
the arithmetic with GMP. -/

/-! The loops use the `Nat` functions themselves; these rewrite them to the usual notation. -/

theorem nat_shiftLeft (a b : ℕ) : Nat.shiftLeft a b = a * 2 ^ b := Nat.shiftLeft_eq a b
theorem nat_shiftRight (a b : ℕ) : Nat.shiftRight a b = a / 2 ^ b := Nat.shiftRight_eq_div_pow a b
theorem nat_xor (a b : ℕ) : Nat.xor a b = a ^^^ b := rfl
theorem nat_land (a b : ℕ) : Nat.land a b = a &&& b := rfl
theorem nat_mod (a b : ℕ) : Nat.mod a b = a % b := rfl
theorem nat_sub (a b : ℕ) : Nat.sub a b = a - b := rfl
theorem nat_pow (a b : ℕ) : Nat.pow a b = a ^ b := rfl
theorem nat_div (a b : ℕ) : Nat.div a b = a / b := rfl
theorem nat_beq (a b : ℕ) : Nat.beq a b = decide (a = b) := by
  cases h : Nat.beq a b
  · exact (decide_eq_false (Nat.ne_of_beq_eq_false h)).symm
  · exact (decide_eq_true (Nat.eq_of_beq_eq_true h)).symm
theorem nat_ble (a b : ℕ) : Nat.ble a b = decide (a ≤ b) := by
  rw [Bool.eq_iff_iff, decide_eq_true_iff, Nat.ble_eq]

/-- `natIter step n acc` applies `step (n - 1)`, …, `step 0` to `acc`, in that order. -/
def natIter (step : ℕ → ℕ → ℕ) (n : ℕ) : ℕ → ℕ :=
  Nat.rec (motive := fun _ => ℕ → ℕ) (fun acc => acc) (fun i ih acc => ih (step i acc)) n

theorem natIter_add (g : ℕ → ℕ) (n acc : ℕ) :
    natIter (fun i c => Nat.add c (g i)) n acc = acc + ∑ i ∈ range n, g i := by
  induction n generalizing acc with
  | zero => rfl
  | succ n ih =>
    change natIter (fun i c => Nat.add c (g i)) n (acc + g n) = _
    rw [ih, sum_range_succ]
    ring

/-- `allBelow p n` holds when `p i` holds for every `i < n`. -/
def allBelow (p : ℕ → Bool) (n : ℕ) : Bool :=
  Nat.rec (motive := fun _ => Bool) true (fun i ih => and (p i) ih) n

theorem of_allBelow {p : ℕ → Bool} {n : ℕ} (h : allBelow p n = true) :
    ∀ i < n, p i = true := by
  induction n with
  | zero => intro i hi; omega
  | succ n ih =>
    change (p n && allBelow p n) = true at h
    rw [Bool.and_eq_true] at h
    intro i hi
    rcases Nat.lt_succ_iff_lt_or_eq.mp hi with hi | rfl
    · exact ih h.2 i hi
    · exact h.1

/-! ### Numbers as rows of fixed-width fields -/

section Fields

variable (w : ℕ) (e : ℕ → ℕ)

theorem fields_lt {n : ℕ} (he : ∀ i < n, e i < 2 ^ w) :
    ∑ i ∈ range n, e i * 2 ^ (w * i) < 2 ^ (w * n) := by
  induction n with
  | zero => simp
  | succ n ih =>
    rw [sum_range_succ]
    have h1 := ih (fun i hi => he i (by omega))
    have h2 : e n + 1 ≤ 2 ^ w := he n (by omega)
    calc ∑ i ∈ range n, e i * 2 ^ (w * i) + e n * 2 ^ (w * n)
        < 2 ^ (w * n) + e n * 2 ^ (w * n) := by omega
      _ = (e n + 1) * 2 ^ (w * n) := by ring
      _ ≤ 2 ^ w * 2 ^ (w * n) := Nat.mul_le_mul_right _ h2
      _ = 2 ^ (w * (n + 1)) := by rw [← pow_add]; ring_nf

/-- Field `j` of a row of `w`-bit fields is the `j`-th entry. -/
theorem fields_div_mod {n : ℕ} (he : ∀ i < n, e i < 2 ^ w) {j : ℕ} (hj : j < n) :
    (∑ i ∈ range n, e i * 2 ^ (w * i)) / 2 ^ (w * j) % 2 ^ w = e j := by
  induction n with
  | zero => omega
  | succ n ih =>
    rw [sum_range_succ]
    have hpos : 0 < 2 ^ (w * j) := Nat.pos_of_ne_zero (by positivity)
    rcases Nat.lt_succ_iff_lt_or_eq.mp hj with hj | rfl
    · have hsplit : e n * 2 ^ (w * n) = (e n * 2 ^ (w * (n - j - 1)) * 2 ^ w) * 2 ^ (w * j) := by
        obtain ⟨m, hm⟩ : ∃ m, n = m + 1 + j := ⟨n - j - 1, by omega⟩
        rw [show n - j - 1 = m by omega, hm]
        ring
      rw [hsplit, Nat.add_mul_div_right _ _ hpos, Nat.add_mul_mod_self_right]
      exact ih (fun i hi => he i (by omega)) hj
    · rw [Nat.add_mul_div_right _ _ hpos,
        Nat.div_eq_of_lt (fields_lt w e (fun i hi => he i (by omega))), Nat.zero_add,
        Nat.mod_eq_of_lt (he j (by omega))]

/-- Bit `w · j + r` of a row of `w`-bit fields is bit `r` of field `j`. -/
theorem testBit_fields {n : ℕ} (he : ∀ i < n, e i < 2 ^ w) {j r : ℕ} (hr : r < w) :
    (∑ i ∈ range n, e i * 2 ^ (w * i)).testBit (w * j + r) =
      (decide (j < n) && (e j).testBit r) := by
  by_cases hj : j < n
  · have h := congrArg (fun m => m.testBit r) (fields_div_mod w e he hj)
    simp only [Nat.testBit_mod_two_pow, Nat.testBit_div_two_pow, decide_eq_true hr,
      Bool.true_and] at h
    rw [Nat.add_comm, h]
    simp [hj]
  · rw [Nat.testBit_lt_two_pow]
    · simp [hj]
    · calc _ < 2 ^ (w * n) := fields_lt w e he
        _ ≤ 2 ^ (w * j + r) := Nat.pow_le_pow_right (by norm_num)
            (le_trans (Nat.mul_le_mul_left w (by omega)) (Nat.le_add_right _ _))

end Fields

/-! Rows of `256` ten-bit fields, the layout of every packed computation below. Bitwise and
arithmetic operations act field by field as long as no field overflows. -/

/-- The number whose ten-bit field `p < 256` holds `e p`. -/
abbrev row10 (e : ℕ → ℕ) : ℕ := ∑ p ∈ range 256, e p * 2 ^ (10 * p)

theorem testBit_row10 {e : ℕ → ℕ} (he : ∀ p < 256, e p < 2 ^ 10) {q r : ℕ} (hr : r < 10) :
    (row10 e).testBit (10 * q + r) = (decide (q < 256) && (e q).testBit r) :=
  testBit_fields 10 e he hr

/-- A number whose bit `10 q + r` is bit `r` of `e q` (zero for `q ≥ 256`) is `row10 e`. -/
theorem eq_row10 {X : ℕ} {e : ℕ → ℕ} (he : ∀ p < 256, e p < 2 ^ 10)
    (h : ∀ q r, r < 10 → X.testBit (10 * q + r) = (decide (q < 256) && (e q).testBit r)) :
    X = row10 e := by
  apply Nat.eq_of_testBit_eq
  intro i
  have hi : i = 10 * (i / 10) + i % 10 := (Nat.div_add_mod i 10).symm
  have hr : i % 10 < 10 := Nat.mod_lt _ (by norm_num)
  rw [hi, h _ _ hr, testBit_row10 he hr]

theorem land_row10 {a b : ℕ → ℕ} (ha : ∀ p < 256, a p < 2 ^ 10) (hb : ∀ p < 256, b p < 2 ^ 10) :
    row10 a &&& row10 b = row10 fun p => a p &&& b p := by
  refine eq_row10 (fun p hp => Nat.and_lt_two_pow _ (hb p hp)) fun q r hr => ?_
  rw [Nat.testBit_and, testBit_row10 ha hr, testBit_row10 hb hr, Nat.testBit_and]
  cases decide (q < 256) <;> simp

theorem shiftRight_row10 {a : ℕ → ℕ} (ha : ∀ p < 256, a p < 2 ^ 10) (s : ℕ) :
    row10 a >>> (10 * s) = row10 fun p => if p + s < 256 then a (p + s) else 0 := by
  refine eq_row10 (fun p _ => ?_) fun q r hr => ?_
  · split
    · exact ha _ (by assumption)
    · norm_num
  · rw [Nat.testBit_shiftRight, show 10 * s + (10 * q + r) = 10 * (q + s) + r by ring,
      testBit_row10 ha hr]
    by_cases h : q + s < 256
    · simp [h, show q < 256 by omega]
    · simp [h]

theorem shiftLeft_row10 {d : ℕ → ℕ} (hd : ∀ p < 256, d p < 2 ^ 10) (s : ℕ)
    (hz : ∀ p < 256, 256 ≤ p + s → d p = 0) :
    row10 d <<< (10 * s) = row10 fun p => if s ≤ p then d (p - s) else 0 := by
  refine eq_row10 (fun p hp => ?_) fun q r hr => ?_
  · split
    · exact hd _ (by omega)
    · norm_num
  · rw [Nat.testBit_shiftLeft]
    by_cases hqs : s ≤ q
    · rw [show 10 * q + r - 10 * s = 10 * (q - s) + r by omega, testBit_row10 hd hr]
      by_cases hq : q < 256
      · simp [hqs, hq, show q - s < 256 by omega, show 10 * s ≤ 10 * q + r by omega]
      · by_cases hqs' : q - s < 256
        · rw [hz _ hqs' (by omega)]
          simp
        · simp [hqs', hq]
    · simp [hqs, show ¬ (10 * s ≤ 10 * q + r) by omega]

theorem add_row10 (a b : ℕ → ℕ) : row10 a + row10 b = row10 fun p => a p + b p := by
  simp only [row10, ← sum_add_distrib, add_mul]

theorem sub_row10 {a b : ℕ → ℕ} (h : ∀ p < 256, b p ≤ a p) :
    row10 a - row10 b = row10 fun p => a p - b p := by
  simp only [row10]
  rw [← Finset.sum_tsub_distrib]
  · exact sum_congr rfl fun p _ => (Nat.sub_mul _ _ _).symm
  · exact fun p hp => Nat.mul_le_mul_right _ (h p (mem_range.mp hp))

theorem row10_congr {a b : ℕ → ℕ} (h : ∀ p < 256, a p = b p) : row10 a = row10 b :=
  sum_congr rfl fun p hp => by rw [h p (mem_range.mp hp)]


/-- A number of fields that each count how many of the `x < m` take the value `i`, written as a
sum over the `x`. -/
theorem sum_pow_eq_fields (w m N : ℕ) (d : ℕ → ℕ) (hd : ∀ x < m, d x < N) :
    ∑ x ∈ range m, 2 ^ (w * d x) =
      ∑ i ∈ range N, ((range m).filter (fun x => d x = i)).card * 2 ^ (w * i) := by
  rw [← Finset.sum_fiberwise_of_maps_to (s := range m) (t := range N) (g := d)
    (fun x hx => mem_range.mpr (hd x (mem_range.mp hx)))]
  refine sum_congr rfl fun i _ => ?_
  rw [sum_congr rfl (g := fun _ => 2 ^ (w * i)) (fun x hx => by rw [(mem_filter.mp hx).2]),
    sum_const, smul_eq_mul]

/-! ### Packed tables -/

/-- Entry `x` of a packed table: bits `8x … 8x + 7` of `T`. -/
def byteAt (T x : ℕ) : ℕ := Nat.land (Nat.shiftRight T (Nat.shiftLeft x 3)) 255

/-- The table `f` packed into one number, entry `x` (reduced mod `256`) in bits
`8x … 8x + 7`. -/
def packTable (f : ℕ → ℕ) : ℕ :=
  natIter (fun x T => Nat.add T (Nat.shiftLeft (Nat.mod (f x) 256) (Nat.shiftLeft x 3))) 256 0

theorem byteAt_eq (T x : ℕ) : byteAt T x = T / 2 ^ (8 * x) % 2 ^ 8 := by
  change (T >>> (x <<< 3)) &&& (2 ^ 8 - 1) = _
  rw [Nat.and_two_pow_sub_one_eq_mod, Nat.shiftRight_eq_div_pow, Nat.shiftLeft_eq]
  ring_nf

theorem packTable_eq (f : ℕ → ℕ) :
    packTable f = ∑ x ∈ range 256, f x % 256 * 2 ^ (8 * x) := by
  rw [packTable, natIter_add (fun x => Nat.shiftLeft (Nat.mod (f x) 256) (Nat.shiftLeft x 3)),
    Nat.zero_add]
  refine sum_congr rfl fun x _ => ?_
  rw [nat_shiftLeft, nat_shiftLeft, nat_mod]
  ring_nf

theorem byteAt_packTable (f : ℕ → ℕ) {x : ℕ} (hx : x < 256) :
    byteAt (packTable f) x = f x % 256 := by
  rw [byteAt_eq, packTable_eq]
  exact fields_div_mod 8 (fun x => f x % 256) (fun i _ => Nat.mod_lt _ (by norm_num)) hx

/-! ### Bytes and elements of `GF(2⁸)` -/

theorem gf_toNat (n : ℕ) : (gf n).val.toNat = n % 256 := by
  simp [gf, BitVec.toNat_ofNat]

theorem toNat_lt (x : GF256) : x.val.toNat < 256 := x.val.isLt

/-- A sum over `GF(2⁸)` of a function of the byte value is the sum over the bytes `n < 256`. -/
theorem sum_gf {M : Type*} [AddCommMonoid M] (h : ℕ → M) :
    ∑ x : GF256, h x.val.toNat = ∑ n ∈ range 256, h n := by
  refine Finset.sum_nbij' (fun x => x.val.toNat) gf (fun x _ => mem_range.mpr (toNat_lt x))
    (fun _ _ => mem_univ _) (fun x _ => gf_val_toNat x) (fun n hn => ?_) (fun _ _ => rfl)
  rw [gf_toNat, Nat.mod_eq_of_lt (mem_range.mp hn)]

theorem card_filter_gf (P : ℕ → Prop) [DecidablePred P] :
    (univ.filter fun x : GF256 => P x.val.toNat).card = ((range 256).filter P).card := by
  rw [card_filter, card_filter]
  exact sum_gf (fun n => if P n then 1 else 0)

theorem gf_ne_zero {a : ℕ} (ha : a ≠ 0) (ha' : a < 256) : gf a ≠ 0 := by
  intro h
  have := congrArg (fun z : GF256 => z.val.toNat) h
  simp only [gf_toNat, Nat.mod_eq_of_lt ha'] at this
  exact ha this

theorem toNat_ne_zero {a : GF256} (ha : a ≠ 0) : a.val.toNat ≠ 0 := by
  intro h
  apply ha
  rw [← gf_val_toNat a, h]
  rfl

theorem toNat_add_gf (x : GF256) {a : ℕ} (ha : a < 256) :
    (x + gf a).val.toNat = x.val.toNat ^^^ a := by
  change (x.val ^^^ (gf a).val).toNat = _
  rw [BitVec.toNat_xor, gf_toNat, Nat.mod_eq_of_lt ha]

theorem gf_sub_gf_eq_gf {p q b : ℕ} (hb : b < 256) :
    gf p - gf q = gf b ↔ (p % 256 ^^^ q % 256) = b := by
  constructor
  · intro h
    have := congrArg (fun z : GF256 => z.val.toNat) h
    change (BitVec.ofNat 8 p ^^^ BitVec.ofNat 8 q).toNat = (gf b).val.toNat at this
    rwa [BitVec.toNat_xor, BitVec.toNat_ofNat, BitVec.toNat_ofNat, gf_toNat,
      Nat.mod_eq_of_lt hb] at this
  · intro h
    apply GF256.ext
    apply BitVec.eq_of_toNat_eq
    change (BitVec.ofNat 8 p ^^^ BitVec.ofNat 8 q).toNat = (gf b).val.toNat
    rw [BitVec.toNat_xor, BitVec.toNat_ofNat, BitVec.toNat_ofNat, gf_toNat,
      Nat.mod_eq_of_lt hb]
    exact h

/-! ### Difference table -/

/-- Row `a` of the difference table of the packed table `T`, as `256` counters of ten bits:
the sum of `2 ^ (10 · d)` over the output differences `d` of all inputs. -/
def ddtCounts (T a : ℕ) : ℕ :=
  natIter (fun x C => Nat.add C
    (Nat.shiftLeft 1 (Nat.mul 10 (Nat.xor (byteAt T (Nat.xor x a)) (byteAt T x))))) 256 0

/-- `∑ i < 256, 2 ^ (10 i)`: a one in every ten-bit field. -/
def fieldOnes : ℕ := natIter (fun i R => Nat.add R (Nat.shiftLeft 1 (Nat.mul 10 i))) 256 0

/-- Every ten-bit field of `X` is at most `u`, for fields at most `256`: adding `511 - u` to
every field sets bit `9` of exactly the fields that exceed `u`, so `X` passes when none of
those bits is set. -/
def fieldsAtMost (X u : ℕ) : Bool :=
  Nat.beq (Nat.land (Nat.add X (Nat.mul (Nat.sub 511 u) fieldOnes)) (Nat.mul 512 fieldOnes)) 0

/-- Every counter of row `a` is at most `u`. -/
def ddtRowBounded (T u a : ℕ) : Bool := fieldsAtMost (ddtCounts T a) u

/-- Every row `a = 1, …, 255` of the difference table of `T` is bounded by `u`. -/
def ddtRowsBounded (T u : ℕ) : Bool := allBelow (fun i => ddtRowBounded T u (Nat.add i 1)) 255

/-- One entry of the difference table of `T`, counted input by input. -/
def ddtCountAt (T a b : ℕ) : ℕ :=
  natIter (fun x c => Nat.add c
    (Bool.toNat (Nat.beq (Nat.xor (byteAt T (Nat.xor x a)) (byteAt T x)) b))) 256 0

theorem fieldOnes_eq : fieldOnes = row10 fun _ => 1 := by
  rw [fieldOnes, natIter_add (fun i => Nat.shiftLeft 1 (Nat.mul 10 i)), Nat.zero_add]
  refine sum_congr rfl fun i _ => ?_
  rw [nat_shiftLeft, Nat.mul_eq]

theorem mul_row10 (c : ℕ) (e : ℕ → ℕ) : c * row10 e = row10 fun p => c * e p := by
  simp only [row10, mul_sum, mul_assoc]

/-- **The packed bound test is sound**: if `fieldsAtMost` passes, every field is at most
`u`. -/
theorem le_of_fieldsAtMost {e : ℕ → ℕ} (he : ∀ i < 256, e i ≤ 256) {u : ℕ} (hu : u ≤ 511)
    (h : fieldsAtMost (row10 e) u = true) : ∀ i < 256, e i ≤ u := by
  intro b hb
  by_contra hgt
  have h0 : ((row10 e + (511 - u) * fieldOnes) &&& (512 * fieldOnes)) = 0 :=
    Nat.eq_of_beq_eq_true h
  rw [fieldOnes_eq, mul_row10, mul_row10, add_row10] at h0
  have hY := testBit_row10 (e := fun i => e i + (511 - u) * 1)
    (fun i hi => by have := he i hi; norm_num; omega) (q := b) (r := 9) (by norm_num)
  have hZ := testBit_row10 (e := fun _ => 512 * 1) (fun _ _ => by norm_num) (q := b) (r := 9)
    (by norm_num)
  have hbit := congrArg (fun m => m.testBit (10 * b + 9)) h0
  simp only [Nat.testBit_and, Nat.zero_testBit] at hbit
  rw [hY, hZ] at hbit
  have hd : (e b + (511 - u) * 1).testBit 9 = true := by
    rw [Nat.testBit_eq_decide_div_mod_eq]
    have hlo : 2 ^ 9 ≤ e b + (511 - u) * 1 := by norm_num; omega
    have hhi : e b + (511 - u) * 1 < 2 * 2 ^ 9 := by have := he b hb; norm_num; omega
    rw [Nat.div_eq_of_lt_le (by omega) hhi]
    rfl
  have h512 : (512 * 1).testBit 9 = true := by decide
  rw [hd, h512, decide_eq_true hb] at hbit
  exact Bool.false_ne_true hbit.symm

section Ddt

variable (s : ℕ → ℕ) (a : ℕ)

/-- The output difference of input `x` at input difference `a`. -/
def outDiff (x : ℕ) : ℕ := s (x ^^^ a) ^^^ s x

/-- The number of inputs `x < 256` with output difference `b`. -/
def ddtCount (b : ℕ) : ℕ := ((range 256).filter fun x => outDiff s a x = b).card

variable {s a}

theorem outDiff_lt (hs : ∀ x < 256, s x < 256) (ha : a < 256) {x : ℕ} (hx : x < 256) :
    outDiff s a x < 256 :=
  Nat.xor_lt_two_pow (n := 8) (hs _ (Nat.xor_lt_two_pow (n := 8) hx ha)) (hs x hx)

theorem ddtCount_le (b : ℕ) : ddtCount s a b ≤ 256 :=
  (card_filter_le _ _).trans (by simp)

theorem ddtCounts_eq {T : ℕ} (hT : ∀ x < 256, byteAt T x = s x) (hs : ∀ x < 256, s x < 256)
    (ha : a < 256) :
    ddtCounts T a = ∑ b ∈ range 256, ddtCount s a b * 2 ^ (10 * b) := by
  rw [ddtCounts, natIter_add (fun x => Nat.shiftLeft 1
    (Nat.mul 10 (Nat.xor (byteAt T (Nat.xor x a)) (byteAt T x)))), Nat.zero_add]
  rw [sum_congr rfl (g := fun x => 2 ^ (10 * outDiff s a x)) (fun x hx => by
    have hx := mem_range.mp hx
    rw [nat_shiftLeft, Nat.one_mul, Nat.mul_eq, nat_xor, nat_xor, hT _ hx,
      hT _ (Nat.xor_lt_two_pow (n := 8) hx ha)]
    rfl)]
  exact sum_pow_eq_fields 10 256 256 _ (fun x hx => outDiff_lt hs ha hx)

theorem count_le_of_ddtRowBounded {T u : ℕ} (hT : ∀ x < 256, byteAt T x = s x)
    (hs : ∀ x < 256, s x < 256) (ha : a < 256) (hu : u ≤ 256)
    (h : ddtRowBounded T u a = true) {b : ℕ} (hb : b < 256) : ddtCount s a b ≤ u := by
  unfold ddtRowBounded at h
  rw [ddtCounts_eq hT hs ha] at h
  exact le_of_fieldsAtMost (fun i _ => ddtCount_le i) (by omega) h b hb

end Ddt

/-- The difference-table entry of a table S-box at bytes `a`, `b` is the count over the bytes
`x < 256`. -/
theorem diffCount_tableSbox (f : ℕ → ℕ) {a b : ℕ} (ha : a < 256) (hb : b < 256) :
    diffCount (tableSbox f) (gf a) (gf b) = ddtCount (fun x => f x % 256) a b := by
  rw [diffCount, diffSet, ddtCount]
  have hP : ∀ x : GF256, (tableSbox f (x + gf a) - tableSbox f x = gf b) ↔
      outDiff (fun x => f x % 256) a x.val.toNat = b := by
    intro x
    simp only [tableSbox, outDiff]
    rw [gf_sub_gf_eq_gf hb, toNat_add_gf x ha]
  simp_rw [hP]
  exact card_filter_gf (fun n => outDiff (fun x => f x % 256) a n = b)

theorem ddtCountAt_eq {T : ℕ} {s : ℕ → ℕ} (hT : ∀ x < 256, byteAt T x = s x) {a : ℕ}
    (ha : a < 256) (b : ℕ) : ddtCountAt T a b = ddtCount s a b := by
  rw [ddtCountAt, natIter_add (fun x => Bool.toNat
    (Nat.beq (Nat.xor (byteAt T (Nat.xor x a)) (byteAt T x)) b)), Nat.zero_add, ddtCount,
    card_filter]
  refine sum_congr rfl fun x hx => ?_
  have hx := mem_range.mp hx
  rw [nat_xor, nat_xor, nat_beq, hT _ hx, hT _ (Nat.xor_lt_two_pow (n := 8) hx ha)]
  by_cases h : outDiff s a x = b
  · simp [outDiff] at h; simp [outDiff, h]
  · simp [outDiff] at h; simp [outDiff, h]

/-- **Exact differential uniformity of a table S-box.** If every row `a ≠ 0` of the difference
table of the packed table passes `ddtRowBounded` and the entry at `(a, b)` is `u`, the
differential uniformity is exactly `u`, attained at `(a, b)`. -/
theorem differentialUniformity_tableSbox {f : ℕ → ℕ} {u a b : ℕ} (hu : u ≤ 256) (ha0 : a ≠ 0)
    (ha : a < 256) (hb : b < 256) (hrows : ddtRowsBounded (packTable f) u = true)
    (hw : ddtCountAt (packTable f) a b = u) :
    differentialUniformity (tableSbox f) = u ∧ gf a ≠ 0 ∧
      diffCount (tableSbox f) (gf a) (gf b) = u := by
  have hT : ∀ x < 256, byteAt (packTable f) x = f x % 256 := fun x hx => byteAt_packTable f hx
  have hs : ∀ x < 256, f x % 256 < 256 := fun x _ => Nat.mod_lt _ (by norm_num)
  have hwit : diffCount (tableSbox f) (gf a) (gf b) = u := by
    rw [diffCount_tableSbox f ha hb, ← ddtCountAt_eq hT ha, hw]
  have hbound : IsDiffUniform (tableSbox f) u := by
    intro a' ha' b'
    have h1 := toNat_ne_zero ha'
    have hrow := of_allBelow hrows (a'.val.toNat - 1) (by have := toNat_lt a'; omega)
    rw [show Nat.add (a'.val.toNat - 1) 1 = a'.val.toNat by
      change a'.val.toNat - 1 + 1 = _; omega] at hrow
    rw [← gf_val_toNat a', ← gf_val_toNat b', diffCount_tableSbox f (toNat_lt a') (toNat_lt b')]
    exact count_le_of_ddtRowBounded hT hs (toNat_lt a') hu hrow (toNat_lt b')
  exact ⟨differentialUniformity_eq hbound (gf_ne_zero ha0 ha) hwit, gf_ne_zero ha0 ha, hwit⟩

/-! ### Walsh coefficients -/

/-- The Boolean function `g` on the bytes `x < 256` as a row of `0`/`1` counters: ten-bit
field `x` holds `g x`. -/
def spreadOf (g : ℕ → Bool) : ℕ :=
  natIter (fun x S => Nat.add S (Nat.shiftLeft (Bool.toNat (g x)) (Nat.mul 10 x))) 256 0

theorem spreadOf_eq (g : ℕ → Bool) : spreadOf g = row10 fun x => (g x).toNat := by
  rw [spreadOf, natIter_add (fun x => Nat.shiftLeft (Bool.toNat (g x)) (Nat.mul 10 x)),
    Nat.zero_add]
  refine sum_congr rfl fun x _ => ?_
  rw [nat_shiftLeft, Nat.mul_eq]

theorem toNat_lt_two_pow_ten (c : Bool) : c.toNat < 2 ^ 10 := by
  cases c <;> norm_num

theorem testBit_toNat (c : Bool) {r : ℕ} (hr : r < 10) :
    c.toNat.testBit r = (decide (r = 0) && c) := by
  cases c
  · simp
  · rcases r with _ | r
    · simp
    · rw [Bool.toNat_true, Nat.testBit_lt_two_pow
        (lt_of_lt_of_le (by norm_num : 1 < 2) (Nat.le_self_pow (by omega) 2))]
      simp

/-- The xor of two spread functions is the spread of their pointwise xor. -/
theorem spreadOf_xor (g h : ℕ → Bool) :
    spreadOf g ^^^ spreadOf h = spreadOf fun x => g x ^^ h x := by
  rw [spreadOf_eq, spreadOf_eq, spreadOf_eq]
  refine eq_row10 (fun x _ => toNat_lt_two_pow_ten _) fun q r hr => ?_
  rw [Nat.testBit_xor, testBit_row10 (fun x _ => toNat_lt_two_pow_ten _) hr,
    testBit_row10 (fun x _ => toNat_lt_two_pow_ten _) hr, testBit_toNat _ hr, testBit_toNat _ hr,
    testBit_toNat _ hr]
  cases decide (q < 256) <;> cases decide (r = 0) <;> simp

theorem spreadOf_congr {g h : ℕ → Bool} (hgh : ∀ x < 256, g x = h x) :
    spreadOf g = spreadOf h := by
  rw [spreadOf_eq, spreadOf_eq]
  exact row10_congr fun x hx => by rw [hgh x hx]

theorem spreadOf_false : spreadOf (fun _ => false) = 0 := by
  rw [spreadOf_eq]
  simp

/-- `xorWalk B check k i v` checks `check (i + j) (v ^^^ xorSel B k j)` for every `j < 2 ^ k`,
reaching each value from the previous one with a single xor. -/
def xorWalk (B : ℕ → ℕ) (check : ℕ → ℕ → Bool) (k : ℕ) : ℕ → ℕ → Bool :=
  Nat.rec (motive := fun _ => ℕ → ℕ → Bool) (fun i v => check i v)
    (fun k ih i v => and (ih i v) (ih (Nat.add i (Nat.pow 2 k)) (Nat.xor v (B k)))) k

/-- The xor of the `B j` over the bits `j < k` set in `i`. -/
def xorSel (B : ℕ → ℕ) : ℕ → ℕ → ℕ
  | 0, _ => 0
  | k + 1, i => xorSel B k i ^^^ (if i.testBit k then B k else 0)

theorem xorSel_congr (B : ℕ → ℕ) (k : ℕ) {i i' : ℕ} (h : ∀ j < k, i.testBit j = i'.testBit j) :
    xorSel B k i = xorSel B k i' := by
  induction k with
  | zero => rfl
  | succ k ih =>
    simp only [xorSel]
    rw [ih (fun j hj => h j (by omega)), h k (by omega)]

theorem of_xorWalk {B : ℕ → ℕ} {check : ℕ → ℕ → Bool} {k : ℕ} {i v : ℕ}
    (h : xorWalk B check k i v = true) : ∀ j < 2 ^ k, check (i + j) (v ^^^ xorSel B k j) = true := by
  induction k generalizing i v with
  | zero =>
    intro j hj
    have : j = 0 := by simpa using hj
    subst this
    have h' : check i v = true := h
    simpa [xorSel] using h'
  | succ k ih =>
    change (xorWalk B check k i v && xorWalk B check k (i + 2 ^ k) (v ^^^ B k)) = true at h
    rw [Bool.and_eq_true] at h
    intro j hj
    by_cases hjk : j < 2 ^ k
    · have := ih h.1 j hjk
      simpa [xorSel, Nat.testBit_lt_two_pow hjk] using this
    · obtain ⟨j', rfl⟩ : ∃ j', j = 2 ^ k + j' := ⟨j - 2 ^ k, by omega⟩
      have hj' : j' < 2 ^ k := by rw [pow_succ] at hj; omega
      have := ih h.2 j' hj'
      have hsel : xorSel B (k + 1) (2 ^ k + j') = xorSel B k j' ^^^ B k := by
        simp only [xorSel]
        rw [Nat.testBit_two_pow_add_eq, Nat.testBit_lt_two_pow hj',
          xorSel_congr B k (fun j hj => Nat.testBit_two_pow_add_gt hj j')]
        rfl
      have key : v ^^^ (xorSel B k j' ^^^ B k) = (v ^^^ B k) ^^^ xorSel B k j' := by
        rw [Nat.xor_comm (xorSel B k j') (B k), Nat.xor_assoc]
      rw [hsel, ← Nat.add_assoc, key]
      exact this

/-- The basis of spread functions for the bits of `h x`. -/
theorem xorSel_basis (h : ℕ → ℕ) (k i : ℕ) :
    xorSel (fun j => spreadOf fun x => (h x).testBit j) k i =
      spreadOf fun x => bitDot k i (h x) := by
  induction k with
  | zero => simp only [xorSel, bitDot]; exact spreadOf_false.symm
  | succ k ih =>
    simp only [xorSel, bitDot]
    rw [ih]
    by_cases hb : i.testBit k
    · simp only [hb, if_true, Bool.true_and]
      rw [spreadOf_xor]
    · simp only [hb, Bool.false_eq_true, if_false, Bool.false_and, Bool.xor_false, Nat.xor_zero]

/-- The spread function `x ↦ bit j of entry x` of a packed table, for the output masks. -/
def outBasis (T j : ℕ) : ℕ := spreadOf fun x => Nat.testBit (byteAt T x) j

/-! Facts about one bit of a byte, checked over all bytes. -/

theorem bit_clear_add : ∀ k < 8, ∀ q < 256, q.testBit k = false →
    q + 2 ^ k < 256 ∧ q + 2 ^ k = q ^^^ 2 ^ k := by decide +kernel

theorem bit_clear_sub : ∀ k < 8, ∀ q < 256, q.testBit k = false → 2 ^ k ≤ q →
    (q - 2 ^ k).testBit k = true := by decide +kernel

theorem bit_clear_hi : ∀ k < 8, ∀ q < 256, q.testBit k = false →
    q - q % 2 ^ (k + 1) = q - q % 2 ^ k ∧
      (q ^^^ 2 ^ k) - (q ^^^ 2 ^ k) % 2 ^ k = q - q % 2 ^ k + 2 ^ k := by decide +kernel

theorem bit_set_sub : ∀ k < 8, ∀ q < 256, q.testBit k = true →
    2 ^ k ≤ q ∧ q - 2 ^ k = q ^^^ 2 ^ k := by decide +kernel

theorem bit_set_hi : ∀ k < 8, ∀ q < 256, q.testBit k = true →
    q - q % 2 ^ (k + 1) = (q ^^^ 2 ^ k) - (q ^^^ 2 ^ k) % 2 ^ k ∧
      q - q % 2 ^ (k + 1) + 2 ^ k = q - q % 2 ^ k := by decide +kernel


theorem xor_two_pow_lt {k q : ℕ} (hk : k < 8) (hq : q < 256) : q ^^^ 2 ^ k < 256 :=
  Nat.xor_lt_two_pow (n := 8) hq (Nat.pow_lt_pow_right (by norm_num) hk)

theorem testBit_xor_two_pow_self (q k : ℕ) : (q ^^^ 2 ^ k).testBit k = !q.testBit k := by
  rw [Nat.testBit_xor, Nat.testBit_two_pow]; simp

theorem testBit_xor_two_pow_low (q : ℕ) {k j : ℕ} (hj : j < k) :
    (q ^^^ 2 ^ k).testBit j = q.testBit j := by
  rw [Nat.testBit_xor, Nat.testBit_two_pow]; simp [show k ≠ j by omega]

theorem xor_two_pow_xor (q k : ℕ) : q ^^^ 2 ^ k ^^^ 2 ^ k = q := by
  rw [Nat.xor_assoc, Nat.xor_self, Nat.xor_zero]

/-! ### Fast Walsh-Hadamard transform on packed counters

For one output mask `b`, start from the counters `F x = b · S(x)` and apply eight butterfly
stages. Stage `k` pairs the fields `p` and `p + 2 ^ k` (bit `k` of `p` clear): the low one
becomes the sum of the pair and the high one `2 ^ k` plus the difference, so every counter stays
a natural number (`tStage`). After all eight stages field `a` holds the number of inputs on
which `b · S(x)` and `a · x` differ (`tIter_eight`), for all `256` input masks at once, and one
stage costs a few operations on the whole row (`fwhtStage_eq`). -/

/-- `c` in every ten-bit field `p < 256` whose index has bit `k` clear, `0` elsewhere. -/
def lowMask (k c : ℕ) : ℕ :=
  natIter (fun p M => Nat.add M (Nat.shiftLeft (cond (Nat.testBit p k) 0 c) (Nat.mul 10 p))) 256 0

theorem lowMask_eq (k c : ℕ) : lowMask k c = row10 fun p => if p.testBit k then 0 else c := by
  rw [lowMask, natIter_add (fun p => Nat.shiftLeft (cond (Nat.testBit p k) 0 c) (Nat.mul 10 p)),
    Nat.zero_add]
  refine sum_congr rfl fun p _ => ?_
  rw [nat_shiftLeft, Nat.mul_eq]
  cases h : p.testBit k <;> simp [h]

/-- One butterfly stage, on all `128` pairs of fields `p`, `p + 2 ^ k` at once. -/
def fwhtStage (k E : ℕ) : ℕ :=
  let s := Nat.mul 10 (Nat.pow 2 k)
  let P := Nat.land E (lowMask k 1023)
  let Q := Nat.land (Nat.shiftRight E s) (lowMask k 1023)
  Nat.add (Nat.add P Q) (Nat.shiftLeft (Nat.sub (Nat.add P (lowMask k (Nat.pow 2 k))) Q) s)

/-- What a stage does to the counters. -/
def tStage (t : ℕ → ℕ) (k p : ℕ) : ℕ :=
  if p.testBit k then t (p ^^^ 2 ^ k) + 2 ^ k - t p else t p + t (p ^^^ 2 ^ k)

theorem fwhtStage_eq {k : ℕ} (hk : k < 8) {t : ℕ → ℕ} (ht : ∀ p < 256, t p ≤ 2 ^ k) :
    fwhtStage k (row10 t) = row10 (tStage t k) := by
  have hk7 : 2 ^ k ≤ 2 ^ 7 := Nat.pow_le_pow_right (by norm_num) (by omega)
  have ht' : ∀ p < 256, t p < 2 ^ 10 := fun p hp => by have := ht p hp; omega
  have htx : ∀ p < 256, t (p ^^^ 2 ^ k) ≤ 2 ^ k := fun p hp => ht _ (xor_two_pow_lt hk hp)
  have hmask : ∀ p < 256, (if p.testBit k then 0 else 1023) < 2 ^ 10 := fun p _ => by
    split <;> norm_num
  have keep : ∀ p < 256, t p &&& 1023 = t p := fun p hp => by
    rw [show (1023 : ℕ) = 2 ^ 10 - 1 by norm_num, Nat.and_two_pow_sub_one_eq_mod,
      Nat.mod_eq_of_lt (ht' p hp)]
  have hP : row10 t &&& lowMask k 1023 = row10 fun p => if p.testBit k then 0 else t p := by
    rw [lowMask_eq, land_row10 ht' hmask]
    refine row10_congr fun p hp => ?_
    split
    · exact Nat.and_zero _
    · exact keep p hp
  have hQ : (row10 t >>> (10 * 2 ^ k)) &&& lowMask k 1023 =
      row10 fun p => if p.testBit k then 0 else t (p ^^^ 2 ^ k) := by
    rw [shiftRight_row10 ht', lowMask_eq, land_row10 _ hmask]
    · refine row10_congr fun p hp => ?_
      cases hb : p.testBit k
      · have := bit_clear_add k hk p hp hb
        simp only [this.1, Bool.false_eq_true, if_true, if_false]
        rw [keep _ this.1, this.2]
      · simp
    · intro p _
      split
      · exact ht' _ (by assumption)
      · norm_num
  have hC : lowMask k (2 ^ k) = row10 fun p => if p.testBit k then 0 else 2 ^ k := lowMask_eq k _
  -- the stage, in the usual notation
  have hstage : fwhtStage k (row10 t) =
      ((row10 t &&& lowMask k 1023) + ((row10 t >>> (10 * 2 ^ k)) &&& lowMask k 1023)) +
        (((row10 t &&& lowMask k 1023) + lowMask k (2 ^ k) -
          ((row10 t >>> (10 * 2 ^ k)) &&& lowMask k 1023)) <<< (10 * 2 ^ k)) := rfl
  rw [hstage, hP, hQ, hC, add_row10, add_row10, sub_row10]
  · rw [shiftLeft_row10 (s := 2 ^ k)]
    · rw [add_row10]
      refine row10_congr fun p hp => ?_
      unfold tStage
      cases hb : p.testBit k
      · -- bit k clear: the low field of a pair
        simp only [Bool.false_eq_true, if_false]
        split
        · next hle =>
          have := bit_clear_sub k hk p hp hb hle
          simp [this]
        · simp
      · -- bit k set: the high field of a pair
        obtain ⟨hle, hsub⟩ := bit_set_sub k hk p hp hb
        have hq : (p ^^^ 2 ^ k).testBit k = false := by rw [testBit_xor_two_pow_self, hb]; rfl
        simp only [if_true, if_pos hle, hsub, hq, Bool.false_eq_true, if_false,
          xor_two_pow_xor, Nat.zero_add]
    · intro p hp
      have := htx p hp
      have := ht p hp
      have h128 : 2 ^ k ≤ 128 := by simpa using hk7
      cases p.testBit k
      · simp only [Bool.false_eq_true, if_false]
        omega
      · simp
    · intro p hp hge
      cases hb : p.testBit k
      · have := (bit_clear_add k hk p hp hb).1
        omega
      · simp
  · intro p hp
    have := htx p hp
    cases p.testBit k
    · simp only [Bool.false_eq_true, if_false]
      omega
    · simp


/-- The counters after `k` stages, starting from `F` as `0`/`1` counters. -/
def tIter (F : ℕ → Bool) : ℕ → ℕ → ℕ
  | 0, p => (F p).toNat
  | k + 1, p => tStage (tIter F k) k p

theorem bitDot_congr {k a a' x x' : ℕ} (ha : ∀ j < k, a.testBit j = a'.testBit j)
    (hx : ∀ j < k, x.testBit j = x'.testBit j) : bitDot k a x = bitDot k a' x' := by
  induction k with
  | zero => rfl
  | succ k ih =>
    simp only [bitDot]
    rw [ih (fun j hj => ha j (by omega)) (fun j hj => hx j (by omega)), ha k (by omega),
      hx k (by omega)]

theorem toNat_xor_xor_true (c d : Bool) : (c ^^ (d ^^ true)).toNat = 1 - (c ^^ d).toNat := by
  cases c <;> cases d <;> rfl

/-- **The counters after `k` stages.** Counter `p` counts the `z < 2 ^ k` on which
`F (block + z)` and `bitDot k p z` differ, where the block is `p` with its low `k` bits
cleared: the low bits of `p` are the input mask so far, the high bits still index inputs. -/
theorem tIter_eq (F : ℕ → Bool) {k : ℕ} (hk : k ≤ 8) {p : ℕ} (hp : p < 256) :
    tIter F k p = ∑ z ∈ range (2 ^ k), (F (p - p % 2 ^ k + z) ^^ bitDot k p z).toNat := by
  induction k generalizing p with
  | zero => simp [tIter, bitDot, Nat.mod_one]
  | succ k ih =>
    have hk' : k < 8 := by omega
    have hpx := xor_two_pow_lt hk' hp
    have hlow : ∀ j < k, (p ^^^ 2 ^ k).testBit j = p.testBit j :=
      fun j hj => testBit_xor_two_pow_low p hj
    have hz : ∀ z < 2 ^ k, ∀ j < k, (2 ^ k + z).testBit j = z.testBit j :=
      fun z _ j hj => Nat.testBit_two_pow_add_gt hj z
    have hzk : ∀ z < 2 ^ k, (2 ^ k + z).testBit k = true := fun z hz' => by
      rw [Nat.testBit_two_pow_add_eq, Nat.testBit_lt_two_pow hz']; rfl
    have bound : ∀ q < 256, tIter F k q ≤ 2 ^ k := fun q hq => by
      rw [ih (by omega) hq]
      calc ∑ z ∈ range (2 ^ k), _ ≤ ∑ _z ∈ range (2 ^ k), 1 :=
            sum_le_sum fun z _ => Bool.toNat_le _
        _ = 2 ^ k := by simp
    rw [show range (2 ^ (k + 1)) = range (2 ^ k + 2 ^ k) by rw [pow_succ, mul_two], sum_range_add]
    simp only [tIter, tStage, bitDot]
    cases hb : p.testBit k
    · -- the low field of a pair: both halves count agreements as before
      obtain ⟨hhi, hhi'⟩ := bit_clear_hi k hk' p hp hb
      simp only [Bool.false_eq_true, if_false, Bool.false_and, Bool.xor_false]
      rw [ih (by omega) hp, ih (by omega) hpx, hhi]
      congr 1
      refine sum_congr rfl fun z hz' => ?_
      have hz' := mem_range.mp hz'
      rw [hhi', bitDot_congr hlow (fun j hj => (hz z hz' j hj).symm), Nat.add_assoc]
    · -- the high field of a pair: the upper half flips every term
      obtain ⟨hhi, hhi'⟩ := bit_set_hi k hk' p hp hb
      simp only [if_true, Bool.true_and]
      have hfirst : ∑ z ∈ range (2 ^ k),
          (F (p - p % 2 ^ (k + 1) + z) ^^ (bitDot k p z ^^ z.testBit k)).toNat =
          tIter F k (p ^^^ 2 ^ k) := by
        rw [ih (by omega) hpx, hhi]
        refine sum_congr rfl fun z hz' => ?_
        rw [Nat.testBit_lt_two_pow (mem_range.mp hz'), Bool.xor_false,
          bitDot_congr (fun j hj => (hlow j hj).symm) (fun _ _ => rfl)]
      have hsecond : ∑ z ∈ range (2 ^ k),
          (F (p - p % 2 ^ (k + 1) + (2 ^ k + z)) ^^
            (bitDot k p (2 ^ k + z) ^^ (2 ^ k + z).testBit k)).toNat =
          2 ^ k - tIter F k p := by
        rw [ih (by omega) hp]
        rw [sum_congr rfl (g := fun z => 1 - (F (p - p % 2 ^ k + z) ^^ bitDot k p z).toNat)
          (fun z hz' => by
            have hz' := mem_range.mp hz'
            rw [hzk z hz', bitDot_congr (fun _ _ => rfl) (hz z hz'), ← Nat.add_assoc, hhi',
              toNat_xor_xor_true])]
        rw [Finset.sum_tsub_distrib _ (fun z _ => Bool.toNat_le _)]
        simp
      rw [hfirst, hsecond, Nat.add_sub_assoc (bound p hp)]

theorem tIter_le (F : ℕ → Bool) {k : ℕ} (hk : k ≤ 8) {p : ℕ} (hp : p < 256) :
    tIter F k p ≤ 2 ^ k := by
  rw [tIter_eq F hk hp]
  calc ∑ z ∈ range (2 ^ k), _ ≤ ∑ _z ∈ range (2 ^ k), 1 := sum_le_sum fun z _ => Bool.toNat_le _
    _ = 2 ^ k := by simp

/-- After all eight stages, counter `a` counts the inputs on which `F` and `x ↦ a · x`
differ. -/
theorem tIter_eight (F : ℕ → Bool) {a : ℕ} (ha : a < 256) :
    tIter F 8 a = ∑ x ∈ range 256, (F x ^^ bitDot 8 a x).toNat := by
  rw [tIter_eq F le_rfl ha]
  refine sum_congr (by norm_num) fun x _ => ?_
  rw [Nat.mod_eq_of_lt (by simpa using ha), Nat.sub_self, Nat.zero_add]

/-- The first `n` stages. -/
def fwhtUpTo (n E : ℕ) : ℕ := Nat.rec (motive := fun _ => ℕ) E (fun k ih => fwhtStage k ih) n

theorem fwhtUpTo_eq (F : ℕ → Bool) {n : ℕ} (hn : n ≤ 8) :
    fwhtUpTo n (row10 fun p => (F p).toNat) = row10 (tIter F n) := by
  induction n with
  | zero => rfl
  | succ n ih =>
    change fwhtStage n (fwhtUpTo n _) = _
    rw [ih (by omega), fwhtStage_eq (by omega) (fun p hp => tIter_le F (by omega) hp)]
    rfl

/-- For the counters `E` of one output mask: after the transform every field lies between `lo`
and `hi`, tested with `fieldsAtMost` on the fields and on their complements to `256`. -/
def latRow (lo hi E : ℕ) : Bool :=
  let W := fwhtUpTo 8 E
  and (fieldsAtMost W hi) (fieldsAtMost (Nat.sub (Nat.mul 256 fieldOnes) W) (Nat.sub 256 lo))

/-- Every output mask `b ≠ 0` and input mask `a` of the packed table `T` have between `lo` and
`hi` inputs on which `a · x` and `b · T[x]` differ: a walk visits every output mask with one xor
per step, and the transform handles all input masks of it at once. -/
def latCheck (T lo hi : ℕ) : Bool :=
  xorWalk (outBasis T) (fun b G => or (Nat.beq b 0) (latRow lo hi G)) 8 0 0

/-- Every Walsh coefficient `256 - 2c` of the packed table `T` at an output mask `b ≠ 0` is at
most `L` in absolute value, i.e. `c` lies between `(257 - L) / 2` and `(256 + L) / 2`. -/
def latBounded (T L : ℕ) : Bool :=
  latCheck T (Nat.div (Nat.sub 257 L) 2) (Nat.div (Nat.add 256 L) 2)

theorem range_of_latRow (F : ℕ → Bool) {lo hi : ℕ} (hlo : lo ≤ 256) (hhi : hi ≤ 511)
    (h : latRow lo hi (spreadOf F) = true) :
    ∀ a < 256, lo ≤ tIter F 8 a ∧ tIter F 8 a ≤ hi := by
  have hle : ∀ a < 256, tIter F 8 a ≤ 256 := fun a ha => tIter_le F le_rfl ha
  simp only [latRow, Bool.and_eq_true] at h
  rw [spreadOf_eq, fwhtUpTo_eq F le_rfl] at h
  obtain ⟨h1, h2⟩ := h
  have hcomp : Nat.sub (Nat.mul 256 fieldOnes) (row10 (tIter F 8)) =
      row10 fun a => 256 - tIter F 8 a := by
    change 256 * fieldOnes - row10 (tIter F 8) = _
    rw [fieldOnes_eq, mul_row10, sub_row10 (fun a ha => by have := hle a ha; omega)]
  rw [hcomp, nat_sub] at h2
  intro a ha
  have u := le_of_fieldsAtMost hle hhi h1 a ha
  have l := le_of_fieldsAtMost (fun a _ => Nat.sub_le _ _) (by omega) h2 a ha
  have := hle a ha
  omega

/-- The number of inputs `x < 256` on which `a · x` and `b · T[x]` differ, counted directly. -/
def latCountAt (T a b : ℕ) : ℕ :=
  natIter (fun x c => Nat.add c (Bool.toNat (bitDot 8 b (byteAt T x) ^^ bitDot 8 a x))) 256 0

/-- `|256 - 2 · latCountAt T a b|`, the absolute Walsh coefficient at `(a, b)`. -/
def walshAbsAt (T a b : ℕ) : ℕ :=
  Nat.sub 256 (Nat.mul 2 (latCountAt T a b)) + Nat.sub (Nat.mul 2 (latCountAt T a b)) 256

theorem walsh_tableSbox (f : ℕ → ℕ) {a b : ℕ} (ha : a < 256) (hb : b < 256) :
    walsh (tableSbox f) (gf a) (gf b) =
      256 - 2 * ((∑ x ∈ range 256, (bitDot 8 b (f x % 256) ^^ bitDot 8 a x).toNat : ℕ) : ℤ) := by
  have hterm : ∀ x : GF256, (if dot (gf a) x = dot (gf b) (tableSbox f x) then (1 : ℤ) else -1) =
      1 - 2 * ((bitDot 8 b (f x.val.toNat % 256) ^^ bitDot 8 a x.val.toNat).toNat : ℤ) := by
    intro x
    simp only [dot, tableSbox, gf_toNat, Nat.mod_eq_of_lt ha, Nat.mod_eq_of_lt hb]
    cases bitDot 8 a x.val.toNat <;> cases bitDot 8 b (f x.val.toNat % 256) <;> norm_num
  rw [walsh, sum_congr rfl (fun x _ => hterm x),
    sum_gf (fun n => 1 - 2 * ((bitDot 8 b (f n % 256) ^^ bitDot 8 a n).toNat : ℤ))]
  rw [sum_sub_distrib, ← mul_sum]
  push_cast
  simp

theorem latCountAt_eq {T : ℕ} {s : ℕ → ℕ} (hT : ∀ x < 256, byteAt T x = s x) (a b : ℕ) :
    latCountAt T a b = ∑ x ∈ range 256, (bitDot 8 b (s x) ^^ bitDot 8 a x).toNat := by
  rw [latCountAt, natIter_add (fun x => Bool.toNat (bitDot 8 b (byteAt T x) ^^ bitDot 8 a x)),
    Nat.zero_add]
  exact sum_congr rfl fun x hx => by rw [hT x (mem_range.mp hx)]

/-- **Exact linearity of a table S-box.** If every Walsh coefficient of the packed table at a
nonzero output mask passes `latBounded` and the coefficient at `(a, b)` has absolute value `l`,
the linearity is exactly `l`, attained at `(a, b)`. -/
theorem linearity_tableSbox {f : ℕ → ℕ} {l a b : ℕ} (hl : l ≤ 256) (ha : a < 256) (hb0 : b ≠ 0)
    (hb : b < 256) (hbound : latBounded (packTable f) l = true)
    (hw : walshAbsAt (packTable f) a b = l) :
    linearity (tableSbox f) = l ∧ gf b ≠ 0 ∧ (walsh (tableSbox f) (gf a) (gf b)).natAbs = l := by
  have hT : ∀ x < 256, byteAt (packTable f) x = f x % 256 := fun x hx => byteAt_packTable f hx
  have hwit : (walsh (tableSbox f) (gf a) (gf b)).natAbs = l := by
    have hc := latCountAt_eq hT a b
    unfold walshAbsAt at hw
    generalize latCountAt (packTable f) a b = c at hw hc
    rw [nat_sub, nat_sub, Nat.mul_eq] at hw
    rw [walsh_tableSbox f ha hb, ← hc]
    omega
  have hall : ∀ a' b' : GF256, b' ≠ 0 → (walsh (tableSbox f) a' b').natAbs ≤ l := by
    intro a' b' hb'
    have ha' := toNat_lt a'
    have hb'' := toNat_lt b'
    have hb0' := toNat_ne_zero hb'
    rw [← gf_val_toNat a', ← gf_val_toNat b', walsh_tableSbox f ha' hb'']
    unfold latBounded latCheck at hbound
    have outer := of_xorWalk hbound b'.val.toNat (by norm_num; exact hb'')
    simp only [Nat.zero_add, Nat.zero_xor] at outer
    have hne : Nat.beq b'.val.toNat 0 = false := by rw [nat_beq]; simpa using hb0'
    rw [hne, Bool.false_or] at outer
    have hG : xorSel (outBasis (packTable f)) 8 b'.val.toNat =
        spreadOf fun x => bitDot 8 b'.val.toNat (f x % 256) := by
      have hB : outBasis (packTable f) = fun j => spreadOf fun x => (f x % 256).testBit j :=
        funext fun j => spreadOf_congr fun x hx => by rw [hT x hx]
      rw [hB, xorSel_basis]
    rw [hG] at outer
    rw [nat_sub, Nat.add_eq, nat_div, nat_div] at outer
    have hr := range_of_latRow _ (by omega) (by omega) outer a'.val.toNat ha'
    rw [tIter_eight _ ha'] at hr
    omega
  exact ⟨linearity_eq hall (gf_ne_zero hb0 hb) hwit, gf_ne_zero hb0 hb, hwit⟩

/-! ### The AES S-box

WideTrail's `AES.sbox` is the FIPS 197 table (`aes_sbox_eq_table`), so the checks run on the
packed table once, here. -/

theorem aes_sbox_eq_tableSbox : AES.sbox = tableSbox aesSboxTable := funext aes_sbox_eq_table

/-- Every row `a ≠ 0` of the AES difference table has entries at most `4`. -/
theorem aes_ddtRowsBounded : ddtRowsBounded (packTable aesSboxTable) 4 = true := by
  decide +kernel

/-- Every Walsh coefficient of the AES S-box at a nonzero output mask is at most `32` in
absolute value. -/
theorem aes_latBounded : latBounded (packTable aesSboxTable) 32 = true := by
  decide +kernel

/-- **The differential uniformity of the AES S-box is `4`**, attained at the input difference
`01` and the output difference `1F`. -/
theorem aes_sbox_differentialUniformity :
    differentialUniformity AES.sbox = 4 ∧ gf 1 ≠ 0 ∧ diffCount AES.sbox (gf 1) (gf 31) = 4 := by
  rw [aes_sbox_eq_tableSbox]
  exact differentialUniformity_tableSbox (by norm_num) (by norm_num) (by norm_num) (by norm_num)
    aes_ddtRowsBounded (by decide +kernel)

/-- **The linearity of the AES S-box is `32`**, attained at the input mask `01` and the output
mask `48`. -/
theorem aes_sbox_linearity :
    linearity AES.sbox = 32 ∧ gf 72 ≠ 0 ∧ (walsh AES.sbox (gf 1) (gf 72)).natAbs = 32 := by
  rw [aes_sbox_eq_tableSbox]
  exact linearity_tableSbox (by norm_num) (by norm_num) (by norm_num) (by norm_num)
    aes_latBounded (by decide +kernel)

end Cryptificate

/-! ### Axioms

The theorems certificates rely on use only the three standard axioms; the kernel checks above
are `decide +kernel`, never `native_decide`. -/

/-- info: 'Cryptificate.differentialUniformity_tableSbox' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms Cryptificate.differentialUniformity_tableSbox

/-- info: 'Cryptificate.linearity_tableSbox' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms Cryptificate.linearity_tableSbox

/-- info: 'Cryptificate.aes_sbox_differentialUniformity' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms Cryptificate.aes_sbox_differentialUniformity

/-- info: 'Cryptificate.aes_sbox_linearity' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs in
#print axioms Cryptificate.aes_sbox_linearity
