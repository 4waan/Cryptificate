
/-- The submitted circuit computes the candidate's internal matrix on every input: its
coefficient matrix, computed once per register, equals `candInternal`. -/
theorem circuit_equivalence : ∀ x, candProgram.eval x = candInternal.mulVec x :=
  Circuit.Program.implements_of_checkEquiv (by decide +kernel)
