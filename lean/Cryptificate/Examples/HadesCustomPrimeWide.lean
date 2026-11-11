import Cryptificate

/-!
# Example: a width-twelve Poseidon2 layout over a custom prime

A width-twelve design over the custom prime `p = 18446744073709551557`, the largest prime below
`2⁶⁴`, given as `"field": "prime"` with an explicit `"modulus"` (`examples/designs/prime-t12.json`):
the Poseidon2 external matrix `circ(2 M₄, M₄, M₄)` with
`M₄ = [[2,3,1,1],[1,2,3,1],[1,1,2,3],[3,1,1,2]]`, the internal matrix
`1 · 1ᵀ + diag(-2, 1, 2, …, 11)`, `8` full and `8` partial rounds, and `x ↦ x ^ 3` on coordinate `0`
in the partial rounds. The parameters are chosen for illustration; this is not a deployed instance.

The certificate proves the modulus prime from a Pratt certificate (`field_prime`), and then: the
`12 × 12` external matrix is not MDS (`external_not_mds`, a singular `2 × 2` submatrix); it is
`circ(2 M₄, M₄, M₄)` with `M₄` MDS (`external_m4_mds`); the external and internal matrices have
inverses modulo `p`, checked with packed arithmetic in base `2 ^ 136` (`external_invertible`,
`internal_invertible`); `x ↦ x ^ 3` is a bijection, since `3` does not divide `p - 1`
(`power_bijective`). With only `8` partial rounds and one S-box each, fewer than the width, the
difference `witnessBypass` stays at zero on coordinate `0` through all of them
(`partial_bypass_short`), a statement about the partial rounds alone.

Not established: `activity.outer` and `activity.total`, which need an MDS external matrix.

Instantiated by the engine (`emit-lean`) from the fragments `header`, `const_modulus_prime`,
`const_external_prime`, `const_internal_prime`, `const_exponent`, `const_rounds_hades`,
`const_mask_prime`, `const_witness_external_list_prime`, `const_external_m4_prime`,
`const_witness_external_inverse_prime`, `const_witness_internal_inverse_prime`,
`const_witness_bypass_prime`, `field_prime`, `external_not_mds_prime_list`, `external_m4_mds_prime`,
`external_invertible_prime`, `internal_invertible_prime_packed`, `power_bijective_prime`,
`partial_bypass_short_prime_packed` and `footer`.
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
def candExternal : Matrix (Fin 12) (Fin 12) (ZMod candModulus) :=
  pfMat candModulus 12 [4, 6, 2, 2, 2, 3, 1, 1, 2, 3, 1, 1, 2, 4, 6, 2, 1, 2, 3, 1, 1, 2, 3, 1, 2, 2, 4, 6, 1, 1, 2, 3, 1, 1, 2, 3, 6, 2, 2, 4, 3, 1, 1, 2, 3, 1, 1, 2, 2, 3, 1, 1, 4, 6, 2, 2, 2, 3, 1, 1, 1, 2, 3, 1, 2, 4, 6, 2, 1, 2, 3, 1, 1, 1, 2, 3, 2, 2, 4, 6, 1, 1, 2, 3, 3, 1, 1, 2, 6, 2, 2, 4, 3, 1, 1, 2, 2, 3, 1, 1, 2, 3, 1, 1, 4, 6, 2, 2, 1, 2, 3, 1, 1, 2, 3, 1, 2, 4, 6, 2, 1, 1, 2, 3, 1, 1, 2, 3, 2, 2, 4, 6, 3, 1, 1, 2, 3, 1, 1, 2, 6, 2, 2, 4]

#eval Audit.echoInput "candExternal" candExternal

/-- The candidate's internal matrix over `ZMod candModulus`, row-major as submitted. HADES mixes
with it in every partial round. -/
def candInternal : Matrix (Fin 12) (Fin 12) (ZMod candModulus) :=
  pfMat candModulus 12 [18446744073709551556, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 6, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 7, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 8, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 9, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 10, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 11, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 12]

#eval Audit.echoInput "candInternal" candInternal

/-- The exponent `e` of the candidate's power S-box `x ↦ x ^ e`. -/
def candExponent : ℕ := 3

#eval Audit.echoInput "candExponent" candExponent

/-- The candidate's number of full rounds, half of them before the partial rounds and half
after. -/
def candFullRounds : ℕ := 8

#eval Audit.echoInput "candFullRounds" candFullRounds

/-- The candidate's number of partial rounds. -/
def candPartialRounds : ℕ := 8

#eval Audit.echoInput "candPartialRounds" candPartialRounds

/-- The candidate's partial-round mask: `true` at the positions where a partial round applies
the S-box, as submitted. -/
def candPartialMask : Fin 12 → Bool :=
  maskBits 12 [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]

#eval Audit.echoInput "candPartialMask" candPartialMask

/-- The positions where `candPartialMask` is `true`: the S-box positions of a partial round. -/
def candMask : Finset (Fin 12) :=
  Finset.univ.filter fun i => candPartialMask i = true

/-- The branch-number witness for the external matrix, as numerals: a nonzero state that,
together with its image under `candExternal`, has at most as many nonzero coordinates as the
width. -/
def witnessVectorEntries : List ℕ :=
  [9223372036854775777, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]

/-- The same witness as a state over `ZMod candModulus`. -/
def witnessVector : Fin 12 → ZMod candModulus :=
  pfVec candModulus 12 witnessVectorEntries

#eval Audit.echoInput "witnessVector" witnessVector

/-- The `4 × 4` block `M₄` of the external matrix, row-major: the block on rows 0–3 and
columns 4–7 of `candExternal` (its first off-diagonal block), as the engine read it. Claim
`external.m4_mds` proves that `candExternal` is `circ(2 M₄, M₄, …, M₄)` for this matrix. -/
def externalM4 : Matrix (Fin 4) (Fin 4) (ZMod candModulus) :=
  pfMat candModulus 4 [2, 3, 1, 1, 1, 2, 3, 1, 1, 1, 2, 3, 3, 1, 1, 2]

#eval Audit.echoInput "externalM4" externalM4

/-- An inverse witness for `candExternal`, in the layout of `witnessInternalInverse`: column by
column, each column from its last entry to its first. -/
def witnessExternalInverse : List ℕ :=
  [5138735849104803648, 18051456700701489738, 10672759071217669115, 11595096274903146693, 5138735849104803648, 18051456700701489738, 10672759071217669115, 11595096274903146693, 3030536526395140613, 1185862119024185457, 4875210933766095769, 2108199322709663035, 18051456700701489738, 10672759071217669115, 11595096274903146693, 5138735849104803648, 18051456700701489738, 10672759071217669115, 11595096274903146693, 5138735849104803648, 1185862119024185457, 4875210933766095769, 2108199322709663035, 3030536526395140613, 10672759071217669115, 11595096274903146693, 5138735849104803648, 18051456700701489738, 10672759071217669115, 11595096274903146693, 5138735849104803648, 18051456700701489738, 4875210933766095769, 2108199322709663035, 3030536526395140613, 1185862119024185457, 11595096274903146693, 5138735849104803648, 18051456700701489738, 10672759071217669115, 11595096274903146693, 5138735849104803648, 18051456700701489738, 10672759071217669115, 2108199322709663035, 3030536526395140613, 1185862119024185457, 4875210933766095769, 5138735849104803648, 18051456700701489738, 10672759071217669115, 11595096274903146693, 3030536526395140613, 1185862119024185457, 4875210933766095769, 2108199322709663035, 5138735849104803648, 18051456700701489738, 10672759071217669115, 11595096274903146693, 18051456700701489738, 10672759071217669115, 11595096274903146693, 5138735849104803648, 1185862119024185457, 4875210933766095769, 2108199322709663035, 3030536526395140613, 18051456700701489738, 10672759071217669115, 11595096274903146693, 5138735849104803648, 10672759071217669115, 11595096274903146693, 5138735849104803648, 18051456700701489738, 4875210933766095769, 2108199322709663035, 3030536526395140613, 1185862119024185457, 10672759071217669115, 11595096274903146693, 5138735849104803648, 18051456700701489738, 11595096274903146693, 5138735849104803648, 18051456700701489738, 10672759071217669115, 2108199322709663035, 3030536526395140613, 1185862119024185457, 4875210933766095769, 11595096274903146693, 5138735849104803648, 18051456700701489738, 10672759071217669115, 3030536526395140613, 1185862119024185457, 4875210933766095769, 2108199322709663035, 5138735849104803648, 18051456700701489738, 10672759071217669115, 11595096274903146693, 5138735849104803648, 18051456700701489738, 10672759071217669115, 11595096274903146693, 1185862119024185457, 4875210933766095769, 2108199322709663035, 3030536526395140613, 18051456700701489738, 10672759071217669115, 11595096274903146693, 5138735849104803648, 18051456700701489738, 10672759071217669115, 11595096274903146693, 5138735849104803648, 4875210933766095769, 2108199322709663035, 3030536526395140613, 1185862119024185457, 10672759071217669115, 11595096274903146693, 5138735849104803648, 18051456700701489738, 10672759071217669115, 11595096274903146693, 5138735849104803648, 18051456700701489738, 2108199322709663035, 3030536526395140613, 1185862119024185457, 4875210933766095769, 11595096274903146693, 5138735849104803648, 18051456700701489738, 10672759071217669115, 11595096274903146693, 5138735849104803648, 18051456700701489738, 10672759071217669115]

/-- An inverse witness for `candInternal`, computed by the engine and checked below: the
inverse matrix over `ZMod candModulus`, listed column by column, each column from its last entry
to its first (`Packed.revCols`), so that one multiplication of packed numbers gives one entry of
`candInternal * witnessInternalInverse`. -/
def witnessInternalInverse : List ℕ :=
  [16892295213146065143, 1979455068122075256, 8348309211372156359, 2474318835152594070, 13368789568008422684, 3299091780203458760, 3958910136244150512, 4948637670305188140, 6598183560406917520, 9897275340610376280, 1347806607511201003, 17772840769953951055, 3108897721126972828, 14487833937465401045, 1750125650965238839, 13498106403404363417, 10155909011402257746, 11848560513302634037, 10528923801221250533, 8549468733099175277, 5250376952895716517, 17098937466198350554, 15751130858687149552, 1347806607511201003, 1554448860563486414, 16467289005587476301, 10098434862337395198, 15972425238556957487, 5077954505701128873, 15147652293506092797, 14487833937465401045, 13498106403404363417, 11848560513302634037, 17772840769953951056, 17098937466198350554, 9897275340610376280, 7185213931612174795, 17127107361628168053, 6732289908224930132, 16797198183607822177, 3385303003800752582, 10098434862337395198, 15807470649546784549, 15147652293506092797, 7899040342201756025, 11848560513302634037, 5250376952895716517, 6598183560406917520, 777224430281743207, 17457016539648513929, 5049217431168697599, 17209584656133254522, 11762349289705340215, 16797198183607822177, 16467289005587476301, 11360739220129569598, 15147652293506092797, 13498106403404363417, 8549468733099175277, 4948637670305188140, 4311128358967304877, 2897566787493080209, 11418071574418778702, 17457016539648513929, 9409879431764272172, 17127107361628168053, 13173831204469981041, 16467289005587476301, 15807470649546784549, 14487833937465401045, 10528923801221250533, 3958910136244150512, 12815979002660863176, 17786925717668859805, 3366144954112465066, 17621971128658686867, 1692651501900376291, 8123674776786956192, 17127107361628168053, 16797198183607822177, 10098434862337395198, 15147652293506092797, 11848560513302634037, 3299091780203458760, 10985124859423597008, 4704939715882136086, 13426263717073285232, 15104546681707445886, 1450844144486036821, 1692651501900376291, 9409879431764272172, 11762349289705340215, 3385303003800752582, 5077954505701128873, 10155909011402257746, 13368789568008422684, 9611984251995647382, 17951880306679032743, 11747980752439124578, 15522321355707709095, 15104546681707445886, 17621971128658686867, 17457016539648513929, 17209584656133254522, 16797198183607822177, 15972425238556957487, 13498106403404363417, 2474318835152594070, 8543986001773908784, 5709035787209389351, 4293734866487149106, 11747980752439124578, 13426263717073285232, 3366144954112465066, 11418071574418778702, 5049217431168697599, 6732289908224930132, 10098434862337395198, 1750125650965238839, 8348309211372156359, 11378936216338428217, 5138132208488450416, 5709035787209389351, 17951880306679032743, 4704939715882136086, 17786925717668859805, 2897566787493080209, 17457016539648513929, 17127107361628168053, 16467289005587476301, 14487833937465401045, 1979455068122075256, 1959603799530593126, 11378936216338428217, 8543986001773908784, 9611984251995647382, 10985124859423597008, 12815979002660863176, 4311128358967304877, 777224430281743207, 7185213931612174795, 1554448860563486414, 3108897721126972828, 16892295213146065143]

/-- The bypass witness for a design with fewer partial rounds than its width: a nonzero
difference whose images under `candInternal ^ j`, for every `j` below the number of partial
rounds, are zero on every masked position. -/
def witnessBypass : Fin 12 → ZMod candModulus :=
  pfVec candModulus 12 [0, 1, 18446744073709551550, 21, 18446744073709551522, 35, 18446744073709551536, 7, 18446744073709551556, 0, 0, 0]

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
matrix forces one more (`isMDS_branch_bound`). The kernel computes the image row by row on the
numerals and counts the entries that are nonzero modulo `candModulus`
(`NatMatrix.not_isMDS_of_checkBranch`). -/
theorem external_not_mds : ¬ IsMDS candExternal :=
  NatMatrix.not_isMDS_of_checkBranch (v := witnessVectorEntries) (by decide +kernel)

/-- Claim `external.m4_mds`: `candExternal` is the Poseidon2 external matrix
`circ(2 M₄, M₄, …, M₄)` built from the `4 × 4` matrix `externalM4` (`2 M₄` on the diagonal blocks,
`M₄` on every other block, `Hades.poseidon2External`), and `externalM4` is MDS over
`ZMod candModulus`. The first part is one comparison of packed numbers
(`Packed.checkBlocks`); the second evaluates the `69` canonical minors of `externalM4`
(`isMDS_of_minors4Ok`). The statement is about `M₄`: it does not say that the
`12 × 12` external matrix is MDS, and for a width above `4` it is not. -/
theorem external_m4_mds :
    candExternal = Hades.poseidon2External 12 externalM4 ∧ IsMDS externalM4 :=
  ⟨Hades.pfMat_eq_poseidon2External_of_checkP (S := 136) (by decide +kernel),
    isMDS_of_minors4Ok externalM4 (by decide)⟩

/-- Claim `external.invertible`: the determinant of `candExternal` over `ZMod candModulus` is
nonzero. The certificate is the inverse matrix `witnessExternalInverse`, checked as for
`internal_invertible` (`Packed.det_ne_zero_of_checkInverse`). This is invertibility only: it
does not say that the external matrix is MDS. -/
theorem external_invertible : candExternal.det ≠ 0 :=
  Packed.det_ne_zero_of_checkInverse (S := 136) (Wr := witnessExternalInverse)
    (by decide +kernel)

/-- Claim `internal.invertible`: the determinant of `candInternal` over `ZMod candModulus` is
nonzero. The certificate is the inverse matrix `witnessInternalInverse`: the kernel checks
`candInternal * witnessInternalInverse = 1` entry by entry (`Packed.checkInverse`), each entry one
product of packed numbers in base `2 ^ 136`, and a matrix with a right inverse has a
nonzero determinant (`Packed.det_ne_zero_of_checkInverse`). -/
theorem internal_invertible : candInternal.det ≠ 0 :=
  Packed.det_ne_zero_of_checkInverse (S := 136) (Wr := witnessInternalInverse)
    (by decide +kernel)

/-- Claim `sbox.bijective`: `x ↦ x ^ candExponent` permutes `ZMod candModulus`, stated for
`PrimePower.ZModP.powMap candModulus candExponent` so that the statement names the field. The
certificate is an inverse exponent `d` and a multiplier `k` with
`candExponent * d = (p - 1) * k + 1`, given below in that order: an identity between natural
numbers that the kernel checks. By Fermat's little theorem in `ZMod p` (`PrimePower.ZModP.powMap_bijective`) `x ↦ x ^ d` is then the inverse
map. -/
theorem power_bijective : Function.Bijective (PrimePower.ZModP.powMap candModulus candExponent) :=
  PrimePower.ZModP.powMap_bijective candModulus candExponent
    12297829382473034371
    2 (by decide) (by decide) (by decide)

/-- Claim `activity.partial`, refuted for a design with fewer partial rounds than the
observability of its internal matrix needs: there is at least one partial round (with none, every
difference would pass them vacuously), and a nonzero difference passes them all with no active
S-box. For every choice of round constants and every state `z` entering the first partial round,
the runs from `z` and from `z + v` feed equal inputs to every S-box at the positions of `candMask`
in every partial round. The witness `v` is `witnessBypass`; the kernel computes the rows of
`candInternal ^ j` at the masked positions, for every `j` below the number of partial rounds, by
packed vector-matrix products, and checks that each is orthogonal to it modulo `candModulus`
(`Hades.powers_zero_of_checkOrthP`). This is a statement about differences through the partial
rounds alone; it says nothing about the full rounds around them. -/
theorem partial_bypass_short :
    0 < candPartialRounds ∧
      ∃ v : Fin 12 → ZMod candModulus, v ≠ 0 ∧
        Hades.Design.Bypass
          { external := candExternal, internal := candInternal, exponent := candExponent,
            fullRounds := candFullRounds, partialRounds := candPartialRounds }
          candMask v :=
  ⟨by decide, witnessBypass, NatMatrix.pfVec_ne_zero_of_check (by decide +kernel),
    Hades.Design.bypass_of_powers
      { external := candExternal, internal := candInternal, exponent := candExponent,
            fullRounds := candFullRounds, partialRounds := candPartialRounds }
      candMask witnessBypass
      (Hades.powers_zero_of_checkOrthP (S := 136) (by decide +kernel))⟩

end CryptificateJob
#cryptificate_audit CryptificateJob.field_prime
#cryptificate_audit CryptificateJob.external_not_mds
#cryptificate_audit CryptificateJob.external_m4_mds
#cryptificate_audit CryptificateJob.external_invertible
#cryptificate_audit CryptificateJob.internal_invertible
#cryptificate_audit CryptificateJob.power_bijective
#cryptificate_audit CryptificateJob.partial_bypass_short
