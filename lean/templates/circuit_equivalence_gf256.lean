
/-- The submitted circuit computes the candidate matrix on every input: its coefficient
matrix, computed once per register, equals `candMatrix`. -/
theorem circuit_equivalence : ∀ x, candProgram.eval x = candMatrix.mulVec x :=
  Circuit.Program.implements_of_checkEquiv (by decide +kernel)
