import Cryptificate

/-!
# Example: the identity circuit

No instructions; the outputs are the input registers `0 1 2 3`. Its coefficient matrix is the
identity, so it implements the identity matrix exactly. (A perfect implementation of a matrix
with no diffusion at all: the equivalence claim says nothing about the quality of the matrix.)

Instantiated by `scripts/instantiate.py` from the fragments `header`, `const_program_gf256`,
`const_matrix_gf256`, `circuit_equivalence_gf256` and `footer`.
-/

set_option autoImplicit false
set_option maxRecDepth 16000
set_option maxHeartbeats 2000000

namespace CryptificateJob

open Cryptificate

/-- The submitted circuit over `GF(2⁸)`, width four. -/
def candProgram : Circuit.Program GF256 4 :=
  gfProgram4 [] 0 1 2 3

#eval Audit.echoInput "candProgram" candProgram

/-- The candidate's `4 × 4` mixing matrix over `GF(2⁸)`, row-major as submitted. -/
def candMatrix : Matrix (Fin 4) (Fin 4) GF256 :=
  gfMat4 0x01 0x00 0x00 0x00 0x00 0x01 0x00 0x00 0x00 0x00 0x01 0x00 0x00 0x00 0x00 0x01

#eval Audit.echoInput "candMatrix" candMatrix

/-- The submitted circuit is well formed and computes the candidate matrix on every input: its
coefficient matrix, computed once per register, equals `candMatrix`. -/
theorem circuit_equivalence :
    candProgram.WellFormed ∧ ∀ x, candProgram.eval x = candMatrix.mulVec x :=
  Circuit.Program.wellFormed_implements_of_checkEquiv (by decide +kernel)

end CryptificateJob
#cryptificate_audit CryptificateJob.circuit_equivalence
