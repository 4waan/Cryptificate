import Cryptificate.Circuit.Coefficients

/-!
# Deciding circuit equivalence and refuting it with a witness

Certificates never ask the kernel to reason about all inputs of a circuit. The coefficient theorem
(`Program.implements_iff`) has already turned "the circuit computes `M` on every input" into "the
coefficient matrix of the circuit is `M`", a finite comparison of `n²` field elements. This file
packages that comparison, together with the well-formedness check, as one Boolean function
`Program.checkEquiv` and proves it sound and complete. A certificate then closes its goal with
`implements_of_checkEquiv` and a single `decide +kernel` on a concrete program and matrix: the
kernel computes each coefficient row once, compares, and is done.

Refutation goes the other way. If one specific input `v` (the generator picks a standard basis
vector, which exposes a wrong coefficient column) gives a circuit output different from `M v`,
the circuit cannot compute `M` everywhere. `Program.mismatch` states this together with the two
concrete output vectors, so the certificate records exactly what the reference computes, what the
circuit computes, and that the two differ; all three facts are checked by evaluating the circuit
and the matrix product on that one input.

The comparisons are written with `List.all` over `List.finRange n` rather than through the
`Decidable` instance for equality of functions `Fin n → K`, which goes through `Finset.univ` and
`Multiset`; the direct form is simpler for the kernel to evaluate and easy to prove correct.
-/

set_option autoImplicit false

namespace Cryptificate.Circuit

variable {K : Type*} {n : ℕ}

/-- Boolean equality of two vectors, coordinate by coordinate. -/
def vecEqb [DecidableEq K] (u v : Fin n → K) : Bool :=
  (List.finRange n).all fun i => decide (u i = v i)

theorem vecEqb_iff [DecidableEq K] (u v : Fin n → K) : vecEqb u v = true ↔ u = v := by
  simp only [vecEqb, List.all_eq_true, List.mem_finRange, decide_eq_true_eq, true_implies]
  exact funext_iff.symm

namespace Program

variable [Semiring K] [DecidableEq K]

/-- Boolean comparison of the coefficient matrix of `p` with `M`, entry by entry. Each output
row is computed once and then compared coordinate by coordinate. -/
def coeffEqb (p : Program K n) (M : Matrix (Fin n) (Fin n) K) : Bool :=
  (List.finRange n).all fun i =>
    let row := p.outputRow i
    (List.finRange n).all fun j => decide (coeff row j = M i j)

theorem coeffEqb_iff (p : Program K n) (M : Matrix (Fin n) (Fin n) K) :
    p.coeffEqb M = true ↔ p.coeffMatrix = M := by
  simp only [coeffEqb, List.all_eq_true, List.mem_finRange, decide_eq_true_eq, true_implies]
  constructor
  · intro h
    ext i j
    exact h i j
  · rintro rfl i j
    rfl

/-- The certificate check: `p` is well formed and its coefficient matrix is `M`. -/
def checkEquiv (p : Program K n) (M : Matrix (Fin n) (Fin n) K) : Bool :=
  p.wellFormedb && p.coeffEqb M

/-- `checkEquiv` is exact: it accepts precisely the well-formed programs that compute `M` on
every input. -/
theorem checkEquiv_iff (p : Program K n) (M : Matrix (Fin n) (Fin n) K) :
    p.checkEquiv M = true ↔ p.WellFormed ∧ ∀ x, p.eval x = M.mulVec x := by
  rw [checkEquiv, Bool.and_eq_true, wellFormedb_iff, coeffEqb_iff, implements_iff]

/-- **Equivalence from a passed check.** The certificate form: a concrete `decide` on
`checkEquiv` yields the statement about all inputs. -/
theorem implements_of_checkEquiv {p : Program K n} {M : Matrix (Fin n) (Fin n) K}
    (h : p.checkEquiv M = true) : ∀ x, p.eval x = M.mulVec x :=
  ((checkEquiv_iff p M).mp h).2

omit [DecidableEq K] in
/-- One input on which `p` and `M` disagree rules out equivalence. -/
theorem not_implements_of_ne {p : Program K n} {M : Matrix (Fin n) (Fin n) K} (v : Fin n → K)
    (h : p.eval v ≠ M.mulVec v) : ¬ ∀ x, p.eval x = M.mulVec x :=
  fun hall => h (hall v)

/-- The same refutation with the disagreement checked by `vecEqb`, the form a certificate
decides when it does not need to record the two outputs. -/
theorem not_implements_of_vecEqb {p : Program K n} {M : Matrix (Fin n) (Fin n) K}
    (v : Fin n → K) (h : vecEqb (p.eval v) (M.mulVec v) = false) :
    ¬ ∀ x, p.eval x = M.mulVec x :=
  not_implements_of_ne v fun heq => by simp [heq, vecEqb] at h

/-- The refutation check: on input `v`, the reference product is `expected`, the circuit
outputs `actual`, and the two differ. -/
def mismatchCheck (p : Program K n) (M : Matrix (Fin n) (Fin n) K)
    (v expected actual : Fin n → K) : Bool :=
  vecEqb (M.mulVec v) expected && vecEqb (p.eval v) actual && !vecEqb expected actual

/-- **Refutation from a witness.** If the check passes, the reference product and the circuit
output on `v` are the stated vectors, and the circuit does not compute `M`. -/
theorem mismatch {p : Program K n} {M : Matrix (Fin n) (Fin n) K}
    {v expected actual : Fin n → K} (h : p.mismatchCheck M v expected actual = true) :
    M.mulVec v = expected ∧ p.eval v = actual ∧ ¬ ∀ x, p.eval x = M.mulVec x := by
  simp only [mismatchCheck, Bool.and_eq_true, Bool.not_eq_true', vecEqb_iff] at h
  obtain ⟨⟨hM, hp⟩, hne⟩ := h
  refine ⟨hM, hp, not_implements_of_ne v ?_⟩
  rw [hM, hp]
  intro heq
  rw [heq] at hne
  simp [vecEqb] at hne

end Program

end Cryptificate.Circuit
