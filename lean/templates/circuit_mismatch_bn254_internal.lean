
/-- The input on which the submitted circuit and the candidate's internal matrix are compared. -/
def witnessInput : Fin 3 → Poseidon2.BN254.F := bnVec3 {{WITNESS_INPUT}}

/-- The internal matrix applied to `witnessInput`. -/
def witnessExpected : Fin 3 → Poseidon2.BN254.F := bnVec3 {{WITNESS_EXPECTED}}

/-- The submitted circuit's output on `witnessInput`. -/
def witnessActual : Fin 3 → Poseidon2.BN254.F := bnVec3 {{WITNESS_ACTUAL}}

#eval Audit.echoInput "witnessInput" witnessInput
#eval Audit.echoInput "witnessExpected" witnessExpected
#eval Audit.echoInput "witnessActual" witnessActual

/-- On `witnessInput` the internal matrix gives `witnessExpected` and the submitted circuit
gives `witnessActual`; they differ, so the circuit does not compute the matrix. -/
theorem circuit_mismatch :
    candInternal.mulVec witnessInput = witnessExpected ∧
      candProgram.eval witnessInput = witnessActual ∧
      ¬ ∀ x, candProgram.eval x = candInternal.mulVec x :=
  Circuit.Program.mismatch (by decide +kernel)
