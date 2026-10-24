import Cryptificate.Diffusion.Minors4

/-!
# Canonical minors of a `3 × 3` matrix

The width-three counterpart of `Diffusion.Minors4`. `IsMDS M` (WideTrail, `Algebra/MDS.lean`)
asks that every square submatrix of `M`, with rows and columns read in increasing order, be
nonsingular. A `3 × 3` matrix has `19` such submatrices: `9` of order one (the entries), `9` of
order two and the matrix itself. `Mat3.minorsOk` evaluates all `19` determinants by explicit
polynomials in the entries, and `Mat3.isMDS_of_minorsOk`, proved once for every field and
every matrix, turns a passing check into `IsMDS`. A certificate for a concrete matrix is a
single kernel evaluation:

    Mat3.isMDS_of_minorsOk M (by decide)

The design follows `Minors4` and avoids the same two obstacles recorded in WideTrail's
`Algebra/AESMix.lean`: `Matrix.det` and `Finset.orderIsoOfFin` are never evaluated. Each minor
is a polynomial (`minor2`, and `det3` from `Minors4` for the full determinant) whose agreement
with `Matrix.det` is proved symbolically (`det_fin_two`, `det_fin_three`). The selections that
`IsMDS` quantifies over are strictly increasing, and a strictly increasing `Fin 2 → Fin 3` is one
of the three pairs in `pairs`, decided once over all `9` maps; order three is the identity
(`StrictMono.eq_id`).

WideTrail proves the reference Poseidon2 external matrix MDS (`Poseidon2.BN254.external_mds`) by
enumerating injective selections for that one matrix. Here the selection argument is done once
and only the `19` field values are left to the kernel, so a new matrix costs one evaluation of
`minorsOk`. Arbitrary injective selections are covered as well: `forall_injective_of_minorsOk`
applies the permutation argument of `AESMix.lean`, carried out for every size in
`Minors4.isMDS_iff_forall_injective`.

The same file holds the two facts the HADES certificates need about the internal matrix:
an explicit determinant decides invertibility (`det_ne_zero_of_det3`), and a nonzero kernel
vector shows singularity at any size (`det_eq_zero_of_mulVec_eq_zero`).
-/

set_option autoImplicit false

open Matrix

namespace Cryptificate.Mat3

variable {K : Type*} [Field K]

/-! ### Explicit minor formulas -/

/-- The three indices of `Fin 3`, in increasing order. -/
def fin3 : List (Fin 3) := [0, 1, 2]

/-- The three strictly increasing pairs of indices of `Fin 3`. A pair `(a, b)` names the rows
(or columns) `a < b` of an order-two submatrix. -/
def pairs : List (Fin 3 × Fin 3) := [(0, 1), (0, 2), (1, 2)]

/-- The selection `Fin 2 → Fin 3` that reads the pair `p` in order. -/
def pairSel (p : Fin 3 × Fin 3) : Fin 2 → Fin 3 := ![p.1, p.2]

/-- The order-two minor on the rows `r` and the columns `c`. -/
def minor2 (M : Matrix (Fin 3) (Fin 3) K) (r c : Fin 3 × Fin 3) : K :=
  M r.1 c.1 * M r.2 c.2 - M r.1 c.2 * M r.2 c.1

theorem det_submatrix_pairSel (M : Matrix (Fin 3) (Fin 3) K) (r c : Fin 3 × Fin 3) :
    (M.submatrix (pairSel r) (pairSel c)).det = minor2 M r c := by
  rw [det_fin_two]
  rfl

/-- The six-term formula agrees with `Matrix.det`. Proved once, symbolically, so that no
certificate ever evaluates `Matrix.det` itself. -/
theorem det_eq_det3 (M : Matrix (Fin 3) (Fin 3) K) : M.det = det3 M := by
  rw [det_fin_three]
  rfl

/-! ### Strictly increasing selections, decided once -/

theorem mem_fin3 : ∀ i : Fin 3, i ∈ fin3 := by decide

/-- A strictly increasing `Fin 2 → Fin 3` is one of the three pairs. -/
theorem strictMono_two :
    ∀ f : Fin 2 → Fin 3, (∀ a b, a < b → f a < f b) → ∃ p ∈ pairs, f = pairSel p := by
  decide

/-! ### The check -/

variable [DecidableEq K]

/-- All `9` entries are nonzero. -/
def minors1Ok (M : Matrix (Fin 3) (Fin 3) K) : Bool :=
  fin3.all fun i => fin3.all fun j => decide (M i j ≠ 0)

/-- All `9` order-two minors are nonzero. -/
def minors2Ok (M : Matrix (Fin 3) (Fin 3) K) : Bool :=
  pairs.all fun r => pairs.all fun c => decide (minor2 M r c ≠ 0)

/-- The canonical-minor certificate: all `19` nonempty square minors are nonzero, each
evaluated by an explicit formula. -/
def minorsOk (M : Matrix (Fin 3) (Fin 3) K) : Bool :=
  minors1Ok M && minors2Ok M && decide (det3 M ≠ 0)

/-- Every submatrix chosen by strictly increasing rows and columns is nonsingular, once the
check passes. The order `k` is at most `3` because a strictly increasing map is injective;
each order is then matched against the explicit list of selections of that order. -/
theorem det_submatrix_ne_zero_of_minorsOk {M : Matrix (Fin 3) (Fin 3) K}
    (h : minorsOk M = true) {k : ℕ} (r c : Fin k → Fin 3) (hr : StrictMono r)
    (hc : StrictMono c) : (M.submatrix r c).det ≠ 0 := by
  simp only [minorsOk, minors1Ok, minors2Ok, Bool.and_eq_true, List.all_eq_true,
    decide_eq_true_eq] at h
  obtain ⟨⟨h1, h2⟩, h3⟩ := h
  have hk : k ≤ 3 := by simpa using Fintype.card_le_of_injective r hr.injective
  interval_cases k
  · rw [det_fin_zero]
    exact one_ne_zero
  · rw [det_fin_one]
    exact h1 (r 0) (mem_fin3 _) (c 0) (mem_fin3 _)
  · obtain ⟨p, hp, rfl⟩ := strictMono_two r (fun a b hab => hr hab)
    obtain ⟨q, hq, rfl⟩ := strictMono_two c (fun a b hab => hc hab)
    rw [det_submatrix_pairSel]
    exact h2 p hp q hq
  · obtain rfl := hr.eq_id
    obtain rfl := hc.eq_id
    rw [submatrix_id_id, det_eq_det3]
    exact h3

/-- **The canonical-minor certificate is sound.** If `minorsOk M` evaluates to `true`, then
`M` is MDS in the sense of WideTrail's `IsMDS`, and so has branch number `4`
(`isMDS_branch_bound`). -/
theorem isMDS_of_minorsOk (M : Matrix (Fin 3) (Fin 3) K) (h : minorsOk M = true) :
    IsMDS M := by
  intro k Row Col hRow hCol
  exact det_submatrix_ne_zero_of_minorsOk h _ _ (Row.orderEmbOfFin hRow).strictMono
    (Col.orderEmbOfFin hCol).strictMono

/-- The certificate, read for arbitrary injective selections of rows and columns. -/
theorem forall_injective_of_minorsOk (M : Matrix (Fin 3) (Fin 3) K)
    (h : minorsOk M = true) : ∀ (k : ℕ) (r c : Fin k → Fin 3), Function.Injective r →
      Function.Injective c → (M.submatrix r c).det ≠ 0 :=
  (isMDS_iff_forall_injective M).mp (isMDS_of_minorsOk M h)

/-! ### Invertibility and singularity -/

omit [DecidableEq K] in
/-- An explicit nonzero determinant: the certificate that a `3 × 3` matrix is invertible. -/
theorem det_ne_zero_of_det3 {M : Matrix (Fin 3) (Fin 3) K} (h : det3 M ≠ 0) : M.det ≠ 0 := by
  rwa [det_eq_det3]

omit [DecidableEq K] in
/-- A nonzero vector in the kernel shows that a square matrix of any size is singular. -/
theorem det_eq_zero_of_mulVec_eq_zero {n : ℕ} {M : Matrix (Fin n) (Fin n) K} (v : Fin n → K)
    (hv : v ≠ 0) (hMv : M.mulVec v = 0) : M.det = 0 :=
  exists_mulVec_eq_zero_iff.mp ⟨v, hv, hMv⟩

omit [DecidableEq K] in
/-- An MDS matrix is invertible: its determinant is its only order-`n` minor, and
`isMDS_injective` already shows that it has trivial kernel. -/
theorem det_ne_zero_of_isMDS {n : ℕ} {M : Matrix (Fin n) (Fin n) K} (hM : IsMDS M) :
    M.det ≠ 0 := by
  classical
  intro h
  obtain ⟨v, hv, hMv⟩ := exists_mulVec_eq_zero_iff.mpr h
  exact hv (isMDS_injective hM (by rw [hMv, mulVec_zero]))

end Cryptificate.Mat3
