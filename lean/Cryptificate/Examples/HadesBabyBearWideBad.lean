import Cryptificate

/-!
# Example: a deliberately bad width-eight design over BabyBear

The design of `examples/designs/babybear-t8-bad.json` exercises every refutation of the wide path.
The `4 × 4` block is the all-ones matrix `M₄ = 1 · 1ᵀ`, and the external matrix is `circ(2 M₄, M₄)`;
the internal matrix is `1 · 1ᵀ + diag(3, 0, 0, 5, 6, 7, 8, 9)`; `8` full and `13` partial rounds,
`x ↦ x ^ 7` on coordinate `0` in the partial rounds.

The certificate proves the modulus prime (`field_prime`) and that `x ↦ x ^ 7` is a bijection
(`power_bijective`), and refutes: `external.mds`, by `[-1, 1, 0, …, 0]`, which the external matrix
sends to zero, so the input and its image have `2` nonzero coordinates, below the `9` of an MDS
matrix (`external_not_mds`, counted on numerals); `external.m4_mds`, since the external matrix is
`circ(2 M₄, M₄)` and `M₄` is not MDS (`external_m4_not_mds`, a low-weight vector of `M₄`);
`external.invertible`, by a nonzero kernel vector (`external_singular`); `internal.invertible`,
since rows `1` and `2` of the internal matrix agree and it sends `e₂ - e₁` to zero
(`internal_singular`, checked on numerals); and `activity.partial`: the line spanned by `e₁ - e₂` is
invariant under the internal matrix and zero on coordinate `0`, so that difference passes all `13`
partial rounds with no active S-box, for any round constants (`partial_bypass`, checked on numerals
with `Hades.invariant_of_check`).

Not established: `activity.outer` and `activity.total`, which need an MDS external matrix.

Instantiated by the engine (`emit-lean`) from the fragments `header`, `const_modulus_prime`,
`const_external_prime`, `const_internal_prime`, `const_exponent`, `const_rounds_hades`,
`const_mask_prime`, `const_witness_external_list_prime`, `const_external_m4_prime`,
`const_witness_m4_prime`, `const_witness_external_kernel_prime`, `const_witness_internal_prime`,
`const_witness_bypass_basis_prime`, `field_prime`, `external_not_mds_prime_list`,
`external_m4_not_mds_prime`, `external_singular_prime`, `internal_singular_prime_list`,
`power_bijective_prime`, `partial_bypass_prime_list` and `footer`.
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
def candExternal : Matrix (Fin 8) (Fin 8) (ZMod candModulus) :=
  pfMat candModulus 8 [2, 2, 2, 2, 1, 1, 1, 1, 2, 2, 2, 2, 1, 1, 1, 1, 2, 2, 2, 2, 1, 1, 1, 1, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 1, 1, 1, 1, 2, 2, 2, 2, 1, 1, 1, 1, 2, 2, 2, 2, 1, 1, 1, 1, 2, 2, 2, 2]

#eval Audit.echoInput "candExternal" candExternal

/-- The candidate's internal matrix over `ZMod candModulus`, row-major as submitted. HADES mixes
with it in every partial round. -/
def candInternal : Matrix (Fin 8) (Fin 8) (ZMod candModulus) :=
  pfMat candModulus 8 [4, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 6, 1, 1, 1, 1, 1, 1, 1, 1, 7, 1, 1, 1, 1, 1, 1, 1, 1, 8, 1, 1, 1, 1, 1, 1, 1, 1, 9, 1, 1, 1, 1, 1, 1, 1, 1, 10]

#eval Audit.echoInput "candInternal" candInternal

/-- The exponent `e` of the candidate's power S-box `x ↦ x ^ e`. -/
def candExponent : ℕ := 7

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
def candPartialMask : Fin 8 → Bool :=
  maskBits 8 [1, 0, 0, 0, 0, 0, 0, 0]

#eval Audit.echoInput "candPartialMask" candPartialMask

/-- The positions where `candPartialMask` is `true`: the S-box positions of a partial round. -/
def candMask : Finset (Fin 8) :=
  Finset.univ.filter fun i => candPartialMask i = true

/-- The branch-number witness for the external matrix, as numerals: a nonzero state that,
together with its image under `candExternal`, has at most as many nonzero coordinates as the
width. -/
def witnessVectorEntries : List ℕ :=
  [2013265920, 1, 0, 0, 0, 0, 0, 0]

/-- The same witness as a state over `ZMod candModulus`. -/
def witnessVector : Fin 8 → ZMod candModulus :=
  pfVec candModulus 8 witnessVectorEntries

#eval Audit.echoInput "witnessVector" witnessVector

/-- The `4 × 4` block `M₄` of the external matrix, row-major: the block on rows 0–3 and
columns 4–7 of `candExternal` (its first off-diagonal block), as the engine read it. Claim
`external.m4_mds` proves that `candExternal` is `circ(2 M₄, M₄, …, M₄)` for this matrix. -/
def externalM4 : Matrix (Fin 4) (Fin 4) (ZMod candModulus) :=
  pfMat candModulus 4 [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]

#eval Audit.echoInput "externalM4" externalM4

/-- The branch-number witness for `externalM4`: a nonzero vector that, together with its image
under `externalM4`, has at most `4` nonzero coordinates. -/
def witnessM4Vector : Fin 4 → ZMod candModulus :=
  pfVec candModulus 4 [2013265920, 1, 0, 0]

#eval Audit.echoInput "witnessM4Vector" witnessM4Vector

/-- The singularity witness for the external matrix: a nonzero state that `candExternal` sends
to zero. -/
def witnessExternalKernel : Fin 8 → ZMod candModulus :=
  pfVec candModulus 8 [2013265920, 1, 0, 0, 0, 0, 0, 0]

#eval Audit.echoInput "witnessExternalKernel" witnessExternalKernel

/-- The singularity witness for the internal matrix: a nonzero state that `candInternal` sends
to zero. -/
def witnessKernel : Fin 8 → ZMod candModulus :=
  pfVec candModulus 8 [0, 2013265920, 1, 0, 0, 0, 0, 0]

#eval Audit.echoInput "witnessKernel" witnessKernel

/-- A basis of a subspace that `candInternal` maps into itself and that is zero on every masked
position, listed vector after vector; its first vector is the bypass witness. -/
def witnessBypassBasis : Fin 1 → Fin 8 → ZMod candModulus :=
  pfVecs candModulus 1 8 [0, 1, 2013265920, 0, 0, 0, 0, 0]

/-- The coefficients of `candInternal` on that basis, row `k` for basis vector `k`:
`candInternal *ᵥ witnessBypassBasis k = ∑ l, witnessBypassCoeffs k l • witnessBypassBasis l`. -/
def witnessBypassCoeffs : Fin 1 → Fin 1 → ZMod candModulus :=
  pfVecs candModulus 1 1 [0]

/-- The bypass witness: the first basis vector, a nonzero difference whose images under every
power of `candInternal` stay at zero on every masked position. -/
def witnessBypass : Fin 8 → ZMod candModulus :=
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

/-- Claim `external.mds`, refuted: `witnessVector` is nonzero, and it and its image under
`candExternal` have at most as many nonzero coordinates between them as the width, while an MDS
matrix forces one more (`isMDS_branch_bound`). The kernel computes the image row by row on the
numerals and counts the entries that are nonzero modulo `candModulus`
(`NatMatrix.not_isMDS_of_checkBranch`). -/
theorem external_not_mds : ¬ IsMDS candExternal :=
  NatMatrix.not_isMDS_of_checkBranch (v := witnessVectorEntries) (by decide +kernel)

/-- Claim `external.m4_mds`, refuted: `candExternal` is `circ(2 M₄, M₄, …, M₄)` for the
`4 × 4` matrix `externalM4` (`Hades.poseidon2External`, one comparison of packed numbers), and
`externalM4` is not MDS: `witnessM4Vector` is nonzero, and it and its image under `externalM4`
have at most `4` nonzero coordinates between them, while an MDS matrix forces `5`
(`isMDS_branch_bound`). -/
theorem external_m4_not_mds :
    candExternal = Hades.poseidon2External 8 externalM4 ∧ ¬IsMDS externalM4 :=
  ⟨Hades.pfMat_eq_poseidon2External_of_checkP (S := 68) (by decide +kernel),
    not_isMDS_of_witness witnessM4Vector (by decide) (by decide)⟩

/-- Claim `external.invertible`, refuted: `witnessExternalKernel` is a nonzero state that
`candExternal` sends to zero, so the determinant of `candExternal` is zero. -/
theorem external_singular : candExternal.det = 0 :=
  Mat3.det_eq_zero_of_mulVec_eq_zero witnessExternalKernel
    (NatMatrix.pfVec_ne_zero_of_check (by decide +kernel))
    (NatMatrix.mulVec_eq_zero_of_check (by decide +kernel))

/-- Claim `internal.invertible`, refuted: `witnessKernel` is a nonzero state that `candInternal`
sends to zero, so the determinant of `candInternal` is zero. The kernel checks both facts on the
numerals, modulo `candModulus` (`NatMatrix.checkNonzero`, `NatMatrix.checkKernel`). -/
theorem internal_singular : candInternal.det = 0 :=
  Mat3.det_eq_zero_of_mulVec_eq_zero witnessKernel
    (NatMatrix.pfVec_ne_zero_of_check (by decide +kernel))
    (NatMatrix.mulVec_eq_zero_of_check (by decide +kernel))

/-- Claim `sbox.bijective`: `x ↦ x ^ candExponent` permutes `ZMod candModulus`, stated for
`PrimePower.ZModP.powMap candModulus candExponent` so that the statement names the field. The
certificate is an inverse exponent `d` and a multiplier `k` with
`candExponent * d = (p - 1) * k + 1`, given below in that order: an identity between natural
numbers that the kernel checks. By Fermat's little theorem in `ZMod p` (`PrimePower.ZModP.powMap_bijective`) `x ↦ x ^ d` is then the inverse
map. -/
theorem power_bijective : Function.Bijective (PrimePower.ZModP.powMap candModulus candExponent) :=
  PrimePower.ZModP.powMap_bijective candModulus candExponent
    1725656503
    6 (by decide) (by decide) (by decide)

/-- Claim `activity.partial`, refuted: the design has at least one partial round, and a nonzero
difference passes all `candPartialRounds` of them with no active S-box. (With no partial rounds
every difference would pass them vacuously; the first conjunct rules that reading out.) For every
choice of round constants and every state `z` entering the first partial round, the runs from `z`
and from `z + v` feed equal inputs to every S-box at the positions of `candMask` in every partial
round. The witness `v` is `witnessBypass`, the first vector of `witnessBypassBasis`: the kernel
checks on the numerals that every basis vector is zero on every masked position and that
`candInternal` maps their span into itself with the coefficients `witnessBypassCoeffs`
(`Hades.invariant_of_check`), so every power of `candInternal` keeps `v` at zero on the mask
(`Hades.powers_zero_of_invariant`, `Hades.Design.bypass_of_powers`). -/
theorem partial_bypass :
    0 < candPartialRounds ∧
      ∃ v : Fin 8 → ZMod candModulus, v ≠ 0 ∧
        Hades.Design.Bypass
          { external := candExternal, internal := candInternal, exponent := candExponent,
            fullRounds := candFullRounds, partialRounds := candPartialRounds }
          candMask v := by
  obtain ⟨hM, hz⟩ : (∀ k, candInternal.mulVec (witnessBypassBasis k) =
      ∑ l, witnessBypassCoeffs k l • witnessBypassBasis l) ∧
      ∀ k, ∀ i ∈ candMask, witnessBypassBasis k i = 0 :=
    Hades.invariant_of_check (by decide +kernel)
  exact ⟨by decide, witnessBypass, NatMatrix.pfVecs_zero_ne_zero_of_check (by decide +kernel),
    Hades.Design.bypass_of_powers
      { external := candExternal, internal := candInternal, exponent := candExponent,
            fullRounds := candFullRounds, partialRounds := candPartialRounds }
      candMask witnessBypass
      (fun j _ => Hades.powers_zero_of_invariant candInternal candMask witnessBypassBasis
        witnessBypassCoeffs hM hz 0 j)⟩

end CryptificateJob
#cryptificate_audit CryptificateJob.field_prime
#cryptificate_audit CryptificateJob.external_not_mds
#cryptificate_audit CryptificateJob.external_m4_not_mds
#cryptificate_audit CryptificateJob.external_singular
#cryptificate_audit CryptificateJob.internal_singular
#cryptificate_audit CryptificateJob.power_bijective
#cryptificate_audit CryptificateJob.partial_bypass
