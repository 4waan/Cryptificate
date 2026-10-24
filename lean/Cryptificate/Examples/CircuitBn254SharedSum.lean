import Cryptificate

/-!
# Example: a shared-sum circuit over the BN254 scalar field

The Poseidon2 external matrix of width three, `[[2,1,1],[1,2,1],[1,1,2]]`, is the identity plus
the all-ones matrix, so it costs one shared sum and three additions: `s = x₀ + x₁ + x₂`, then
`yᵢ = s + xᵢ`. The certificate proves that this five-instruction circuit computes the matrix on
every input.

Instantiated by `scripts/instantiate.py` from the fragments `header`, `const_program_bn254`,
`const_external_bn254`, `circuit_equivalence_bn254_external` and `footer`.
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

/-- The candidate's external matrix over the BN254 scalar field, row-major as submitted. HADES
mixes with it in every full round and, as Poseidon2 does, once before the first round. -/
def candExternal : Matrix (Fin 3) (Fin 3) Poseidon2.BN254.F :=
  bnMat3 2 1 1 1 2 1 1 1 2

#eval Audit.echoInput "candExternal" candExternal

/-- The submitted circuit is well formed and computes the candidate's external matrix on every
input: its coefficient matrix, computed once per register, equals `candExternal`. -/
theorem circuit_equivalence :
    candProgram.WellFormed ∧ ∀ x, candProgram.eval x = candExternal.mulVec x :=
  Circuit.Program.wellFormed_implements_of_checkEquiv (by decide +kernel)

end CryptificateJob
#cryptificate_audit CryptificateJob.circuit_equivalence
