import Cryptificate.PrimeField.Encoding
import Cryptificate.Hades.Partial
import Cryptificate.Diffusion.Branch

/-!
# Vector identities over `ZMod p` checked on lists of natural numbers

The certificates of wide HADES designs (Poseidon2 widths `8` to `24`) state facts about `t × t`
matrices over `ZMod p` given as flat numeral lists (`pfMat`). The kernel never evaluates
arithmetic in `ZMod p` here: each fact is reduced to a Boolean function on natural numbers, and
`decide +kernel` evaluates it. This file holds the checks whose cost grows with the size of a
witness rather than with the width, and which therefore walk lists directly:

* `checkKernel p n E v` and `checkNonzero p n v`: `v` is a nonzero vector that `E` sends to zero
  modulo `p` (`mulVec_eq_zero_of_check`, `pfVec_ne_zero_of_check`), the refutation of an
  invertibility claim;
* `checkBranch p n E v`: `v` is nonzero modulo `p`, and `v` and `E v` together have at most `n`
  entries that are nonzero modulo `p` (`not_isMDS_of_checkBranch`), the refutation of an MDS
  claim at any width;
* `checkInvariant p n r E mask B A`: `r` vectors that vanish on the masked positions and that `E`
  maps into their span with the coefficients `A` (`Hades.invariant_of_check`), the hypotheses of
  `Hades.powers_zero_of_invariant`.

Each check computes `dot a b`, the plain sum of products of two rows, and reduces it modulo `p`
once. It also defines `poseidon2External`, the Poseidon2 external matrix `circ(2 M₄, M₄, …, M₄)`
built from a `4 × 4` matrix.

The checks whose cost would grow as `t³` (inverse witnesses, observability, short bypasses, the
block structure) are in `PrimeField.Packed`, which replaces each dot product by one multiplication
of packed numbers.
-/

set_option autoImplicit false

open Matrix

namespace Cryptificate

namespace NatMatrix

/-! ### Lists of natural numbers -/

/-- The sum of the products of corresponding entries, up to the shorter list. -/
def dot : List ℕ → List ℕ → ℕ
  | a :: as, b :: bs => a * b + dot as bs
  | _, _ => 0

theorem dot_eq_sum (a b : List ℕ) (n : ℕ) (h : a.length ≤ n) :
    dot a b = ∑ k ∈ Finset.range n, a.getD k 0 * b.getD k 0 := by
  induction a generalizing b n with
  | nil => cases b <;> simp [dot]
  | cons x as ih =>
    cases b with
    | nil => simp [dot]
    | cons y bs =>
      obtain ⟨m, rfl⟩ : ∃ m, n = m + 1 := ⟨n - 1, by simp at h; omega⟩
      rw [Finset.sum_range_succ', dot, ih bs m (by simpa using h)]
      simp [add_comm]

/-- The first `r` rows of `n` entries of a row-major list. -/
def rows (n : ℕ) : ℕ → List ℕ → List (List ℕ)
  | 0, _ => []
  | r + 1, l => l.take n :: rows n r (l.drop n)

theorem length_rows (n r : ℕ) (l : List ℕ) : (rows n r l).length = r := by
  induction r generalizing l with
  | zero => rfl
  | succ r ih => simp [rows, ih]

theorem rows_getD_length (n r : ℕ) (l : List ℕ) (i : ℕ) : ((rows n r l).getD i []).length ≤ n := by
  induction r generalizing l i with
  | zero => simp [rows]
  | succ r ih =>
    cases i with
    | zero => simp [rows]
    | succ i => simpa [rows] using ih (l.drop n) i

theorem rows_getD_getD (n r : ℕ) (l : List ℕ) {i j : ℕ} (hi : i < r) (hj : j < n) :
    ((rows n r l).getD i []).getD j 0 = l.getD (i * n + j) 0 := by
  induction r generalizing l i with
  | zero => omega
  | succ r ih =>
    cases i with
    | zero =>
      simp [rows, List.getD_eq_getElem?_getD, hj]
    | succ i =>
      simp only [rows, List.getD_cons_succ]
      rw [ih (l.drop n) (by omega)]
      simp only [List.getD_eq_getElem?_getD, List.getElem?_drop]
      congr 2
      ring

/-- Column `c` of a list of rows. -/
def col (R : List (List ℕ)) (c : ℕ) : List ℕ := R.map fun row => row.getD c 0

theorem col_getD (R : List (List ℕ)) (c k : ℕ) : (col R c).getD k 0 = (R.getD k []).getD c 0 := by
  simp only [col, List.getD_eq_getElem?_getD, List.getElem?_map]
  cases R[k]? <;> simp

/-- A matrix with a right inverse has a nonzero determinant. -/
theorem det_ne_zero_of_mul_eq_one {K : Type*} [CommRing K] [Nontrivial K] {n : ℕ}
    {A B : Matrix (Fin n) (Fin n) K} (h : A * B = 1) : A.det ≠ 0 := by
  intro h0
  have := congrArg Matrix.det h
  rw [Matrix.det_mul, h0, zero_mul, Matrix.det_one] at this
  exact zero_ne_one this

/-! ### Kernel vectors and nonzero vectors -/

/-- A vector over `ZMod p` dotted with another, both read from lists, is the cast of `dot` when
the first has at most `n` entries. -/
theorem pfVec_dotProduct {p n : ℕ} {r : List ℕ} (hr : r.length ≤ n) (v : List ℕ) :
    pfVec p n r ⬝ᵥ pfVec p n v = ((dot r v : ℕ) : ZMod p) := by
  rw [dot_eq_sum _ _ n hr, Nat.cast_sum, dotProduct,
    ← Fin.sum_univ_eq_sum_range (fun k => ((r.getD k 0 * v.getD k 0 : ℕ) : ZMod p)) n]
  simp [pfVec, pf]

/-- Row `i` of an encoded matrix, as a vector. -/
theorem pfMat_row (p n : ℕ) (E : List ℕ) (i : Fin n) :
    (fun j => pfMat p n E i j) = pfVec p n ((rows n n E).getD i.val []) := by
  funext j
  simp only [pfMat, pfVec, Matrix.of_apply, rows_getD_getD n n E i.isLt j.isLt]

/-- A natural number that is zero modulo `p` casts to zero in `ZMod p`. -/
theorem cast_eq_zero_of_mod {p x : ℕ} (h : x % p = 0) : (x : ZMod p) = 0 := by
  rw [← ZMod.natCast_mod, h, Nat.cast_zero]

/-- `E v ≡ 0 (mod p)`, row by row, for the first `n` rows of `E`. -/
def checkKernel (p n : ℕ) (E v : List ℕ) : Bool :=
  (List.range n).all fun i => dot ((rows n n E).getD i []) v % p == 0

/-- Some entry of `v` below index `n` is nonzero modulo `p`. -/
def checkNonzero (p n : ℕ) (v : List ℕ) : Bool :=
  (List.range n).any fun i => v.getD i 0 % p != 0

/-- **An accepted kernel vector.** -/
theorem mulVec_eq_zero_of_check {p n : ℕ} {E v : List ℕ} (h : checkKernel p n E v = true) :
    (pfMat p n E).mulVec (pfVec p n v) = 0 := by
  funext i
  simp only [checkKernel, List.all_eq_true, List.mem_range, beq_iff_eq] at h
  rw [Pi.zero_apply, Matrix.mulVec, pfMat_row,
    pfVec_dotProduct (rows_getD_length n n E i.val) v]
  exact cast_eq_zero_of_mod (h i.val i.isLt)

/-- **An accepted nonzero vector.** -/
theorem pfVec_ne_zero_of_check {p n : ℕ} {v : List ℕ} (h : checkNonzero p n v = true) :
    pfVec p n v ≠ 0 := by
  simp only [checkNonzero, List.any_eq_true, List.mem_range, bne_iff_ne, ne_eq] at h
  obtain ⟨i, hi, hv⟩ := h
  intro h0
  have h1 := congrArg ZMod.val (congrFun h0 ⟨i, hi⟩)
  simp only [pfVec, pf, Pi.zero_apply, ZMod.val_natCast, ZMod.val_zero] at h1
  exact hv h1

/-- The first of `r` vectors read from a list is the vector read from the same list. -/
theorem pfVecs_zero (p r n : ℕ) [NeZero r] (B : List ℕ) : pfVecs p r n B 0 = pfVec p n B := by
  funext i
  simp [pfVecs, pfVec]

/-- The first of `r` vectors read from a list is nonzero once `checkNonzero` accepts the list:
the bypass witness of an invariant-subspace certificate. -/
theorem pfVecs_zero_ne_zero_of_check {p r n : ℕ} [NeZero r] {B : List ℕ}
    (h : checkNonzero p n B = true) : pfVecs p r n B 0 ≠ 0 := by
  rw [pfVecs_zero]
  exact pfVec_ne_zero_of_check h

/-! ### Low-weight vectors -/

/-- The number of `k < m` with `f k` nonzero modulo `p`. -/
def nzCount (p : ℕ) (f : ℕ → ℕ) : ℕ → ℕ
  | 0 => 0
  | m + 1 => nzCount p f m + if f m % p = 0 then 0 else 1

theorem nzCount_eq_sum (p : ℕ) (f : ℕ → ℕ) (m : ℕ) :
    nzCount p f m = ∑ k ∈ Finset.range m, if f k % p = 0 then 0 else 1 := by
  induction m with
  | zero => rfl
  | succ m ih => rw [nzCount, ih, Finset.sum_range_succ]

/-- The weight of a vector over `ZMod p` whose entries are the numerals `f k` is the number of
them that are nonzero modulo `p`. -/
theorem weight_eq_nzCount {p n : ℕ} (f : ℕ → ℕ) (g : Fin n → ZMod p)
    (hg : ∀ i, g i = ((f i.val : ℕ) : ZMod p)) : weight g = nzCount p f n := by
  rw [weight, activePattern, Finset.card_filter, nzCount_eq_sum,
    ← Fin.sum_univ_eq_sum_range (fun k => if f k % p = 0 then 0 else 1) n]
  refine Finset.sum_congr rfl fun i _ => ?_
  have h : g i = 0 ↔ f i.val % p = 0 := by
    rw [hg, ZMod.natCast_eq_zero_iff, Nat.dvd_iff_mod_eq_zero]
  by_cases h0 : f i.val % p = 0
  · rw [if_pos h0, if_neg (not_not.mpr (h.mpr h0))]
  · rw [if_neg h0, if_pos (mt h.mp h0)]

/-- **The low-weight check.** `v` is nonzero modulo `p`, and `v` and `E v` together have at most
`n` entries that are nonzero modulo `p`. -/
def checkBranch (p n : ℕ) (E v : List ℕ) : Bool :=
  checkNonzero p n v &&
    Nat.blt (nzCount p (fun k => v.getD k 0) n +
      nzCount p (fun k => dot ((rows n n E).getD k []) v) n) (n + 1)

/-- **An accepted low-weight vector refutes the MDS property** (`not_isMDS_of_witness`), with
every product and every count evaluated on numerals. -/
theorem not_isMDS_of_checkBranch {p n : ℕ} [Fact p.Prime] {E v : List ℕ}
    (h : checkBranch p n E v = true) : ¬ IsMDS (pfMat p n E) := by
  simp only [checkBranch, Bool.and_eq_true, Nat.blt_eq] at h
  refine not_isMDS_of_witness (pfVec p n v) (pfVec_ne_zero_of_check h.1) ?_
  rw [weight_eq_nzCount (fun k => v.getD k 0) (pfVec p n v) (fun i => rfl),
    weight_eq_nzCount (fun k => dot ((rows n n E).getD k []) v) _ (fun i => by
      rw [Matrix.mulVec, pfMat_row, pfVec_dotProduct (rows_getD_length n n E i.val) v])]
  exact h.2

/-! ### The masked rows of the powers of a matrix -/

/-- The positions below `n` where the mask list has a nonzero entry, increasing: the positions
`maskBits n mask` marks. -/
def maskPositions (n : ℕ) (mask : List ℕ) : List ℕ :=
  (List.range n).filter fun i => mask.getD i 0 != 0

/-- **The invariant-subspace check.** For each of the `r` vectors `Bₖ` (row-major in `B`, `n`
entries each): `E Bₖ ≡ ∑ₗ Aₖₗ Bₗ (mod p)` entry by entry, with `A` row-major `r × r`, and `Bₖ` is
zero modulo `p` at every masked position. -/
def checkInvariant (p n r : ℕ) (E mask B A : List ℕ) : Bool :=
  (List.range r).all fun k =>
    ((List.range n).all fun i =>
      dot ((rows n n E).getD i []) ((rows n r B).getD k []) % p ==
        dot ((rows r r A).getD k []) (col (rows n r B) i) % p) &&
    (maskPositions n mask).all fun i => ((rows n r B).getD k []).getD i 0 % p == 0


end NatMatrix

namespace Hades

open NatMatrix

/-- The partial-round mask read from a list, as the certificates define `candMask`. -/
theorem mem_mask_of_mem_maskPositions {n : ℕ} [NeZero n] {mask : List ℕ} {c : ℕ}
    (h : c ∈ maskPositions n mask) :
    Fin.ofNat n c ∈ Finset.univ.filter fun i : Fin n => maskBits n mask i = true := by
  simp only [maskPositions, List.mem_filter, List.mem_range, bne_iff_ne, ne_eq,
    List.getD_eq_getElem?_getD] at h
  simpa [maskBits, Nat.mod_eq_of_lt h.1] using h.2

theorem mem_maskPositions_of_mem_mask {n : ℕ} {mask : List ℕ} {i : Fin n}
    (h : i ∈ Finset.univ.filter fun i : Fin n => maskBits n mask i = true) :
    i.val ∈ maskPositions n mask := by
  simp only [Finset.mem_filter, Finset.mem_univ, true_and, maskBits, bne_iff_ne, ne_eq,
    List.getD_eq_getElem?_getD] at h
  simpa [maskPositions, i.isLt] using h

/-- **The invariant-subspace certificate, any width.** If `checkInvariant` accepts, the vectors
read from `B` satisfy the hypotheses of `powers_zero_of_invariant`. -/
theorem invariant_of_check {p n r : ℕ} [NeZero n] {E mask B A : List ℕ}
    (h : checkInvariant p n r E mask B A = true) :
    (∀ k, (pfMat p n E).mulVec (pfVecs p r n B k) = ∑ l, pfVecs p r r A k l • pfVecs p r n B l) ∧
      ∀ k, ∀ i ∈ (Finset.univ.filter fun i : Fin n => maskBits n mask i = true),
        pfVecs p r n B k i = 0 := by
  simp only [checkInvariant, List.all_eq_true, List.mem_range, Bool.and_eq_true,
    beq_iff_eq] at h
  refine ⟨fun k => ?_, fun k i hi => ?_⟩
  · funext i
    have hk := (h k.val k.isLt).1 i.val i.isLt
    have hv : pfVecs p r n B k = pfVec p n ((rows n r B).getD k.val []) := by
      funext j
      simp only [pfVecs, pfVec, rows_getD_getD n r B k.isLt j.isLt]
    rw [Matrix.mulVec, pfMat_row, hv, pfVec_dotProduct (rows_getD_length n n E i.val),
      ← ZMod.natCast_mod, hk, ZMod.natCast_mod, Finset.sum_apply,
      dot_eq_sum _ _ r (rows_getD_length r r A k.val), Nat.cast_sum,
      ← Fin.sum_univ_eq_sum_range (fun l => ((((rows r r A).getD k.val []).getD l 0 *
        (col (rows n r B) i.val).getD l 0 : ℕ) : ZMod p)) r]
    refine Finset.sum_congr rfl fun l _ => ?_
    rw [col_getD, rows_getD_getD r r A k.isLt l.isLt, rows_getD_getD n r B l.isLt i.isLt]
    simp [pfVecs, pf]
  · have hz := (h k.val k.isLt).2 i.val (mem_maskPositions_of_mem_mask hi)
    rw [rows_getD_getD n r B k.isLt i.isLt] at hz
    exact cast_eq_zero_of_mod hz

/-! ### The Poseidon2 external layer -/

/-- The external matrix of Poseidon2 for a width `t = 4k`, built from a `4 × 4` matrix `M₄`: the
block matrix with `2 M₄` on the diagonal blocks and `M₄` on every other block,
`circ(2 M₄, M₄, …, M₄)`. Entry `(i, j)` is `M₄ (i mod 4) (j mod 4)`, doubled when `i` and `j` are
in the same block of four. -/
def poseidon2External {K : Type*} [NonAssocSemiring K] (t : ℕ) (M₄ : Matrix (Fin 4) (Fin 4) K) :
    Matrix (Fin t) (Fin t) K :=
  Matrix.of fun i j =>
    (if i.val / 4 = j.val / 4 then 2 else 1) * M₄ (Fin.ofNat 4 i.val) (Fin.ofNat 4 j.val)


end Hades

end Cryptificate
