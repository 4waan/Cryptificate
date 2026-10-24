
/-- The submitted circuit computes the candidate's external matrix on every input: its
coefficient matrix, computed once per register, equals `candExternal`. -/
theorem circuit_equivalence : ∀ x, candProgram.eval x = candExternal.mulVec x :=
  Circuit.Program.implements_of_checkEquiv (by decide +kernel)
