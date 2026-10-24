import Cryptificate

/-!
# Example: the cube map is not a permutation of the BN254 scalar field

The reference matrices with the S-box `x ↦ x ^ 3`. Since `3` divides `p - 1`, the field has a
primitive cube root of unity `ω = 3 ^ ((p - 1) / 3)`, and `1 ^ 3 = 1 = ω ^ 3` with `ω ≠ 1`. The
kernel checks `ω ^ 3 = 1` by square-and-multiply. Both matrix claims still hold; no activity
bound is stated, because the bound needs a bijective S-box.

Instantiated by `scripts/instantiate.py` from the fragments `header`, `const_external_bn254`,
`const_internal_bn254`, `const_exponent`, `const_rounds_hades`, `const_witness_power_bn254`,
`external_mds`, `internal_invertible`, `power_not_injective` and `footer`.
-/

set_option autoImplicit false
set_option maxRecDepth 16000
set_option maxHeartbeats 2000000

namespace CryptificateJob

open Cryptificate

/-- The candidate's external matrix over the BN254 scalar field, row-major as submitted. HADES
mixes with it in every full round and, as Poseidon2 does, once before the first round. -/
def candExternal : Matrix (Fin 3) (Fin 3) Poseidon2.BN254.F :=
  bnMat3 2 1 1 1 2 1 1 1 2

#eval Audit.echoInput "candExternal" candExternal

/-- The candidate's internal matrix over the BN254 scalar field, row-major as submitted. HADES
mixes with it in every partial round. -/
def candInternal : Matrix (Fin 3) (Fin 3) Poseidon2.BN254.F :=
  bnMat3 2 1 1 1 2 1 1 1 3

#eval Audit.echoInput "candInternal" candInternal

/-- The exponent `e` of the candidate's power S-box `x ↦ x ^ e`. -/
def candExponent : ℕ := 3

#eval Audit.echoInput "candExponent" candExponent

/-- The candidate's number of full rounds, half of them before the partial rounds and half
after. -/
def candFullRounds : ℕ := 8

#eval Audit.echoInput "candFullRounds" candFullRounds

/-- The candidate's number of partial rounds. -/
def candPartialRounds : ℕ := 56

#eval Audit.echoInput "candPartialRounds" candPartialRounds

/-- The collision witness for the power S-box: an element other than `1` whose
`candExponent`-th power is `1`, so that it and `1` have the same image. -/
def witnessRoot : Poseidon2.BN254.F :=
  bn 4407920970296243842393367215006156084916469457145843978461

#eval Audit.echoInput "witnessRoot" witnessRoot

/-- Claim `external.mds`: every square submatrix of `candExternal` is nonsingular, so its branch
number is `4`. The kernel evaluates the `19` canonical minors by explicit formulas
(`Mat3.minorsOk`), and `Mat3.isMDS_of_minorsOk`, proved once for every `3 × 3` matrix, turns
that into WideTrail's `IsMDS`. -/
theorem external_mds : IsMDS candExternal :=
  Mat3.isMDS_of_minorsOk candExternal (by decide)

/-- Claim `internal.invertible`: the determinant of `candInternal`, which the kernel evaluates
with the six-term formula of `Matrix.det_fin_three`, is nonzero. -/
theorem internal_invertible : candInternal.det ≠ 0 :=
  Mat3.det_ne_zero_of_det3 (by decide)

/-- Claim `sbox.bijective`, refuted: `witnessRoot ≠ 1` and `witnessRoot ^ candExponent = 1`,
which the kernel computes by square-and-multiply, so `1` and `witnessRoot` have the same image
under `x ↦ x ^ candExponent`. -/
theorem power_not_injective :
    ¬ Function.Injective (fun x : Poseidon2.BN254.F => x ^ candExponent) :=
  PrimePower.pow_not_injective_of_root candExponent witnessRoot (by decide) (by decide)

end CryptificateJob
#cryptificate_audit CryptificateJob.external_mds
#cryptificate_audit CryptificateJob.internal_invertible
#cryptificate_audit CryptificateJob.power_not_injective
