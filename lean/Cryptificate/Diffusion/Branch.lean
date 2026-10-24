import WideTrail

/-!
# Refuting the MDS property with one vector

`isMDS_branch_bound` (WideTrail, `Algebra/MDS.lean`) says that an MDS matrix of size `n`
gives every nonzero input `x` at least `n + 1` nonzero coordinates across `x` and `M x`
together. Its contrapositive is a refutation that needs no minors at all: one nonzero `x`
whose combined weight is at most `n` shows that some square submatrix of `M` is singular.

The vector is found outside the kernel (Gaussian elimination on a singular minor gives one),
and the kernel only has to evaluate one matrix-vector product and count nonzero bytes. The
identity matrix and `x = [01, 00, 00, 00]` are the smallest example: the combined weight is
`1 + 1 = 2`, short of the `5` an MDS matrix of size `4` would force.
-/

set_option autoImplicit false

namespace Cryptificate

variable {K : Type*} [Field K] [DecidableEq K] {n : ℕ}

/-- **A low-weight vector refutes the MDS property.** If `x ≠ 0` and `x` and `M x` together
have at most `n` nonzero coordinates, then `M` is not MDS. -/
theorem not_isMDS_of_witness {M : Matrix (Fin n) (Fin n) K} (x : Fin n → K) (hx : x ≠ 0)
    (hw : weight x + weight (M.mulVec x) < n + 1) : ¬ IsMDS M := by
  intro hM
  have hpos : 0 < weight x := by
    rw [weight, Finset.card_pos, Finset.nonempty_iff_ne_empty]
    exact fun h => hx (activePattern_eq_empty.mp h)
  have := isMDS_branch_bound hM x (by omega)
  omega

end Cryptificate
