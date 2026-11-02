import Cryptificate

/-!
# Example: a bypass of the partial rounds

The reference external matrix `[[2,1,1],[1,2,1],[1,1,2]]` used as the internal matrix as well,
with `x ↦ x ^ 5`, `8` full and `56` partial rounds and the S-box on coordinate `0` in the partial
rounds. Every full-round claim still holds: the external matrix is MDS, the internal matrix has
determinant `4`, `5` is a permutation exponent, and the full rounds activate at least `16`
S-boxes. The partial rounds can add none: the internal matrix fixes `v = [0, 1, -1]`, whose
coordinate `0` is zero, so for every choice of round constants two states that differ by `v` when
they enter the partial rounds feed equal inputs to the S-box of every one of the `56` partial
rounds (`partial_bypass`). The kernel checks `v ≠ 0`, that `v` and the zero vector (the second
spanning vector of a line) vanish at coordinate `0`, and `M v = 1 • v + 0 • 0`, `M 0 = 0 • v + 0 • 0`;
`Hades.powers_zero_of_invariant2` and `Hades.Design.bypass_of_powers` do the rest for every round.

Instantiated by `scripts/instantiate.py` from the fragments `header`, `const_external_bn254`,
`const_internal_bn254`, `const_exponent`, `const_rounds_hades`, `const_mask_hades`,
`const_witness_bypass_bn254`, `const_witness_bypass_span_bn254`, `external_mds`,
`internal_invertible`, `power_bijective`, `hades_activity`, `partial_bypass` and `footer`.
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
  bnMat3 2 1 1 1 2 1 1 1 2

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

/-- The candidate's partial-round mask: `true` at the positions where a partial round applies
the S-box, as submitted. -/
def candPartialMask : Fin 3 → Bool :=
  maskBits3 1 0 0

#eval Audit.echoInput "candPartialMask" candPartialMask

/-- The positions where `candPartialMask` is `true`: the S-box positions of a partial round. -/
def candMask : Finset (Fin 3) :=
  Finset.univ.filter fun i => candPartialMask i = true

/-- The bypass witness: a nonzero difference whose images under the powers of `candInternal`
stay at zero on every masked position, so that it never reaches a partial-round S-box. -/
def witnessBypass : Fin 3 → Poseidon2.BN254.F :=
  bnVec3 0 1 21888242871839275222246405745257275088548364400416034343698204186575808495616

#eval Audit.echoInput "witnessBypass" witnessBypass

/-- A second vector that spans, with `witnessBypass`, a subspace that `candInternal` maps into
itself and that is zero on every masked position; it is the zero vector when that subspace is a
line through `witnessBypass`. -/
def witnessBypassSpan : Fin 3 → Poseidon2.BN254.F :=
  bnVec3 0 0 0

/-- The coefficients of `candInternal` on that subspace:
`candInternal *ᵥ witnessBypass = a₁₁ • witnessBypass + a₁₂ • witnessBypassSpan` and
`candInternal *ᵥ witnessBypassSpan = a₂₁ • witnessBypass + a₂₂ • witnessBypassSpan`, in the order
`a₁₁ a₁₂ a₂₁ a₂₂`. -/
def witnessBypassCoeffs : Fin 4 → Poseidon2.BN254.F :=
  ![bn 1, bn 0, bn 0, bn 0]

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

/-- Claim `activity.partial`, refuted: a nonzero difference passes all `candPartialRounds` partial
rounds with no active S-box. For every choice of round constants and every state `z` entering the
first partial round, the runs from `z` and from `z + v` feed equal inputs to every S-box at the
positions of `candMask` in every partial round. The witness `v` is `witnessBypass`: it and
`witnessBypassSpan` are zero on every masked position and `candInternal` maps their span into
itself with the coefficients `witnessBypassCoeffs` (`Hades.powers_zero_of_invariant2`), so every
power of `candInternal` keeps `v` at zero on the mask (`Hades.Design.bypass_of_powers`). -/
theorem partial_bypass :
    ∃ v : Fin 3 → Poseidon2.BN254.F, v ≠ 0 ∧
      Hades.Design.Bypass
        { external := candExternal, internal := candInternal, exponent := candExponent,
          fullRounds := candFullRounds, partialRounds := candPartialRounds }
        candMask v :=
  ⟨witnessBypass, by decide,
    Hades.Design.bypass_of_powers
      { external := candExternal, internal := candInternal, exponent := candExponent,
        fullRounds := candFullRounds, partialRounds := candPartialRounds }
      candMask witnessBypass
      (fun j _ => Hades.powers_zero_of_invariant2 candInternal candMask witnessBypass
        witnessBypassSpan (witnessBypassCoeffs 0) (witnessBypassCoeffs 1) (witnessBypassCoeffs 2)
        (witnessBypassCoeffs 3) (by decide) (by decide) (by decide) (by decide) j)⟩

end CryptificateJob
#cryptificate_audit CryptificateJob.external_mds
#cryptificate_audit CryptificateJob.internal_invertible
#cryptificate_audit CryptificateJob.power_bijective
#cryptificate_audit CryptificateJob.hades_activity
#cryptificate_audit CryptificateJob.partial_bypass
