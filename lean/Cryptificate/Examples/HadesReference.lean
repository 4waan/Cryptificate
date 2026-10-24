import Cryptificate

/-!
# Example: the reference Poseidon2 parameters over BN254

The width-three Poseidon2 parameters that WideTrail pins: external matrix `[[2,1,1],[1,2,1],[1,1,2]]`,
internal matrix `[[2,1,1],[1,2,1],[1,1,3]]`, S-box `x ↦ x ^ 5`, `8` full and `56` partial rounds.
The external matrix is MDS by its `19` canonical minors, the internal matrix has determinant `7`,
and `5` is a permutation exponent with inverse `d` satisfying `5 * d = 4 * (p - 1) + 1`. With
`h = 4` full rounds on each side, the activity bound is `(2 + 2) * 4 = 16`, the figure of
WideTrail's `Poseidon2.BN254.activity`, here counted over the full rounds only and for every mask
and every choice of round constants. `Hades.reference_permutation` checks that the execution
model behind `outerActivity` is WideTrail's pinned permutation.

Instantiated by `scripts/instantiate.py` from the fragments `header`, `const_external_bn254`,
`const_internal_bn254`, `const_exponent`, `const_rounds_hades`, `external_mds`,
`internal_invertible`, `power_bijective`, `hades_activity` and `footer`.
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
def candExponent : ℕ := 5

#eval Audit.echoInput "candExponent" candExponent

/-- The candidate's number of full rounds, half of them before the partial rounds and half
after. -/
def candFullRounds : ℕ := 8

#eval Audit.echoInput "candFullRounds" candFullRounds

/-- The candidate's number of partial rounds. -/
def candPartialRounds : ℕ := 56

#eval Audit.echoInput "candPartialRounds" candPartialRounds

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

/-- Claim `sbox.bijective`: `x ↦ x ^ candExponent` permutes the BN254 scalar field. The
certificate is an inverse exponent `d` and a multiplier `k` with
`candExponent * d = (p - 1) * k + 1`, given below in that order: an identity between natural
numbers that the kernel checks. By Fermat's little theorem `x ↦ x ^ d` is then the inverse
map. -/
theorem power_bijective : Function.Bijective (fun x : Poseidon2.BN254.F => x ^ candExponent) :=
  PrimePower.BN254.pow_bijective candExponent
    17510594297471420177797124596205820070838691520332827474958563349260646796493
    4 (by decide) (by decide) (by decide)

/-- Claim `activity.outer`: run the candidate permutation on two distinct inputs: the external
matrix, then `h = candFullRounds / 2` full rounds, `candPartialRounds` partial rounds with
S-boxes on the positions in `mask`, and `h` full rounds, where each round adds its constant,
applies `x ↦ x ^ candExponent` and multiplies by its matrix. For every mask and every choice of
round constants, at least `(h / 2 + h / 2) * 4 + h % 2 + h % 2` S-box evaluations in the full
rounds receive different inputs in the two executions. Partial rounds are not counted. The
design is written out field by field from the candidate constants, so the statement names every
value the bound depends on. Uses `external_mds`, `internal_invertible` and `power_bijective`
from this file. -/
theorem hades_activity :
    ∀ (mask : Finset (Fin 3)) (constants : ℕ → Fin 3 → Poseidon2.BN254.F)
      (x y : Fin 3 → Poseidon2.BN254.F), x ≠ y →
        (candFullRounds / 2 / 2 + candFullRounds / 2 / 2) * 4
            + candFullRounds / 2 % 2 + candFullRounds / 2 % 2
          ≤ Hades.Design.outerActivity
              { external := candExternal, internal := candInternal, exponent := candExponent,
                fullRounds := candFullRounds, partialRounds := candPartialRounds }
              mask constants x y :=
  -- The design is passed explicitly: leaving it to unification makes elaboration time out.
  fun mask constants _ _ hxy =>
    Hades.Design.outer_activity
      { external := candExternal, internal := candInternal, exponent := candExponent,
        fullRounds := candFullRounds, partialRounds := candPartialRounds }
      external_mds internal_invertible power_bijective mask constants hxy

end CryptificateJob
#cryptificate_audit CryptificateJob.external_mds
#cryptificate_audit CryptificateJob.internal_invertible
#cryptificate_audit CryptificateJob.power_bijective
#cryptificate_audit CryptificateJob.hades_activity
