
/-- The input on which the submitted circuit and the candidate's external matrix are compared. -/
def witnessInput : Fin 3 → Poseidon2.BN254.F := bnVec3 {{WITNESS_INPUT}}

/-- The external matrix applied to `witnessInput`. -/
def witnessExpected : Fin 3 → Poseidon2.BN254.F := bnVec3 {{WITNESS_EXPECTED}}

/-- The submitted circuit's output on `witnessInput`. -/
def witnessActual : Fin 3 → Poseidon2.BN254.F := bnVec3 {{WITNESS_ACTUAL}}

#eval Audit.echoInput "witnessInput" witnessInput
#eval Audit.echoInput "witnessExpected" witnessExpected
#eval Audit.echoInput "witnessActual" witnessActual

/-- The submitted circuit is well formed, and on `witnessInput` the external matrix gives
`witnessExpected` while the circuit gives `witnessActual`; they differ, so the circuit does not
compute the matrix. -/
theorem circuit_mismatch :
    candProgram.WellFormed ∧ candExternal.mulVec witnessInput = witnessExpected ∧
      candProgram.eval witnessInput = witnessActual ∧
      ¬ ∀ x, candProgram.eval x = candExternal.mulVec x :=
  Circuit.Program.refutes_of_checkRefute (by decide +kernel)
