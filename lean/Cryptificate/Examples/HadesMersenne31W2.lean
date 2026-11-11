import Cryptificate

/-!
# Example: a width-two HADES design over Mersenne31

The prime-field profile at width two over Mersenne31, `p = 2³¹ - 1 = 2147483647`
(`examples/designs/mersenne31-t2.json`): the external matrix `[[2, 1], [1, 2]]` (Plonky3's width-two
external layer), the internal matrix `1 · 1ᵀ + diag(1, 2)`, `8` full and `14` partial rounds, and
`x ↦ x ^ 5` on coordinate `0` in the partial rounds. The internal matrix and the round numbers are
chosen for illustration; this is not a deployed instance.

At width two every claim is proved. The `5` canonical minors of the external matrix (its entries and
its determinant `3`) are nonzero (`external_mds`, `Mat2.isMDS_of_minorsOk`, branch number `3`); the
internal matrix has an inverse modulo `p`, checked with packed arithmetic in base `2 ^ 64`
(`internal_invertible`); `x ↦ x ^ 5` is a bijection (`power_bijective`); the full rounds activate at
least `(2 + 2) · 3 = 12` S-boxes (`hades_activity`); the rows `e₀`, `e₀ M` have an inverse, so every
two consecutive partial rounds activate an S-box (`partial_active`); and the whole permutation
activates at least `12 + ⌊14 / 2⌋ = 19` S-boxes for any two distinct inputs and any round constants
(`hades_total_activity`). This is a lower bound on active S-boxes, not a tightness result or a
security level.

Instantiated by the engine (`emit-lean`) from the fragments `header`, `const_modulus_prime`,
`const_external_prime`, `const_internal_prime`, `const_exponent`, `const_rounds_hades`,
`const_mask_prime`, `const_witness_internal_inverse_prime`, `const_witness_observability_prime`,
`field_prime`, `external_mds_prime2`, `internal_invertible_prime_packed`, `power_bijective_prime`,
`hades_activity_prime2`, `partial_active_prime_packed`, `hades_total_activity_prime2` and `footer`.
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
def candExternal : Matrix (Fin 2) (Fin 2) (ZMod candModulus) :=
  pfMat candModulus 2 [2, 1, 1, 2]

#eval Audit.echoInput "candExternal" candExternal

/-- The candidate's internal matrix over `ZMod candModulus`, row-major as submitted. HADES mixes
with it in every partial round. -/
def candInternal : Matrix (Fin 2) (Fin 2) (ZMod candModulus) :=
  pfMat candModulus 2 [2, 1, 1, 3]

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
def candPartialMask : Fin 2 → Bool :=
  maskBits 2 [1, 0]

#eval Audit.echoInput "candPartialMask" candPartialMask

/-- The positions where `candPartialMask` is `true`: the S-box positions of a partial round. -/
def candMask : Finset (Fin 2) :=
  Finset.univ.filter fun i => candPartialMask i = true

/-- An inverse witness for `candInternal`, computed by the engine and checked below: the
inverse matrix over `ZMod candModulus`, listed column by column, each column from its last entry
to its first (`Packed.revCols`), so that one multiplication of packed numbers gives one entry of
`candInternal * witnessInternalInverse`. -/
def witnessInternalInverse : List ℕ :=
  [1288490188, 429496730, 1717986918, 1288490188]

/-- The rows of the observability certificate, as indices into the stacked rows `eᵢ Mʲ` of
`Packed.obsStackP` (power `j` major, masked position `i` minor). -/
def witnessObsRows : List ℕ :=
  [0, 1]

/-- An inverse of those rows over `ZMod candModulus`, column by column, each column from its last
entry to its first (`Packed.revCols`). -/
def witnessObsInverse : List ℕ :=
  [2147483645, 1, 1, 0]

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
number is `3`. The kernel evaluates the `5` canonical minors (the entries and the determinant) by
explicit formulas over `ZMod candModulus`, and `Mat2.isMDS_of_minorsOk`, proved once for every
`2 × 2` matrix over every field, turns that into WideTrail's `IsMDS`. -/
theorem external_mds : IsMDS candExternal :=
  Mat2.isMDS_of_minorsOk candExternal (by decide)

/-- Claim `internal.invertible`: the determinant of `candInternal` over `ZMod candModulus` is
nonzero. The certificate is the inverse matrix `witnessInternalInverse`: the kernel checks
`candInternal * witnessInternalInverse = 1` entry by entry (`Packed.checkInverse`), each entry one
product of packed numbers in base `2 ^ 64`, and a matrix with a right inverse has a
nonzero determinant (`Packed.det_ne_zero_of_checkInverse`). -/
theorem internal_invertible : candInternal.det ≠ 0 :=
  Packed.det_ne_zero_of_checkInverse (S := 64) (Wr := witnessInternalInverse)
    (by decide +kernel)

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
every choice of round constants, at least `(h / 2 + h / 2) * 3 + h % 2 + h % 2` S-box
evaluations in the full rounds receive different inputs in the two executions (`3` is the
branch number of an MDS matrix of width `2`). Partial rounds are not counted. Uses
`external_mds`, `internal_invertible` and `power_bijective` from this file. -/
theorem hades_activity :
    ∀ (mask : Finset (Fin 2)) (constants : ℕ → Fin 2 → ZMod candModulus)
      (x y : Fin 2 → ZMod candModulus), x ≠ y →
        (candFullRounds / 2 / 2 + candFullRounds / 2 / 2) * 3
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
(`Hades.Design.not_bypass_of_windowActive`). The certificate is observability: the kernel computes
the rows of `candInternal ^ j` at the masked positions, for `j` below the window length, by
packed vector-matrix products, takes the rows listed in `witnessObsRows`, and checks that
`witnessObsInverse` is their inverse modulo `candModulus` (`Hades.observable_of_checkObsP`), so
they have full rank. -/
theorem partial_active :
    2 ≤ candPartialRounds ∧
      Hades.Design.WindowActive
        { external := candExternal, internal := candInternal, exponent := candExponent,
            fullRounds := candFullRounds, partialRounds := candPartialRounds }
        candMask 2 :=
  ⟨by decide,
    Hades.Design.windowActive_of_observable
      { external := candExternal, internal := candInternal, exponent := candExponent,
            fullRounds := candFullRounds, partialRounds := candPartialRounds }
      (Hades.observable_of_checkObsP (S := 64) (sel := witnessObsRows)
        (Wr := witnessObsInverse) (by decide +kernel))⟩

/-- Claim `activity.total`: run the candidate permutation over `ZMod candModulus` on two distinct
inputs, with the partial-round S-boxes at the positions of `candMask`. For every choice of round
constants, the full rounds and the partial rounds together contain at least the full-round bound
of `hades_activity` plus one S-box for each of the disjoint windows of consecutive partial rounds
that `partial_active` charges, here written `candPartialRounds / L` with `L` the window length.
Full rounds count every S-box, partial rounds the masked ones, so the two counts together are
every active S-box of the permutation. Uses `external_mds`, `internal_invertible`,
`power_bijective` and `partial_active` from this file. -/
theorem hades_total_activity :
    ∀ (constants : ℕ → Fin 2 → ZMod candModulus) (x y : Fin 2 → ZMod candModulus), x ≠ y →
        (candFullRounds / 2 / 2 + candFullRounds / 2 / 2) * 3
            + candFullRounds / 2 % 2 + candFullRounds / 2 % 2 + candPartialRounds / 2
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
