import Cryptificate

/-!
# Example: one wire goes wrong

The shared-sum `MixColumns` circuit with a single changed operand: the first output uses
`xtime(a₀ ⊕ a₂)` instead of `xtime(a₀ ⊕ a₁)` (instruction `3`, defining register `7`, reads
register `2` instead of `1`). On the basis input `[00,01,00,00]` the matrix gives its second
column `[03,02,01,01]`, while the circuit gives `[01,02,01,01]`, so the certificate refutes the
equivalence and records both outputs.

Instantiated by `scripts/instantiate.py` from the fragments `header`, `const_program_gf256`,
`const_matrix_gf256`, `circuit_mismatch_gf256` and `footer`.
-/

set_option autoImplicit false
set_option maxRecDepth 16000
set_option maxHeartbeats 2000000

namespace CryptificateJob

open Cryptificate

/-- The submitted circuit over `GF(2⁸)`, width four. -/
def candProgram : Circuit.Program GF256 4 :=
  gfProgram4 [.add 0 1, .add 4 2, .add 5 3, .add 0 2, .mul 0x02 7, .add 0 8, .add 9 6, .add 1 2, .mul 0x02 11, .add 1 12, .add 13 6, .add 2 3, .mul 0x02 15, .add 2 16, .add 17 6, .add 3 0, .mul 0x02 19, .add 3 20, .add 21 6] 10 14 18 22

#eval Audit.echoInput "candProgram" candProgram

/-- The candidate's `4 × 4` mixing matrix over `GF(2⁸)`, row-major as submitted. -/
def candMatrix : Matrix (Fin 4) (Fin 4) GF256 :=
  gfMat4 0x02 0x03 0x01 0x01 0x01 0x02 0x03 0x01 0x01 0x01 0x02 0x03 0x03 0x01 0x01 0x02

#eval Audit.echoInput "candMatrix" candMatrix

/-- The input on which the submitted circuit and the candidate matrix are compared. -/
def witnessInput : Fin 4 → GF256 := gfVec4 0x00 0x01 0x00 0x00

/-- The candidate matrix applied to `witnessInput`. -/
def witnessExpected : Fin 4 → GF256 := gfVec4 0x03 0x02 0x01 0x01

/-- The submitted circuit's output on `witnessInput`. -/
def witnessActual : Fin 4 → GF256 := gfVec4 0x01 0x02 0x01 0x01

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

end CryptificateJob
#cryptificate_audit CryptificateJob.circuit_mismatch
