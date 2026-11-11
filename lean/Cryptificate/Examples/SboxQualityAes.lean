import Cryptificate

/-!
# Example: S-box quality of AES

The AES S-box named as `{"kind":"aes"}`. Its differential uniformity is `4`, attained at the input
difference `01` and the output difference `1F`, and its linearity is `32` (nonlinearity `112`),
attained at the input mask `01` and the output mask `48`. Both claims reuse the library theorems
`aes_sbox_differentialUniformity` and `aes_sbox_linearity`, which the kernel checks once, when the
library is built, on the FIPS 197 table; no table is evaluated here.

Instantiated by `scripts/instantiate.py` from the fragments `header`, `const_sbox_aes`,
`sbox_differential_aes`, `sbox_linearity_aes` and `footer`.
-/

set_option autoImplicit false
set_option maxRecDepth 16000
set_option maxHeartbeats 2000000

namespace CryptificateJob

open Cryptificate

/-- The candidate's S-box is the AES S-box of FIPS 197, as WideTrail defines it: inversion in
`GF(2⁸)` followed by the affine map with constant `63`. -/
def candSboxTable : GF256 → GF256 := AES.sbox

#eval echoSboxAes "candSboxTable"

/-- Claim `sbox.differential` for the AES S-box: its differential uniformity is exactly `4`,
attained at the input difference `01` and the output difference `1F`, from
`aes_sbox_differentialUniformity`, which the library checks once on the FIPS 197 table. -/
theorem sbox_differential :
    differentialUniformity candSboxTable = 4 ∧ gf 1 ≠ 0 ∧
      diffCount candSboxTable (gf 1) (gf 31) = 4 :=
  aes_sbox_differentialUniformity

/-- Claim `sbox.linearity` for the AES S-box: its largest absolute Walsh coefficient at a
nonzero output mask is exactly `32` (nonlinearity `112`), attained at the input mask `01` and
the output mask `48`, from `aes_sbox_linearity`, which the library checks once on the FIPS 197
table. -/
theorem sbox_linearity :
    linearity candSboxTable = 32 ∧ gf 72 ≠ 0 ∧
      (walsh candSboxTable (gf 1) (gf 72)).natAbs = 32 :=
  aes_sbox_linearity

end CryptificateJob
#cryptificate_audit CryptificateJob.sbox_differential
#cryptificate_audit CryptificateJob.sbox_linearity
