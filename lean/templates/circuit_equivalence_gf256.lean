
/-- The submitted circuit is well formed and computes the candidate matrix on every input: its
coefficient matrix, computed once per register, equals `candMatrix`. -/
theorem circuit_equivalence :
    candProgram.WellFormed ∧ ∀ x, candProgram.eval x = candMatrix.mulVec x :=
  Circuit.Program.wellFormed_implements_of_checkEquiv (by decide +kernel)
