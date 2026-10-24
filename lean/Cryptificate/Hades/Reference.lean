import Cryptificate.Hades.Design
import Cryptificate.PrimePower

/-!
# The reference Poseidon2 design, against WideTrail

WideTrail pins Poseidon2 over the BN254 scalar field at width three
(`Poseidon2.BN254.permutation`: external matrix `[[2,1,1],[1,2,1],[1,1,2]]`, internal matrix
`[[2,1,1],[1,2,1],[1,1,3]]`, `x ↦ x ^ 5`, four full rounds, `56` partial rounds with the S-box on
coordinate `0`, four full rounds, constants from the HorizenLabs reference) and proves that two
distinct inputs activate at least `16` S-boxes (`Poseidon2.BN254.activity`).

This file checks the execution model of `Hades.Design` against that pinned permutation:
`reference_permutation` says that `Design.permutation`, run on the reference values with mask
`{0}` and WideTrail's constants, is WideTrail's permutation on every input. So the operation
order of `Design.round` (constants, masked S-box, matrix) and the initial external layer are
those of the reference, not a reinterpretation. `reference_activity` then recovers the figure
`16` through `Design.outer_activity`, counting the full rounds only.
-/

set_option autoImplicit false

namespace Cryptificate.Hades

open Poseidon2.BN254

/-- The reference parameters as submitted data. -/
def reference : Design F 3 where
  external := externalMatrix
  internal := internalMatrix
  exponent := 5
  fullRounds := 8
  partialRounds := 56

/-- Each round of the reference design is the corresponding round of WideTrail's schedule. -/
theorem reference_execute (x : State) (n : ℕ) :
    Hades.execute rounds x n = reference.execute {0} values x n := by
  induction n with
  | zero => rfl
  | succ n ih =>
    rw [Hades.execute_succ, ih]
    change linear n _ = (reference.linear n).mulVec _
    have hcond : (n < reference.half ∨ reference.half + reference.partialRounds ≤ n) ↔
        (n < 4 ∨ 60 ≤ n) := Iff.rfl
    unfold linear Design.linear
    by_cases h : n < 4 ∨ 60 ≤ n
    · rw [if_pos h, if_pos (hcond.mpr h), external_eq_mulVec]
      rfl
    · rw [if_neg h, if_neg (fun h' => h (hcond.mp h')), internal_eq_mulVec]
      rfl

/-- **The execution model is WideTrail's Poseidon2.** With mask `{0}` and the reference round
constants, `Design.permutation` of the reference parameters is `Poseidon2.BN254.permutation`. -/
theorem reference_permutation : reference.permutation {0} values = permutation := by
  funext x
  rw [Design.permutation, Poseidon2.BN254.permutation, external_eq_mulVec, reference_execute]
  rfl

/-- The reference internal matrix has determinant `7`. -/
theorem reference_internal_det : reference.internal.det ≠ 0 :=
  Mat3.det_ne_zero_of_det3 (by decide)

/-- The full-round bound of the reference parameters is WideTrail's `16`. -/
theorem reference_outerBound : reference.outerBound = 16 := rfl

/-- **WideTrail's figure, full rounds only.** For the reference parameters, any mask, any
round constants and two distinct inputs, the eight full rounds contain at least `16` S-boxes
with a nonzero input difference. -/
theorem reference_activity (partialMask : Finset (Fin 3)) (c : ℕ → State) {x y : State}
    (hxy : x ≠ y) : 16 ≤ reference.outerActivity partialMask c x y :=
  reference_outerBound ▸ reference.outer_activity external_mds reference_internal_det
    (PrimePower.BN254.pow_bijective 5 inverseExponent 4 (by decide) inverseExponent_positive
      inverseExponent_equation) partialMask c hxy

end Cryptificate.Hades
