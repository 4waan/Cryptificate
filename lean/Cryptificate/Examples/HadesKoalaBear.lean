import Cryptificate

/-!
# Example: a width-four HADES design over KoalaBear

The prime-field profile (`hades/prime/v1`) over KoalaBear, `p = 127 · 2²⁴ + 1 = 2130706433`, as in
`examples/designs/koalabear-t4.json`: the `4 × 4` matrix `M4 = [[5,7,1,3],[4,6,1,1],[1,3,5,7],[1,1,4,6]]`
of the Poseidon2 paper as external matrix, the internal matrix `1 · 1ᵀ + diag(1, 2, 4, 8)`, `8` full and
`20` partial rounds, S-box `x ↦ x ^ 3` (the exponent KoalaBear uses, since `3` does not divide
`p - 1 = 2²⁴ · 127`) on coordinate `0` in the partial rounds. The width, the internal matrix and the
round numbers are chosen for illustration; this is not a deployed instance.

The certificate first proves the modulus prime from a Pratt certificate checked by kernel
evaluation (`field_prime`), which gives `Fact (Nat.Prime candModulus)` and so the field structure
on `ZMod candModulus` that every other claim uses. Then: all `69` minors of the external matrix are
nonzero (`external_mds`, branch number `5`); the internal matrix has determinant `184`
(`internal_invertible`); `x ↦ x ^ 3` is inverted by an inverse exponent (`power_bijective`); the full
rounds activate at least `20` S-boxes (`hades_activity`); the rows `e₀ Mʲ`, `j < 4`, have a nonzero
determinant, so every four consecutive partial rounds activate an S-box (`partial_active`); and the
whole permutation activates at least `20 + ⌊20 / 4⌋ = 25` S-boxes for any two distinct inputs and any
round constants (`hades_total_activity`). This is a lower bound on active S-boxes, not a tightness
result or a security level.

Instantiated by `scripts/instantiate.py` from the fragments `header`, `const_modulus_prime`,
`const_external_prime`, `const_internal_prime`, `const_exponent`, `const_rounds_hades`,
`const_mask_prime`, `field_prime`, `external_mds_prime4`, `internal_invertible_prime4`,
`power_bijective_prime`, `hades_activity_prime4`, `partial_active_prime4`,
`hades_total_activity_prime4` and `footer`.
-/

set_option autoImplicit false
set_option maxRecDepth 16000
set_option maxHeartbeats 2000000

namespace CryptificateJob

open Cryptificate

/-- The candidate's prime modulus `p`, as submitted (or as named by the field preset). Every
matrix, vector and witness below is an element of `ZMod candModulus`, and every claim is about
that ring; claim `field.prime` proves it is a field. -/
def candModulus : ℕ := 2130706433

#eval Audit.echoDecimal "candModulus" candModulus

/-- The candidate's external matrix over `ZMod candModulus`, row-major as submitted. HADES mixes
with it in every full round and, as Poseidon2 does, once before the first round. -/
def candExternal : Matrix (Fin 4) (Fin 4) (ZMod candModulus) :=
  pfMat candModulus 4 [5, 7, 1, 3, 4, 6, 1, 1, 1, 3, 5, 7, 1, 1, 4, 6]

#eval Audit.echoInput "candExternal" candExternal

/-- The candidate's internal matrix over `ZMod candModulus`, row-major as submitted. HADES mixes
with it in every partial round. -/
def candInternal : Matrix (Fin 4) (Fin 4) (ZMod candModulus) :=
  pfMat candModulus 4 [2, 1, 1, 1, 1, 3, 1, 1, 1, 1, 5, 1, 1, 1, 1, 9]

#eval Audit.echoInput "candInternal" candInternal

/-- The exponent `e` of the candidate's power S-box `x ↦ x ^ e`. -/
def candExponent : ℕ := 3

#eval Audit.echoInput "candExponent" candExponent

/-- The candidate's number of full rounds, half of them before the partial rounds and half
after. -/
def candFullRounds : ℕ := 8

#eval Audit.echoInput "candFullRounds" candFullRounds

/-- The candidate's number of partial rounds. -/
def candPartialRounds : ℕ := 20

#eval Audit.echoInput "candPartialRounds" candPartialRounds

/-- The candidate's partial-round mask: `true` at the positions where a partial round applies
the S-box, as submitted. -/
def candPartialMask : Fin 4 → Bool :=
  maskBits 4 [1, 0, 0, 0]

#eval Audit.echoInput "candPartialMask" candPartialMask

/-- The positions where `candPartialMask` is `true`: the S-box positions of a partial round. -/
def candMask : Finset (Fin 4) :=
  Finset.univ.filter fun i => candPartialMask i = true

/-- Claim `field.prime`: the modulus is prime, so `ZMod candModulus` is a field. The certificate is
a Pratt certificate, listed below as flat numerals: for each prime `n` it proves, a base `a`, the
number `m` of prime factors of `n - 1`, and those factors with their exponents, each proved prime
by an earlier step. The kernel evaluates the checker (`Pratt.checkFlat`): every product, power and
modular exponentiation is computed, nothing is searched, and `Pratt.prime_of_checkFlat` (Lucas's
test, Mathlib's `lucas_primality`, applied step by step) turns acceptance into primality. -/
theorem field_prime : Nat.Prime candModulus :=
  Pratt.prime_of_checkFlat [2, 1, 0, 3, 2, 1, 2, 1, 7, 3, 2, 2, 1, 3, 1, 127, 3, 3, 2, 1, 3, 2, 7, 1, 2130706433, 3, 2, 2, 24, 127, 1] candModulus (by decide)

/-- `ZMod candModulus` is a field: every claim of this certificate uses this instance, so every
claim depends on `field_prime`. -/
instance candModulus_fact : Fact (Nat.Prime candModulus) := ⟨field_prime⟩

/-- Claim `external.mds`: every square submatrix of `candExternal` is nonsingular, so its branch
number is `5`. The kernel evaluates the `69` canonical minors by explicit formulas over
`ZMod candModulus`, and `isMDS_of_minors4Ok`, proved once for every `4 × 4` matrix over every
field, turns that into WideTrail's `IsMDS`. -/
theorem external_mds : IsMDS candExternal :=
  isMDS_of_minors4Ok candExternal (by decide)

/-- Claim `internal.invertible`: the determinant of `candInternal`, which the kernel evaluates
over `ZMod candModulus` by cofactor expansion along the first row (`det4`), is nonzero. -/
theorem internal_invertible : candInternal.det ≠ 0 :=
  det_ne_zero_of_det4 (by decide)


/-- Claim `sbox.bijective`: `x ↦ x ^ candExponent` permutes `ZMod candModulus`, stated for
`PrimePower.ZModP.powMap candModulus candExponent` so that the statement names the field. The
certificate is an inverse exponent `d` and a multiplier `k` with
`candExponent * d = (p - 1) * k + 1`, given below in that order: an identity between natural
numbers that the kernel checks. By Fermat's little theorem in `ZMod p` (`PrimePower.ZModP.powMap_bijective`) `x ↦ x ^ d` is then the inverse
map. -/
theorem power_bijective : Function.Bijective (PrimePower.ZModP.powMap candModulus candExponent) :=
  PrimePower.ZModP.powMap_bijective candModulus candExponent
    1420470955
    2 (by decide) (by decide) (by decide)

/-- Claim `activity.outer`: run the candidate permutation over `ZMod candModulus` on two distinct
inputs: the external matrix, then `h = candFullRounds / 2` full rounds, `candPartialRounds`
partial rounds with S-boxes on the positions in `mask`, and `h` full rounds, where each round adds
its constant, applies `x ↦ x ^ candExponent` and multiplies by its matrix. For every mask and
every choice of round constants, at least `(h / 2 + h / 2) * 5 + h % 2 + h % 2` S-box
evaluations in the full rounds receive different inputs in the two executions (`5` is the
branch number of an MDS matrix of width `4`). Partial rounds are not counted. Uses
`external_mds`, `internal_invertible` and `power_bijective` from this file. -/
theorem hades_activity :
    ∀ (mask : Finset (Fin 4)) (constants : ℕ → Fin 4 → ZMod candModulus)
      (x y : Fin 4 → ZMod candModulus), x ≠ y →
        (candFullRounds / 2 / 2 + candFullRounds / 2 / 2) * 5
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
`candInternal ^ j` at masked positions, for `j` below the window length, include 4 rows with a
nonzero determinant (`Hades.observable_of_rows4`); the powers and positions of those rows are listed below
in that order. -/
theorem partial_active :
    4 ≤ candPartialRounds ∧
      Hades.Design.WindowActive
        { external := candExternal, internal := candInternal, exponent := candExponent,
          fullRounds := candFullRounds, partialRounds := candPartialRounds }
        candMask 4 :=
  ⟨by decide,
    Hades.Design.windowActive_of_observable
      { external := candExternal, internal := candInternal, exponent := candExponent,
        fullRounds := candFullRounds, partialRounds := candPartialRounds }
      (Hades.observable_of_rows4 candInternal candMask 4
        ![0, 1, 2, 3] ![0, 0, 0, 0] (by decide) (by decide) (by decide))⟩

/-- Claim `activity.total`: run the candidate permutation over `ZMod candModulus` on two distinct
inputs, with the partial-round S-boxes at the positions of `candMask`. For every choice of round
constants, the full rounds and the partial rounds together contain at least the full-round bound
of `hades_activity` plus one S-box for each of the disjoint windows of consecutive partial rounds
that `partial_active` charges, here written `candPartialRounds / L` with `L` the window length.
Full rounds count every S-box, partial rounds the masked ones, so the two counts together are
every active S-box of the permutation. Uses `external_mds`, `internal_invertible`,
`power_bijective` and `partial_active` from this file. -/
theorem hades_total_activity :
    ∀ (constants : ℕ → Fin 4 → ZMod candModulus) (x y : Fin 4 → ZMod candModulus), x ≠ y →
        (candFullRounds / 2 / 2 + candFullRounds / 2 / 2) * 5
            + candFullRounds / 2 % 2 + candFullRounds / 2 % 2 + candPartialRounds / 4
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
