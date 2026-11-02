import Cryptificate

/-!
# Example: a deliberately bad width-four design over BabyBear

The design of `examples/designs/babybear-t4-bad.json`, with two mistakes. The S-box is `x ↦ x ^ 3`,
but `3` divides `p - 1 = 2²⁷ · 3 · 5`, so `ω = 2 ^ ((p - 1) / 3) = 1314723123` is a nontrivial cube
root of unity and `1 ^ 3 = ω ^ 3` (`power_not_injective`). The internal matrix is `1 · 1ᵀ + I`, which
fixes every vector with `v₀ = 0` and coordinates summing to zero: that plane is invariant and zero on
the partial-round mask `{0}`, so the difference `[0, 1, -1, 0]` passes all `13` partial rounds with
no active S-box, for any round constants (`partial_bypass`, certified by the plane's basis and the
coefficients of the internal matrix on it, `Hades.powers_zero_of_invariant`). The modulus is prime,
the external matrix `M4` is MDS and the internal matrix is invertible (determinant `5`); the
activity bounds are not established, because they need a bijective S-box and charged windows.

Instantiated by `scripts/instantiate.py` from the fragments `header`, `const_modulus_prime`,
`const_external_prime`, `const_internal_prime`, `const_exponent`, `const_rounds_hades`,
`const_mask_prime`, `const_witness_power_prime`, `const_witness_bypass_basis_prime`, `field_prime`,
`external_mds_prime4`, `internal_invertible_prime4`, `power_not_injective_prime`,
`partial_bypass_prime` and `footer`.
-/

set_option autoImplicit false
set_option maxRecDepth 16000
set_option maxHeartbeats 2000000

namespace CryptificateJob

open Cryptificate

/-- The candidate's prime modulus `p`, as submitted (or as named by the field preset). Every
matrix, vector and witness below is an element of `ZMod candModulus`, and every claim is about
that ring; claim `field.prime` proves it is a field. -/
def candModulus : ℕ := 2013265921

#eval Audit.echoDecimal "candModulus" candModulus

/-- The candidate's external matrix over `ZMod candModulus`, row-major as submitted. HADES mixes
with it in every full round and, as Poseidon2 does, once before the first round. -/
def candExternal : Matrix (Fin 4) (Fin 4) (ZMod candModulus) :=
  pfMat candModulus 4 [5, 7, 1, 3, 4, 6, 1, 1, 1, 3, 5, 7, 1, 1, 4, 6]

#eval Audit.echoInput "candExternal" candExternal

/-- The candidate's internal matrix over `ZMod candModulus`, row-major as submitted. HADES mixes
with it in every partial round. -/
def candInternal : Matrix (Fin 4) (Fin 4) (ZMod candModulus) :=
  pfMat candModulus 4 [2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2]

#eval Audit.echoInput "candInternal" candInternal

/-- The exponent `e` of the candidate's power S-box `x ↦ x ^ e`. -/
def candExponent : ℕ := 3

#eval Audit.echoInput "candExponent" candExponent

/-- The candidate's number of full rounds, half of them before the partial rounds and half
after. -/
def candFullRounds : ℕ := 8

#eval Audit.echoInput "candFullRounds" candFullRounds

/-- The candidate's number of partial rounds. -/
def candPartialRounds : ℕ := 13

#eval Audit.echoInput "candPartialRounds" candPartialRounds

/-- The candidate's partial-round mask: `true` at the positions where a partial round applies
the S-box, as submitted. -/
def candPartialMask : Fin 4 → Bool :=
  maskBits 4 [1, 0, 0, 0]

#eval Audit.echoInput "candPartialMask" candPartialMask

/-- The positions where `candPartialMask` is `true`: the S-box positions of a partial round. -/
def candMask : Finset (Fin 4) :=
  Finset.univ.filter fun i => candPartialMask i = true

/-- The collision witness for the power S-box: an element other than `1` whose
`candExponent`-th power is `1`, so that it and `1` have the same image. -/
def witnessRoot : ZMod candModulus :=
  pf candModulus 1314723123

#eval Audit.echoInput "witnessRoot" witnessRoot

/-- A basis of a subspace that `candInternal` maps into itself and that is zero on every masked
position, listed vector after vector; its first vector is the bypass witness. -/
def witnessBypassBasis : Fin 2 → Fin 4 → ZMod candModulus :=
  pfVecs candModulus 2 4 [0, 1, 2013265920, 0, 0, 2013265920, 0, 1]

/-- The coefficients of `candInternal` on that basis, row `k` for basis vector `k`:
`candInternal *ᵥ witnessBypassBasis k = ∑ l, witnessBypassCoeffs k l • witnessBypassBasis l`. -/
def witnessBypassCoeffs : Fin 2 → Fin 2 → ZMod candModulus :=
  pfVecs candModulus 2 2 [1, 0, 0, 1]

/-- The bypass witness: the first basis vector, a nonzero difference whose images under every
power of `candInternal` stay at zero on every masked position. -/
def witnessBypass : Fin 4 → ZMod candModulus :=
  witnessBypassBasis 0

#eval Audit.echoInput "witnessBypass" witnessBypass

/-- Claim `field.prime`: the modulus is prime, so `ZMod candModulus` is a field. The certificate is
a Pratt certificate, listed below as flat numerals: for each prime `n` it proves, a base `a`, the
number `m` of prime factors of `n - 1`, and those factors with their exponents, each proved prime
by an earlier step. The kernel evaluates the checker (`Pratt.checkFlat`): every product, power and
modular exponentiation is computed, nothing is searched, and `Pratt.prime_of_checkFlat` (Lucas's
test, Mathlib's `lucas_primality`, applied step by step) turns acceptance into primality. -/
theorem field_prime : Nat.Prime candModulus :=
  Pratt.prime_of_checkFlat [2, 1, 0, 3, 2, 1, 2, 1, 5, 2, 1, 2, 2, 2013265921, 31, 3, 2, 27, 3, 1, 5, 1] candModulus (by decide)

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

/-- Claim `sbox.bijective`, refuted: `witnessRoot ≠ 1` and `witnessRoot ^ candExponent = 1`,
which the kernel computes over `ZMod candModulus` by square-and-multiply, so `1` and `witnessRoot`
have the same image under `x ↦ x ^ candExponent`. -/
theorem power_not_injective :
    ¬ Function.Injective (fun x : ZMod candModulus => x ^ candExponent) :=
  PrimePower.pow_not_injective_of_root candExponent witnessRoot (by decide) (by decide)

/-- Claim `activity.partial`, refuted: the design has at least one partial round, and a nonzero
difference passes all `candPartialRounds` of them with no active S-box. (With no partial rounds
every difference would pass them vacuously; the first conjunct rules that reading out.) For every
choice of round constants and every state `z` entering the first partial round, the runs from `z`
and from `z + v` feed equal inputs to every S-box at the positions of `candMask` in every partial
round. The witness `v` is `witnessBypass`, the first vector of `witnessBypassBasis`: every basis
vector is zero on every masked position and `candInternal` maps their span into itself with the
coefficients `witnessBypassCoeffs` (`Hades.powers_zero_of_invariant`), so every power of
`candInternal` keeps `v` at zero on the mask (`Hades.Design.bypass_of_powers`). -/
theorem partial_bypass :
    0 < candPartialRounds ∧
      ∃ v : Fin 4 → ZMod candModulus, v ≠ 0 ∧
        Hades.Design.Bypass
          { external := candExternal, internal := candInternal, exponent := candExponent,
            fullRounds := candFullRounds, partialRounds := candPartialRounds }
          candMask v :=
  ⟨by decide, witnessBypass, by decide,
    Hades.Design.bypass_of_powers
      { external := candExternal, internal := candInternal, exponent := candExponent,
        fullRounds := candFullRounds, partialRounds := candPartialRounds }
      candMask witnessBypass
      (fun j _ => Hades.powers_zero_of_invariant candInternal candMask witnessBypassBasis
        witnessBypassCoeffs (by decide) (by decide) 0 j)⟩

end CryptificateJob
#cryptificate_audit CryptificateJob.field_prime
#cryptificate_audit CryptificateJob.external_mds
#cryptificate_audit CryptificateJob.internal_invertible
#cryptificate_audit CryptificateJob.power_not_injective
#cryptificate_audit CryptificateJob.partial_bypass
