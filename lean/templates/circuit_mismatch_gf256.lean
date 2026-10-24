
/-- The input on which the submitted circuit and the candidate matrix are compared. -/
def witnessInput : Fin 4 → GF256 := gfVec4 {{WITNESS_INPUT}}

/-- The candidate matrix applied to `witnessInput`. -/
def witnessExpected : Fin 4 → GF256 := gfVec4 {{WITNESS_EXPECTED}}

/-- The submitted circuit's output on `witnessInput`. -/
def witnessActual : Fin 4 → GF256 := gfVec4 {{WITNESS_ACTUAL}}

#eval Audit.echoInput "witnessInput" witnessInput
#eval Audit.echoInput "witnessExpected" witnessExpected
#eval Audit.echoInput "witnessActual" witnessActual

/-- On `witnessInput` the candidate matrix gives `witnessExpected` and the submitted circuit
gives `witnessActual`; they differ, so the circuit does not compute the matrix. -/
theorem circuit_mismatch :
    candMatrix.mulVec witnessInput = witnessExpected ∧
      candProgram.eval witnessInput = witnessActual ∧
      ¬ ∀ x, candProgram.eval x = candMatrix.mulVec x :=
  Circuit.Program.mismatch (by decide +kernel)
