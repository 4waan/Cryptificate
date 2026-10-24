import Cryptificate

/-!
# Example: AES `MixColumns` and its shared-sum circuit

The known implementation with `4` `xtime`s and `15` xors. It computes `t = a₀ ⊕ a₁ ⊕ a₂ ⊕ a₃`
once (registers `4`–`6`) and then, for each row `i`, `out_i = a_i ⊕ xtime(a_i ⊕ a_{i+1}) ⊕ t`.
The certificate proves that this circuit computes the `MixColumns` matrix on every input.

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
  gfProgram4 [.add 0 1, .add 4 2, .add 5 3, .add 0 1, .mul 0x02 7, .add 0 8, .add 9 6, .add 1 2, .mul 0x02 11, .add 1 12, .add 13 6, .add 2 3, .mul 0x02 15, .add 2 16, .add 17 6, .add 3 0, .mul 0x02 19, .add 3 20, .add 21 6] 10 14 18 22

#eval Audit.echoInput "candProgram" candProgram

/-- The candidate's `4 × 4` mixing matrix over `GF(2⁸)`, row-major as submitted. -/
def candMatrix : Matrix (Fin 4) (Fin 4) GF256 :=
  gfMat4 0x02 0x03 0x01 0x01 0x01 0x02 0x03 0x01 0x01 0x01 0x02 0x03 0x03 0x01 0x01 0x02

#eval Audit.echoInput "candMatrix" candMatrix

/-- The submitted circuit computes the candidate matrix on every input: its coefficient
matrix, computed once per register, equals `candMatrix`. -/
theorem circuit_equivalence : ∀ x, candProgram.eval x = candMatrix.mulVec x :=
  Circuit.Program.implements_of_checkEquiv (by decide +kernel)

end CryptificateJob
#cryptificate_audit CryptificateJob.circuit_equivalence
