import Cryptificate

/-!
# Example: the BN254 shared-sum circuit is not the internal matrix

The same circuit (`s = x₀ + x₁ + x₂`, then `yᵢ = s + xᵢ`) checked against the Poseidon2-style
internal matrix `[[2,1,1],[1,2,1],[1,1,3]]`, which differs in its last diagonal entry. On the
basis input `[0,0,1]` the matrix gives its third column `[1,1,3]` and the circuit gives
`[1,1,2]`, so the certificate refutes the equivalence and records both outputs.

Instantiated by `scripts/instantiate.py` from the fragments `header`, `const_program_bn254`,
`circuit_mismatch_bn254_internal` and `footer`, with `candInternal` supplied by a stand-in
constant fragment of the same shape as the other matrix constants.
-/

set_option autoImplicit false
set_option maxRecDepth 16000
set_option maxHeartbeats 2000000

namespace CryptificateJob

open Cryptificate

/-- The submitted circuit over the BN254 scalar field, width three. -/
def candProgram : Circuit.Program Poseidon2.BN254.F 3 :=
  bnProgram3 [.add 0 1, .add 3 2, .add 4 0, .add 4 1, .add 4 2] 5 6 7

#eval Audit.echoInput "candProgram" candProgram

/-- The candidate's internal matrix over the BN254 scalar field, row-major as submitted. -/
def candInternal : Matrix (Fin 3) (Fin 3) Poseidon2.BN254.F :=
  bnMat3 2 1 1 1 2 1 1 1 3

#eval Audit.echoInput "candInternal" candInternal

/-- The input on which the submitted circuit and the candidate's internal matrix are compared. -/
def witnessInput : Fin 3 → Poseidon2.BN254.F := bnVec3 0 0 1

/-- The internal matrix applied to `witnessInput`. -/
def witnessExpected : Fin 3 → Poseidon2.BN254.F := bnVec3 1 1 3

/-- The submitted circuit's output on `witnessInput`. -/
def witnessActual : Fin 3 → Poseidon2.BN254.F := bnVec3 1 1 2

#eval Audit.echoInput "witnessInput" witnessInput
#eval Audit.echoInput "witnessExpected" witnessExpected
#eval Audit.echoInput "witnessActual" witnessActual

/-- The submitted circuit is well formed, and on `witnessInput` the internal matrix gives
`witnessExpected` while the circuit gives `witnessActual`; they differ, so the circuit does not
compute the matrix. -/
theorem circuit_mismatch :
    candProgram.WellFormed ∧ candInternal.mulVec witnessInput = witnessExpected ∧
      candProgram.eval witnessInput = witnessActual ∧
      ¬ ∀ x, candProgram.eval x = candInternal.mulVec x :=
  Circuit.Program.refutes_of_checkRefute (by decide +kernel)

end CryptificateJob
#cryptificate_audit CryptificateJob.circuit_mismatch
