import Cryptificate

/-!
# Example: a 256-instruction circuit with heavy sharing

Thirteen layers of the shared-sum `MixColumns` circuit, each layer reading every output of the
previous one several times, followed by a chain of eight `xtime`s applied to output `1` and
added into output `0`: `256` instructions, the most a certificate accepts. Unfolded as an
expression tree, output `0` alone would have `419,852,378,437` nodes; the coefficient pass
computes each of the `260` registers once.

`MixColumns` has multiplicative order four, so thirteen layers compose to `MixColumns` again,
and `x⁸ = 1B` in `GF(2⁸)`, so the expected matrix is `MixColumns` with `1B` times its second
row added to its first: first row `[19,35,2C,1A]`. The matrix was computed independently of
Lean; the certificate checks it.

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
  gfProgram4 [.add 0 1, .add 4 2, .add 5 3, .add 0 1, .mul 0x02 7, .add 0 8, .add 9 6, .add 1 2, .mul 0x02 11, .add 1 12, .add 13 6, .add 2 3, .mul 0x02 15, .add 2 16, .add 17 6, .add 3 0, .mul 0x02 19, .add 3 20, .add 21 6, .add 10 14, .add 23 18, .add 24 22, .add 10 14, .mul 0x02 26, .add 10 27, .add 28 25, .add 14 18, .mul 0x02 30, .add 14 31, .add 32 25, .add 18 22, .mul 0x02 34, .add 18 35, .add 36 25, .add 22 10, .mul 0x02 38, .add 22 39, .add 40 25, .add 29 33, .add 42 37, .add 43 41, .add 29 33, .mul 0x02 45, .add 29 46, .add 47 44, .add 33 37, .mul 0x02 49, .add 33 50, .add 51 44, .add 37 41, .mul 0x02 53, .add 37 54, .add 55 44, .add 41 29, .mul 0x02 57, .add 41 58, .add 59 44, .add 48 52, .add 61 56, .add 62 60, .add 48 52, .mul 0x02 64, .add 48 65, .add 66 63, .add 52 56, .mul 0x02 68, .add 52 69, .add 70 63, .add 56 60, .mul 0x02 72, .add 56 73, .add 74 63, .add 60 48, .mul 0x02 76, .add 60 77, .add 78 63, .add 67 71, .add 80 75, .add 81 79, .add 67 71, .mul 0x02 83, .add 67 84, .add 85 82, .add 71 75, .mul 0x02 87, .add 71 88, .add 89 82, .add 75 79, .mul 0x02 91, .add 75 92, .add 93 82, .add 79 67, .mul 0x02 95, .add 79 96, .add 97 82, .add 86 90, .add 99 94, .add 100 98, .add 86 90, .mul 0x02 102, .add 86 103, .add 104 101, .add 90 94, .mul 0x02 106, .add 90 107, .add 108 101, .add 94 98, .mul 0x02 110, .add 94 111, .add 112 101, .add 98 86, .mul 0x02 114, .add 98 115, .add 116 101, .add 105 109, .add 118 113, .add 119 117, .add 105 109, .mul 0x02 121, .add 105 122, .add 123 120, .add 109 113, .mul 0x02 125, .add 109 126, .add 127 120, .add 113 117, .mul 0x02 129, .add 113 130, .add 131 120, .add 117 105, .mul 0x02 133, .add 117 134, .add 135 120, .add 124 128, .add 137 132, .add 138 136, .add 124 128, .mul 0x02 140, .add 124 141, .add 142 139, .add 128 132, .mul 0x02 144, .add 128 145, .add 146 139, .add 132 136, .mul 0x02 148, .add 132 149, .add 150 139, .add 136 124, .mul 0x02 152, .add 136 153, .add 154 139, .add 143 147, .add 156 151, .add 157 155, .add 143 147, .mul 0x02 159, .add 143 160, .add 161 158, .add 147 151, .mul 0x02 163, .add 147 164, .add 165 158, .add 151 155, .mul 0x02 167, .add 151 168, .add 169 158, .add 155 143, .mul 0x02 171, .add 155 172, .add 173 158, .add 162 166, .add 175 170, .add 176 174, .add 162 166, .mul 0x02 178, .add 162 179, .add 180 177, .add 166 170, .mul 0x02 182, .add 166 183, .add 184 177, .add 170 174, .mul 0x02 186, .add 170 187, .add 188 177, .add 174 162, .mul 0x02 190, .add 174 191, .add 192 177, .add 181 185, .add 194 189, .add 195 193, .add 181 185, .mul 0x02 197, .add 181 198, .add 199 196, .add 185 189, .mul 0x02 201, .add 185 202, .add 203 196, .add 189 193, .mul 0x02 205, .add 189 206, .add 207 196, .add 193 181, .mul 0x02 209, .add 193 210, .add 211 196, .add 200 204, .add 213 208, .add 214 212, .add 200 204, .mul 0x02 216, .add 200 217, .add 218 215, .add 204 208, .mul 0x02 220, .add 204 221, .add 222 215, .add 208 212, .mul 0x02 224, .add 208 225, .add 226 215, .add 212 200, .mul 0x02 228, .add 212 229, .add 230 215, .add 219 223, .add 232 227, .add 233 231, .add 219 223, .mul 0x02 235, .add 219 236, .add 237 234, .add 223 227, .mul 0x02 239, .add 223 240, .add 241 234, .add 227 231, .mul 0x02 243, .add 227 244, .add 245 234, .add 231 219, .mul 0x02 247, .add 231 248, .add 249 234, .mul 0x02 242, .mul 0x02 251, .mul 0x02 252, .mul 0x02 253, .mul 0x02 254, .mul 0x02 255, .mul 0x02 256, .mul 0x02 257, .add 238 258] 259 242 246 250

#eval Audit.echoInput "candProgram" candProgram

/-- The candidate's `4 × 4` mixing matrix over `GF(2⁸)`, row-major as submitted. -/
def candMatrix : Matrix (Fin 4) (Fin 4) GF256 :=
  gfMat4 0x19 0x35 0x2C 0x1A 0x01 0x02 0x03 0x01 0x01 0x01 0x02 0x03 0x03 0x01 0x01 0x02

#eval Audit.echoInput "candMatrix" candMatrix

/-- The submitted circuit computes the candidate matrix on every input: its coefficient
matrix, computed once per register, equals `candMatrix`. -/
theorem circuit_equivalence : ∀ x, candProgram.eval x = candMatrix.mulVec x :=
  Circuit.Program.implements_of_checkEquiv (by decide +kernel)

end CryptificateJob
#cryptificate_audit CryptificateJob.circuit_equivalence
