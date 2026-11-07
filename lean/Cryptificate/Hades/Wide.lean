import Cryptificate.Hades.Partial
import Cryptificate.Diffusion.Minors4

/-!
# Partial-round certificates beyond width three

`Hades.Partial` proves the partial-round results for every field and width, and gives the
certificates used at width three: `observable_of_rows3` (three rows with a nonzero `3 × 3`
determinant), `powers_zero_of_invariant2` (an invariant subspace of dimension at most two) and
`powers_zero_of_short` (at most two partial rounds). This file adds what width four needs, and
states the subspace and short certificates for any dimension:

* `observable_of_rows4`: four rows `eᵢ Mʲ` at masked positions, `j < L`, with a nonzero `4 × 4`
  determinant (`det4`, the explicit cofactor formula of `Diffusion.Minors4`) make `M` observable
  from the mask in `L` steps.
* `powers_zero_of_invariant`: vectors `B₀, …, B_{r-1}` that vanish on the mask and that `M` maps
  into their span with explicit coefficients, `M Bₖ = ∑ₗ Aₖₗ Bₗ`, keep every power of `M` at zero on
  the mask, starting from any of them. At width four the largest subspace that every power of `M`
  keeps at zero on a nonempty mask can have dimension three, beyond `powers_zero_of_invariant2`.
* `powers_zero_of_rows`: for `L` partial rounds it suffices that the rows `obsRow M i j`, `j < L`,
  `i` masked, are orthogonal to `v`; the kernel computes each row by `j` vector-matrix products.
* `det_ne_zero_of_det4`: the explicit `4 × 4` determinant decides invertibility.
-/

set_option autoImplicit false

open Matrix

namespace Cryptificate

variable {K : Type*} [Field K]

/-- A nonzero explicit `4 × 4` determinant shows that a matrix is invertible. -/
theorem det_ne_zero_of_det4 {M : Matrix (Fin 4) (Fin 4) K} (h : det4 M ≠ 0) : M.det ≠ 0 := by
  rwa [det_eq_det4]

namespace Hades

variable {t : ℕ}

/-- **The observability certificate for width four.** Four rows of the powers `M ^ j`, `j < L`,
taken at masked positions, with a nonzero determinant: then `M` is observable from the mask in
`L` steps. -/
theorem observable_of_rows4 (M : Matrix (Fin 4) (Fin 4) K) (P : Finset (Fin 4)) (L : ℕ)
    (pw : Fin 4 → ℕ) (co : Fin 4 → Fin 4) (hpw : ∀ k, pw k < L) (hco : ∀ k, co k ∈ P)
    (hdet : det4 (Matrix.of fun k => obsRow M (co k) (pw k)) ≠ 0) : Observable M P L := by
  intro d hd
  set R : Matrix (Fin 4) (Fin 4) K := Matrix.of fun k => obsRow M (co k) (pw k) with hR
  have hRd : R.mulVec d = 0 := by
    funext k
    change obsRow M (co k) (pw k) ⬝ᵥ d = 0
    rw [obsRow_dotProduct]
    exact hd _ (hpw k) _ (hco k)
  have hdet' : R.det ≠ 0 := det_ne_zero_of_det4 hdet
  by_contra hne
  exact hdet' (Mat3.det_eq_zero_of_mulVec_eq_zero d hne hRd)

/-- **The invariant-subspace certificate, any dimension.** If `M` maps each `Bₖ` to
`∑ₗ Aₖₗ • Bₗ` and every `Bₖ` vanishes on `P`, then every power of `M` keeps each `Bₖ` at zero on
`P`. -/
theorem powers_zero_of_invariant {r : ℕ} (M : Matrix (Fin t) (Fin t) K) (P : Finset (Fin t))
    (B : Fin r → Fin t → K) (A : Fin r → Fin r → K)
    (hM : ∀ k, M.mulVec (B k) = ∑ l, A k l • B l) (hz : ∀ k, ∀ i ∈ P, B k i = 0)
    (k₀ : Fin r) : ∀ j, ∀ i ∈ P, ((M ^ j).mulVec (B k₀)) i = 0 := by
  have hspan : ∀ j, ∃ c : Fin r → K, (M ^ j).mulVec (B k₀) = ∑ l, c l • B l := by
    intro j
    induction j with
    | zero =>
      refine ⟨fun l => if l = k₀ then 1 else 0, ?_⟩
      simp [ite_smul]
    | succ j ih =>
      obtain ⟨c, hc⟩ := ih
      refine ⟨fun m => ∑ l, c l * A l m, ?_⟩
      rw [pow_succ', ← mulVec_mulVec, hc, mulVec_sum]
      simp only [mulVec_smul, hM, Finset.smul_sum, smul_smul, Finset.sum_smul]
      exact Finset.sum_comm
  intro j i hi
  obtain ⟨c, hc⟩ := hspan j
  rw [hc, Finset.sum_apply]
  exact Finset.sum_eq_zero fun l _ => by simp [hz l i hi]

/-- **The short certificate, any number of rounds.** If the rows `obsRow M i j`, `j < L`, at the
masked positions are orthogonal to `v`, then `M ^ j` keeps `v` at zero on `P` for every
`j < L`. -/
theorem powers_zero_of_rows (M : Matrix (Fin t) (Fin t) K) (P : Finset (Fin t))
    (v : Fin t → K) (L : ℕ) (h : ∀ j < L, ∀ i ∈ P, obsRow M i j ⬝ᵥ v = 0) :
    ∀ j < L, ∀ i ∈ P, ((M ^ j).mulVec v) i = 0 := by
  intro j hj i hi
  rw [← obsRow_dotProduct]
  exact h j hj i hi

end Hades

end Cryptificate
