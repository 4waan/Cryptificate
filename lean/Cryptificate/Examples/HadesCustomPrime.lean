import Cryptificate

/-!
# Example: refutations over a custom prime

A width-four design over the custom prime `p = 18446744073709551557`, the largest prime below
`2⁶⁴`, given as `"field": "prime"` with an explicit `"modulus"`. The engine finds a Pratt
certificate for it (the factorization of `p - 1` and a primitive root, recursively); Lean checks it
by kernel evaluation (`field_prime`). The design is chosen to exercise the refutations at width four:

* the external matrix `1 · 1ᵀ + I` is not MDS: it fixes `[-1, 1, 0, 0]`, so that vector and its
  image together have `4` nonzero coordinates, below the `5` of an MDS matrix (`external_not_mds`);
* the internal matrix, the circulant with first row `[1, 1, 0, 0]`, is singular: it sends
  `[-1, 1, -1, 1]` to zero (`internal_singular`);
* with only `2` partial rounds, the difference `[0, 0, 1, 0]` and its image under the internal
  matrix are zero at the masked position `0`, so it passes both partial rounds with no active
  S-box (`partial_bypass_short`, checked row by row with `Hades.powers_zero_of_rows`); four partial
  rounds would charge every window, since the rows `e₀ Mʲ`, `j < 4`, have full rank.

`x ↦ x ^ 3` is a permutation here, since `3` does not divide `p - 1`. Here `-1` stands for
`p - 1`.

Instantiated by `scripts/instantiate.py` from the fragments `header`, `const_modulus_prime`,
`const_external_prime`, `const_internal_prime`, `const_exponent`, `const_rounds_hades`,
`const_mask_prime`, `const_witness_external_prime`, `const_witness_internal_prime`,
`const_witness_bypass_prime`, `field_prime`, `external_not_mds_prime`, `internal_singular_prime`,
`power_bijective_prime`, `partial_bypass_short_prime` and `footer`.
-/

set_option autoImplicit false
set_option maxRecDepth 16000
set_option maxHeartbeats 2000000

namespace CryptificateJob

open Cryptificate

/-- The candidate's prime modulus `p`, as submitted (or as named by the field preset). Every
matrix, vector and witness below is an element of `ZMod candModulus`, and every claim is about
that ring; claim `field.prime` proves it is a field. -/
def candModulus : ℕ := 18446744073709551557

#eval Audit.echoDecimal "candModulus" candModulus

/-- The candidate's external matrix over `ZMod candModulus`, row-major as submitted. HADES mixes
with it in every full round and, as Poseidon2 does, once before the first round. -/
def candExternal : Matrix (Fin 4) (Fin 4) (ZMod candModulus) :=
  pfMat candModulus 4 [2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2]

#eval Audit.echoInput "candExternal" candExternal

/-- The candidate's internal matrix over `ZMod candModulus`, row-major as submitted. HADES mixes
with it in every partial round. -/
def candInternal : Matrix (Fin 4) (Fin 4) (ZMod candModulus) :=
  pfMat candModulus 4 [1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 1, 0, 0, 1]

#eval Audit.echoInput "candInternal" candInternal

/-- The exponent `e` of the candidate's power S-box `x ↦ x ^ e`. -/
def candExponent : ℕ := 3

#eval Audit.echoInput "candExponent" candExponent

/-- The candidate's number of full rounds, half of them before the partial rounds and half
after. -/
def candFullRounds : ℕ := 8

#eval Audit.echoInput "candFullRounds" candFullRounds

/-- The candidate's number of partial rounds. -/
def candPartialRounds : ℕ := 2

#eval Audit.echoInput "candPartialRounds" candPartialRounds

/-- The candidate's partial-round mask: `true` at the positions where a partial round applies
the S-box, as submitted. -/
def candPartialMask : Fin 4 → Bool :=
  maskBits 4 [1, 0, 0, 0]

#eval Audit.echoInput "candPartialMask" candPartialMask

/-- The positions where `candPartialMask` is `true`: the S-box positions of a partial round. -/
def candMask : Finset (Fin 4) :=
  Finset.univ.filter fun i => candPartialMask i = true

/-- The branch-number witness for the external matrix: a nonzero state that, together with its
image under `candExternal`, has fewer nonzero coordinates than the width plus one. -/
def witnessVector : Fin 4 → ZMod candModulus :=
  pfVec candModulus 4 [18446744073709551556, 1, 0, 0]

#eval Audit.echoInput "witnessVector" witnessVector

/-- The singularity witness for the internal matrix: a nonzero state that `candInternal` sends
to zero. -/
def witnessKernel : Fin 4 → ZMod candModulus :=
  pfVec candModulus 4 [18446744073709551556, 1, 18446744073709551556, 1]

#eval Audit.echoInput "witnessKernel" witnessKernel

/-- The bypass witness for a design with fewer partial rounds than its width: a nonzero
difference whose images under `candInternal ^ j`, for every `j` below the number of partial
rounds, are zero on every masked position. -/
def witnessBypass : Fin 4 → ZMod candModulus :=
  pfVec candModulus 4 [0, 0, 1, 0]

#eval Audit.echoInput "witnessBypass" witnessBypass

/-- Claim `field.prime`: the modulus is prime, so `ZMod candModulus` is a field. The certificate is
a Pratt certificate, listed below as flat numerals: for each prime `n` it proves, a base `a`, the
number `m` of prime factors of `n - 1`, and those factors with their exponents, each proved prime
by an earlier step. The kernel evaluates the checker (`Pratt.checkFlat`): every product, power and
modular exponentiation is computed, nothing is searched, and `Pratt.prime_of_checkFlat` (Lucas's
test, Mathlib's `lucas_primality`, applied step by step) turns acceptance into primality. -/
theorem field_prime : Nat.Prime candModulus :=
  Pratt.prime_of_checkFlat [2, 1, 0, 5, 2, 1, 2, 2, 11, 2, 2, 2, 1, 5, 1, 17, 3, 1, 2, 4, 137, 3, 2, 2, 3, 17, 1, 3, 2, 1, 2, 1, 7, 3, 2, 2, 1, 3, 1, 13, 2, 2, 2, 2, 3, 1, 547, 2, 4, 2, 1, 3, 1, 7, 1, 13, 1, 23, 5, 2, 2, 1, 11, 1, 31, 3, 3, 2, 1, 3, 1, 5, 1, 1427, 2, 3, 2, 1, 23, 1, 31, 1, 71, 7, 3, 2, 1, 5, 1, 7, 1, 2131, 2, 4, 2, 1, 3, 1, 5, 1, 71, 1, 73, 5, 2, 2, 3, 3, 2, 15331, 2, 5, 2, 1, 3, 1, 5, 1, 7, 1, 73, 1, 5594472617641, 13, 6, 2, 3, 3, 1, 5, 1, 1427, 1, 2131, 1, 15331, 1, 18446744073709551557, 2, 5, 2, 2, 11, 1, 137, 1, 547, 1, 5594472617641, 1] candModulus (by decide)

/-- `ZMod candModulus` is a field: every claim of this certificate uses this instance, so every
claim depends on `field_prime`. -/
instance candModulus_fact : Fact (Nat.Prime candModulus) := ⟨field_prime⟩

/-- Claim `external.mds`, refuted: `witnessVector` is nonzero, and it and its image under
`candExternal` have at most as many nonzero coordinates between them as the width, while an MDS
matrix forces one more (`isMDS_branch_bound`). -/
theorem external_not_mds : ¬ IsMDS candExternal :=
  not_isMDS_of_witness witnessVector (by decide) (by decide)

/-- Claim `internal.invertible`, refuted: `witnessKernel` is a nonzero state that
`candInternal` sends to zero, so the determinant of `candInternal` is zero. -/
theorem internal_singular : candInternal.det = 0 :=
  Mat3.det_eq_zero_of_mulVec_eq_zero witnessKernel (by decide) (by decide)

/-- Claim `sbox.bijective`: `x ↦ x ^ candExponent` permutes `ZMod candModulus`. The certificate is
an inverse exponent `d` and a multiplier `k` with `candExponent * d = (p - 1) * k + 1`, given
below in that order: an identity between natural numbers that the kernel checks. By Fermat's
little theorem in `ZMod p` (`PrimePower.ZModP.pow_bijective`) `x ↦ x ^ d` is then the inverse
map. -/
theorem power_bijective : Function.Bijective (fun x : ZMod candModulus => x ^ candExponent) :=
  PrimePower.ZModP.pow_bijective candModulus candExponent
    12297829382473034371
    2 (by decide) (by decide) (by decide)

/-- Claim `activity.partial`, refuted for a design with fewer partial rounds than its width:
there is at least one partial round (with none, every difference would pass them vacuously), and a
nonzero difference passes them all with no active S-box. For every choice of round constants and
every state `z` entering the first partial round, the runs from `z` and from `z + v` feed equal
inputs to every S-box at the positions of `candMask` in every partial round. The witness `v` is
`witnessBypass`; the kernel checks that the rows of `candInternal ^ j` at the masked positions,
for every `j` below the number of partial rounds, are orthogonal to it
(`Hades.powers_zero_of_rows`). -/
theorem partial_bypass_short :
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
      (Hades.powers_zero_of_rows candInternal candMask witnessBypass candPartialRounds
        (by decide))⟩

end CryptificateJob
#cryptificate_audit CryptificateJob.field_prime
#cryptificate_audit CryptificateJob.external_not_mds
#cryptificate_audit CryptificateJob.internal_singular
#cryptificate_audit CryptificateJob.power_bijective
#cryptificate_audit CryptificateJob.partial_bypass_short
