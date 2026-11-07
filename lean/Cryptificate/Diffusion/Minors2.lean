import WideTrail

/-!
# Canonical minors of a `2 × 2` matrix

The width-two counterpart of `Diffusion.Minors3`: a `2 × 2` matrix has `5` nonempty square
submatrices chosen by increasing rows and columns, its four entries and itself. `minorsOk`
evaluates them by explicit formulas, and `isMDS_of_minorsOk`, proved once for every field, turns a
passing check into WideTrail's `IsMDS`. A certificate for a concrete matrix is one kernel
evaluation:

    Mat2.isMDS_of_minorsOk M (by decide)

As in `Minors3`, `Matrix.det` is never evaluated: `det2` is linked to it symbolically by
`Matrix.det_fin_two`, and a strictly increasing selection of order two is the identity
(`StrictMono.eq_id`).
-/

set_option autoImplicit false

open Matrix

namespace Cryptificate.Mat2

variable {K : Type*} [Field K]

/-- The two indices of `Fin 2`. -/
def fin2 : List (Fin 2) := [0, 1]

/-- The determinant of a `2 × 2` matrix, by the formula of `Matrix.det_fin_two`. -/
def det2 (M : Matrix (Fin 2) (Fin 2) K) : K := M 0 0 * M 1 1 - M 0 1 * M 1 0

theorem det_eq_det2 (M : Matrix (Fin 2) (Fin 2) K) : M.det = det2 M := by
  rw [det_fin_two]
  rfl

theorem mem_fin2 : ∀ i : Fin 2, i ∈ fin2 := by decide

variable [DecidableEq K]

/-- The canonical-minor certificate: the `4` entries and the determinant are nonzero. -/
def minorsOk (M : Matrix (Fin 2) (Fin 2) K) : Bool :=
  (fin2.all fun i => fin2.all fun j => decide (M i j ≠ 0)) && decide (det2 M ≠ 0)

/-- Every submatrix chosen by strictly increasing rows and columns is nonsingular, once the
check passes. -/
theorem det_submatrix_ne_zero_of_minorsOk {M : Matrix (Fin 2) (Fin 2) K}
    (h : minorsOk M = true) {k : ℕ} (r c : Fin k → Fin 2) (hr : StrictMono r)
    (hc : StrictMono c) : (M.submatrix r c).det ≠ 0 := by
  simp only [minorsOk, Bool.and_eq_true, List.all_eq_true, decide_eq_true_eq] at h
  obtain ⟨h1, h2⟩ := h
  have hk : k ≤ 2 := by simpa using Fintype.card_le_of_injective r hr.injective
  interval_cases k
  · rw [det_fin_zero]
    exact one_ne_zero
  · rw [det_fin_one]
    exact h1 (r 0) (mem_fin2 _) (c 0) (mem_fin2 _)
  · obtain rfl := hr.eq_id
    obtain rfl := hc.eq_id
    rw [submatrix_id_id, det_eq_det2]
    exact h2

/-- **The canonical-minor certificate is sound.** If `minorsOk M` evaluates to `true`, then `M`
is MDS in the sense of WideTrail's `IsMDS`, and so has branch number `3`. -/
theorem isMDS_of_minorsOk (M : Matrix (Fin 2) (Fin 2) K) (h : minorsOk M = true) : IsMDS M := by
  intro k Row Col hRow hCol
  exact det_submatrix_ne_zero_of_minorsOk h _ _ (Row.orderEmbOfFin hRow).strictMono
    (Col.orderEmbOfFin hCol).strictMono

omit [DecidableEq K] in
/-- An explicit nonzero determinant: the certificate that a `2 × 2` matrix is invertible. -/
theorem det_ne_zero_of_det2 {M : Matrix (Fin 2) (Fin 2) K} (h : det2 M ≠ 0) : M.det ≠ 0 := by
  rwa [det_eq_det2]

end Cryptificate.Mat2
