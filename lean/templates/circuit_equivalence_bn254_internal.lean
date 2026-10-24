
/-- The submitted circuit is well formed and computes the candidate's internal matrix on every
input: its coefficient matrix, computed once per register, equals `candInternal`. -/
theorem circuit_equivalence :
    candProgram.WellFormed ∧ ∀ x, candProgram.eval x = candInternal.mulVec x :=
  Circuit.Program.wellFormed_implements_of_checkEquiv (by decide +kernel)
