import Cryptificate

/-!
# Example: a width-three HADES design over Mersenne31

The Poseidon2 width-three matrices (external `[[2,1,1],[1,2,1],[1,1,2]]`, internal
`[[2,1,1],[1,2,1],[1,1,3]]`) over Mersenne31, `p = 2³¹ - 1 = 2147483647`, with `8` full and `14`
partial rounds and S-box `x ↦ x ^ 5` (`p - 1 = 2 · 3² · 7 · 11 · 31 · 151 · 331`, so `5` is a
permutation exponent and `3` and `7` are not). The round numbers are chosen for illustration.

The modulus is prime (`field_prime`), the external matrix is MDS (its `19` minors are nonzero modulo
`p`), the internal matrix has determinant `7`, the full rounds activate at least `16` S-boxes, the
rows `e₀`, `e₀ M`, `e₀ M²` have determinant `1`, so every three consecutive partial rounds activate an
S-box, and the whole permutation at least `16 + ⌊14 / 3⌋ = 20`.

Instantiated by `scripts/instantiate.py` from the fragments `header`, `const_modulus_prime`,
`const_external_prime`, `const_internal_prime`, `const_exponent`, `const_rounds_hades`,
`const_mask_prime`, `field_prime`, `external_mds_prime3`, `internal_invertible_prime3`,
`power_bijective_prime`, `hades_activity_prime3`, `partial_active_prime3`,
`hades_total_activity_prime3` and `footer`.
-/

set_option autoImplicit false
set_option maxRecDepth 16000
set_option maxHeartbeats 2000000

namespace CryptificateJob

open Cryptificate

/-- The candidate's prime modulus `p`, as submitted (or as named by the field preset). Every
matrix, vector and witness below is an element of `ZMod candModulus`, and every claim is about
that ring; claim `field.prime` proves it is a field. -/
def candModulus : ℕ := 2147483647

#eval Audit.echoDecimal "candModulus" candModulus

/-- The candidate's external matrix over `ZMod candModulus`, row-major as submitted. HADES mixes
with it in every full round and, as Poseidon2 does, once before the first round. -/
def candExternal : Matrix (Fin 3) (Fin 3) (ZMod candModulus) :=
  pfMat candModulus 3 [2, 1, 1, 1, 2, 1, 1, 1, 2]

#eval Audit.echoInput "candExternal" candExternal

/-- The candidate's internal matrix over `ZMod candModulus`, row-major as submitted. HADES mixes
with it in every partial round. -/
def candInternal : Matrix (Fin 3) (Fin 3) (ZMod candModulus) :=
  pfMat candModulus 3 [2, 1, 1, 1, 2, 1, 1, 1, 3]

#eval Audit.echoInput "candInternal" candInternal

/-- The exponent `e` of the candidate's power S-box `x ↦ x ^ e`. -/
def candExponent : ℕ := 5

#eval Audit.echoInput "candExponent" candExponent

/-- The candidate's number of full rounds, half of them before the partial rounds and half
after. -/
def candFullRounds : ℕ := 8

#eval Audit.echoInput "candFullRounds" candFullRounds

/-- The candidate's number of partial rounds. -/
def candPartialRounds : ℕ := 14

#eval Audit.echoInput "candPartialRounds" candPartialRounds

/-- The candidate's partial-round mask: `true` at the positions where a partial round applies
the S-box, as submitted. -/
def candPartialMask : Fin 3 → Bool :=
  maskBits 3 [1, 0, 0]

#eval Audit.echoInput "candPartialMask" candPartialMask

/-- The positions where `candPartialMask` is `true`: the S-box positions of a partial round. -/
def candMask : Finset (Fin 3) :=
  Finset.univ.filter fun i => candPartialMask i = true

/-- Claim `field.prime`: the modulus is prime, so `ZMod candModulus` is a field. The certificate is
a Pratt certificate, listed below as flat numerals: for each prime `n` it proves, a base `a`, the
number `m` of prime factors of `n - 1`, and those factors with their exponents, each proved prime
by an earlier step. The kernel evaluates the checker (`Pratt.checkFlat`): every product, power and
modular exponentiation is computed, nothing is searched, and `Pratt.prime_of_checkFlat` (Lucas's
test, Mathlib's `lucas_primality`, applied step by step) turns acceptance into primality. -/
theorem field_prime : Nat.Prime candModulus :=
  Pratt.prime_of_checkFlat [2, 1, 0, 3, 2, 1, 2, 1, 7, 3, 2, 2, 1, 3, 1, 5, 2, 1, 2, 2, 11, 2, 2, 2, 1, 5, 1, 31, 3, 3, 2, 1, 3, 1, 5, 1, 151, 6, 3, 2, 1, 3, 1, 5, 2, 331, 3, 4, 2, 1, 3, 1, 5, 1, 11, 1, 2147483647, 7, 7, 2, 1, 3, 2, 7, 1, 11, 1, 31, 1, 151, 1, 331, 1] candModulus (by decide)

/-- `ZMod candModulus` is a field: every claim of this certificate uses this instance, so every
claim depends on `field_prime`. -/
instance candModulus_fact : Fact (Nat.Prime candModulus) := ⟨field_prime⟩

/-- Claim `external.mds`: every square submatrix of `candExternal` is nonsingular, so its branch
number is `4`. The kernel evaluates the `19` canonical minors by explicit formulas over
`ZMod candModulus`, and `Mat3.isMDS_of_minorsOk`, proved once for every `3 × 3` matrix over every
field, turns that into WideTrail's `IsMDS`. -/
theorem external_mds : IsMDS candExternal :=
  Mat3.isMDS_of_minorsOk candExternal (by decide)

/-- Claim `internal.invertible`: the determinant of `candInternal`, which the kernel evaluates
over `ZMod candModulus` by the six-term formula of `Matrix.det_fin_three`, is nonzero. -/
theorem internal_invertible : candInternal.det ≠ 0 :=
  Mat3.det_ne_zero_of_det3 (by decide)


/-- Claim `sbox.bijective`: `x ↦ x ^ candExponent` permutes `ZMod candModulus`, stated for
`PrimePower.ZModP.powMap candModulus candExponent` so that the statement names the field. The
certificate is an inverse exponent `d` and a multiplier `k` with
`candExponent * d = (p - 1) * k + 1`, given below in that order: an identity between natural
numbers that the kernel checks. By Fermat's little theorem in `ZMod p` (`PrimePower.ZModP.powMap_bijective`) `x ↦ x ^ d` is then the inverse
map. -/
theorem power_bijective : Function.Bijective (PrimePower.ZModP.powMap candModulus candExponent) :=
  PrimePower.ZModP.powMap_bijective candModulus candExponent
    1717986917
    4 (by decide) (by decide) (by decide)

/-- Claim `activity.outer`: run the candidate permutation over `ZMod candModulus` on two distinct
inputs: the external matrix, then `h = candFullRounds / 2` full rounds, `candPartialRounds`
partial rounds with S-boxes on the positions in `mask`, and `h` full rounds, where each round adds
its constant, applies `x ↦ x ^ candExponent` and multiplies by its matrix. For every mask and
every choice of round constants, at least `(h / 2 + h / 2) * 4 + h % 2 + h % 2` S-box
evaluations in the full rounds receive different inputs in the two executions (`4` is the
branch number of an MDS matrix of width `3`). Partial rounds are not counted. Uses
`external_mds`, `internal_invertible` and `power_bijective` from this file. -/
theorem hades_activity :
    ∀ (mask : Finset (Fin 3)) (constants : ℕ → Fin 3 → ZMod candModulus)
      (x y : Fin 3 → ZMod candModulus), x ≠ y →
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

/-- Claim `activity.partial`: the candidate's partial rounds cannot be passed by a nonzero
difference without an active S-box. Each partial round adds its round constants, applies
`x ↦ x ^ candExponent` at the positions of `candMask` and multiplies by `candInternal`. The
statement says that there are at least as many partial rounds as the window length, and that every
window of that many consecutive partial rounds is charged: for every choice of round constants,
every window inside the partial rounds and every two distinct states entering it, some S-box of
the window receives different inputs in the two runs. A bypass is therefore impossible
(`Hades.Design.not_bypass_of_windowActive`). The certificate is observability: the rows of
`candInternal ^ j` at masked positions, for `j` below the window length, include 3 rows with a
nonzero determinant (`Hades.observable_of_rows3`); the powers and positions of those rows are listed below
in that order. -/
theorem partial_active :
    3 ≤ candPartialRounds ∧
      Hades.Design.WindowActive
        { external := candExternal, internal := candInternal, exponent := candExponent,
          fullRounds := candFullRounds, partialRounds := candPartialRounds }
        candMask 3 :=
  ⟨by decide,
    Hades.Design.windowActive_of_observable
      { external := candExternal, internal := candInternal, exponent := candExponent,
        fullRounds := candFullRounds, partialRounds := candPartialRounds }
      (Hades.observable_of_rows3 candInternal candMask 3
        ![0, 1, 2] ![0, 0, 0] (by decide) (by decide) (by decide))⟩

/-- Claim `activity.total`: run the candidate permutation over `ZMod candModulus` on two distinct
inputs, with the partial-round S-boxes at the positions of `candMask`. For every choice of round
constants, the full rounds and the partial rounds together contain at least the full-round bound
of `hades_activity` plus one S-box for each of the disjoint windows of consecutive partial rounds
that `partial_active` charges, here written `candPartialRounds / L` with `L` the window length.
Full rounds count every S-box, partial rounds the masked ones, so the two counts together are
every active S-box of the permutation. Uses `external_mds`, `internal_invertible`,
`power_bijective` and `partial_active` from this file. -/
theorem hades_total_activity :
    ∀ (constants : ℕ → Fin 3 → ZMod candModulus) (x y : Fin 3 → ZMod candModulus), x ≠ y →
        (candFullRounds / 2 / 2 + candFullRounds / 2 / 2) * 4
            + candFullRounds / 2 % 2 + candFullRounds / 2 % 2 + candPartialRounds / 3
          ≤ Hades.Design.outerActivity
              { external := candExternal, internal := candInternal, exponent := candExponent,
                fullRounds := candFullRounds, partialRounds := candPartialRounds }
              candMask constants x y
            + Hades.Design.partialActivity
              { external := candExternal, internal := candInternal, exponent := candExponent,
                fullRounds := candFullRounds, partialRounds := candPartialRounds }
              candMask constants x y :=
  -- The design is passed explicitly, as in `hades_activity`.
  fun constants _ _ hxy =>
    Hades.Design.total_activity
      { external := candExternal, internal := candInternal, exponent := candExponent,
        fullRounds := candFullRounds, partialRounds := candPartialRounds }
      external_mds internal_invertible power_bijective partial_active.2 constants hxy

end CryptificateJob
#cryptificate_audit CryptificateJob.field_prime
#cryptificate_audit CryptificateJob.external_mds
#cryptificate_audit CryptificateJob.internal_invertible
#cryptificate_audit CryptificateJob.power_bijective
#cryptificate_audit CryptificateJob.hades_activity
#cryptificate_audit CryptificateJob.partial_active
#cryptificate_audit CryptificateJob.hades_total_activity
