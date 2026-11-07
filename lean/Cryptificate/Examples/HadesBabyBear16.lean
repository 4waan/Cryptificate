import Cryptificate

/-!
# Example: Poseidon2 over BabyBear, width 16 (Plonky3)

The prime-field profile (`hades/prime/v1`) over BabyBear, `p = 15 · 2²⁷ + 1 = 2013265921`, with the
linear layers, round numbers and S-box of Plonky3's width-16 Poseidon2
(`examples/designs/babybear-t16.json`): the external matrix `circ(2 M₄, M₄, M₄, M₄)` with
`M₄ = [[2,3,1,1],[1,2,3,1],[1,1,2,3],[3,1,1,2]]` (`MDSMat4`, `poseidon2/src/external.rs`), the
internal matrix `1 · 1ᵀ + diag(V)` with
`V = [-2, 1, 2, 1/2, 3, 4, -1/2, -3, -4, 1/2⁸, 1/4, 1/8, 1/2²⁷, -1/2⁸, -1/16, -1/2²⁷]`
(`baby-bear/src/poseidon2.rs`), `8` full and `13` partial rounds, and `x ↦ x ^ 7` on coordinate `0`
in the partial rounds, all as in the Plonky3 repository at commit
`0d803737b681774186cd283b1fd2d8e493655c82`. Round constants are not part of the design, and no claim
depends on them.

The certificate proves the modulus prime (`field_prime`) and then: the `16 × 16` external matrix is
not MDS: its submatrix on rows `0, 4` and columns `0, 1` is singular, so a nonzero input of weight
`2` has an image of weight `12`, `14` in total, below the `17` of an MDS matrix (`external_not_mds`,
counted on numerals); it is `circ(2 M₄, M₄, …, M₄)` for `M₄` above, and all `69` minors of `M₄` are
nonzero (`external_m4_mds`); it is invertible (`external_invertible`), and so is the internal matrix
(`internal_invertible`): the engine computes each inverse modulo `p`, and the kernel checks
`M · M⁻¹ = 1` with every row and column packed into one number in base `2 ^ 70`
(`Packed.checkInverse`); `x ↦ x ^ 7` is a bijection (`power_bijective`).

With `13` partial rounds and one S-box each, fewer than the width `16`, the `13` rows `e₀ Mʲ`,
`j < 13`, cannot span all `16` coordinates: the difference `witnessBypass` is orthogonal to all of
them modulo `p`, so it stays at zero on coordinate `0` through every partial round and passes them
with no active S-box (`partial_bypass_short`). The engine finds no invariant subspace here (the rows
`e₀ Mʲ`, `j < 16`, have full rank), so `16` or more partial rounds would charge every window of
`16`; that is not part of this certificate. The statement concerns differences through the partial
rounds alone; it is not an attack on the permutation, whose full rounds it says nothing about.

Not established, and not in the certificate: `activity.outer` and `activity.total`. Their bound
needs an MDS external matrix, and no theorem here bounds the activity of full rounds whose external
matrix is `circ(2 M₄, M₄, …, M₄)`. These claims are lower bounds on active S-boxes in any case, not
security levels.

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
def candModulus : ℕ := 2013265921

#eval Audit.echoDecimal "candModulus" candModulus

/-- The candidate's external matrix over `ZMod candModulus`, row-major as submitted. HADES mixes
with it in every full round and, as Poseidon2 does, once before the first round. -/
def candExternal : Matrix (Fin 16) (Fin 16) (ZMod candModulus) :=
  pfMat candModulus 16 [4, 6, 2, 2, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 4, 6, 2, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 2, 2, 4, 6, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 6, 2, 2, 4, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 2, 3, 1, 1, 4, 6, 2, 2, 2, 3, 1, 1, 2, 3, 1, 1, 1, 2, 3, 1, 2, 4, 6, 2, 1, 2, 3, 1, 1, 2, 3, 1, 1, 1, 2, 3, 2, 2, 4, 6, 1, 1, 2, 3, 1, 1, 2, 3, 3, 1, 1, 2, 6, 2, 2, 4, 3, 1, 1, 2, 3, 1, 1, 2, 2, 3, 1, 1, 2, 3, 1, 1, 4, 6, 2, 2, 2, 3, 1, 1, 1, 2, 3, 1, 1, 2, 3, 1, 2, 4, 6, 2, 1, 2, 3, 1, 1, 1, 2, 3, 1, 1, 2, 3, 2, 2, 4, 6, 1, 1, 2, 3, 3, 1, 1, 2, 3, 1, 1, 2, 6, 2, 2, 4, 3, 1, 1, 2, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 4, 6, 2, 2, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 2, 4, 6, 2, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 2, 2, 4, 6, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 6, 2, 2, 4]

#eval Audit.echoInput "candExternal" candExternal

/-- The candidate's internal matrix over `ZMod candModulus`, row-major as submitted. HADES mixes
with it in every partial round. -/
def candInternal : Matrix (Fin 16) (Fin 16) (ZMod candModulus) :=
  pfMat candModulus 16 [2013265920, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1006632962, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1006632961, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2013265919, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2013265918, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2005401602, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1509949442, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1761607682, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2013265907, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 7864321, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 125829121, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 16]

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
def candPartialMask : Fin 16 → Bool :=
  maskBits 16 [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]

#eval Audit.echoInput "candPartialMask" candPartialMask

/-- The positions where `candPartialMask` is `true`: the S-box positions of a partial round. -/
def candMask : Finset (Fin 16) :=
  Finset.univ.filter fun i => candPartialMask i = true

/-- The branch-number witness for the external matrix, as numerals: a nonzero state that,
together with its image under `candExternal`, has at most as many nonzero coordinates as the
width. -/
def witnessVectorEntries : List ℕ :=
  [1006632959, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]

/-- The same witness as a state over `ZMod candModulus`. -/
def witnessVector : Fin 16 → ZMod candModulus :=
  pfVec candModulus 16 witnessVectorEntries

#eval Audit.echoInput "witnessVector" witnessVector

/-- The `4 × 4` block `M₄` of the external matrix, row-major: the top-right block of
`candExternal`, as the engine read it. Claim `external.m4_mds` proves that `candExternal` is
`circ(2 M₄, M₄, …, M₄)` for this matrix. -/
def externalM4 : Matrix (Fin 4) (Fin 4) (ZMod candModulus) :=
  pfMat candModulus 4 [2, 3, 1, 1, 1, 2, 3, 1, 1, 1, 2, 3, 3, 1, 1, 2]

#eval Audit.echoInput "externalM4" externalM4

/-- An inverse witness for `candExternal`, in the layout of `witnessInternalInverse`: column by
column, each column from its last entry to its first. -/
def witnessExternalInverse : List ℕ :=
  [782297615, 1829195894, 1748665257, 299113794, 782297615, 1829195894, 1748665257, 299113794, 782297615, 1829195894, 1748665257, 299113794, 897341382, 736280108, 1058402656, 816810745, 1829195894, 1748665257, 299113794, 782297615, 1829195894, 1748665257, 299113794, 782297615, 1829195894, 1748665257, 299113794, 782297615, 736280108, 1058402656, 816810745, 897341382, 1748665257, 299113794, 782297615, 1829195894, 1748665257, 299113794, 782297615, 1829195894, 1748665257, 299113794, 782297615, 1829195894, 1058402656, 816810745, 897341382, 736280108, 299113794, 782297615, 1829195894, 1748665257, 299113794, 782297615, 1829195894, 1748665257, 299113794, 782297615, 1829195894, 1748665257, 816810745, 897341382, 736280108, 1058402656, 782297615, 1829195894, 1748665257, 299113794, 782297615, 1829195894, 1748665257, 299113794, 897341382, 736280108, 1058402656, 816810745, 782297615, 1829195894, 1748665257, 299113794, 1829195894, 1748665257, 299113794, 782297615, 1829195894, 1748665257, 299113794, 782297615, 736280108, 1058402656, 816810745, 897341382, 1829195894, 1748665257, 299113794, 782297615, 1748665257, 299113794, 782297615, 1829195894, 1748665257, 299113794, 782297615, 1829195894, 1058402656, 816810745, 897341382, 736280108, 1748665257, 299113794, 782297615, 1829195894, 299113794, 782297615, 1829195894, 1748665257, 299113794, 782297615, 1829195894, 1748665257, 816810745, 897341382, 736280108, 1058402656, 299113794, 782297615, 1829195894, 1748665257, 782297615, 1829195894, 1748665257, 299113794, 897341382, 736280108, 1058402656, 816810745, 782297615, 1829195894, 1748665257, 299113794, 782297615, 1829195894, 1748665257, 299113794, 1829195894, 1748665257, 299113794, 782297615, 736280108, 1058402656, 816810745, 897341382, 1829195894, 1748665257, 299113794, 782297615, 1829195894, 1748665257, 299113794, 782297615, 1748665257, 299113794, 782297615, 1829195894, 1058402656, 816810745, 897341382, 736280108, 1748665257, 299113794, 782297615, 1829195894, 1748665257, 299113794, 782297615, 1829195894, 299113794, 782297615, 1829195894, 1748665257, 816810745, 897341382, 736280108, 1058402656, 299113794, 782297615, 1829195894, 1748665257, 299113794, 782297615, 1829195894, 1748665257, 897341382, 736280108, 1058402656, 816810745, 782297615, 1829195894, 1748665257, 299113794, 782297615, 1829195894, 1748665257, 299113794, 782297615, 1829195894, 1748665257, 299113794, 736280108, 1058402656, 816810745, 897341382, 1829195894, 1748665257, 299113794, 782297615, 1829195894, 1748665257, 299113794, 782297615, 1829195894, 1748665257, 299113794, 782297615, 1058402656, 816810745, 897341382, 736280108, 1748665257, 299113794, 782297615, 1829195894, 1748665257, 299113794, 782297615, 1829195894, 1748665257, 299113794, 782297615, 1829195894, 816810745, 897341382, 736280108, 1058402656, 299113794, 782297615, 1829195894, 1748665257, 299113794, 782297615, 1829195894, 1748665257, 299113794, 782297615, 1829195894, 1748665257]

/-- An inverse witness for `candInternal`, computed by the engine and checked below: the
inverse matrix over `ZMod candModulus`, listed column by column, each column from its last entry
to its first (`Packed.revCols`), so that one multiplication of packed numbers gives one entry of
`candInternal * witnessInternalInverse`. -/
def witnessInternalInverse : List ℕ :=
  [33554432, 4, 64, 1979711489, 2013265919, 2013265920, 2013265857, 1887436801, 1845493761, 1006632961, 125829120, 167772160, 1006632960, 251658240, 503316480, 754974720, 1946157057, 2013265913, 2013265793, 67108864, 4, 2, 128, 251658240, 335544320, 2013265920, 1761607681, 1677721601, 1, 1509949441, 1006632962, 503316480, 1979711489, 2013265917, 2013265857, 33554432, 2, 1, 64, 125829120, 167772160, 1006632960, 1887436801, 1845493761, 1006632961, 754974721, 1509949441, 251658240, 1879048193, 2013265905, 2013265665, 134217728, 8, 4, 256, 503316480, 671088640, 2013265919, 1509949441, 1342177281, 4, 1006632961, 1, 1006632960, 648719019, 1342177278, 1342177238, 1364546902, 1342177282, 671088641, 671088683, 83886080, 782936747, 671088640, 1929379841, 559240534, 1342177281, 1845493761, 1677721601, 167772160, 1996488705, 2013265919, 2013265889, 16777216, 1, 1006632961, 32, 62914560, 83886080, 503316480, 1447034881, 1929379841, 1509949441, 1887436801, 1761607681, 125829120, 134217728, 16, 256, 1879048193, 2013265913, 2013265917, 2013265665, 1509949441, 1342177281, 0, 503316480, 671088640, 2013265919, 1006632960, 2013265920, 1006632961, 1364546902, 671088643, 671088683, 648719019, 671088639, 1342177280, 1342177238, 1929379841, 1901417814, 1342177281, 83886080, 782936747, 671088640, 167772160, 335544320, 1845493761, 16777216, 2, 32, 1996488705, 2013265920, 1006632960, 2013265889, 440401920, 1929379841, 1509949441, 62914560, 83886080, 503316480, 125829120, 251658240, 1887436801, 939524105, 2013263873, 2013233153, 1073741816, 1024, 512, 33024, 2013265889, 1342177238, 2013265665, 32, 671088683, 256, 64, 128, 2013265857, 1744830465, 2013265889, 2013265409, 268435456, 16, 12, 512, 1006632960, 1342177280, 2013265917, 1006632961, 671088641, 4, 1, 2, 2013265920, 1476395009, 2013265857, 2013264897, 536870912, 40, 16, 1024, 2013265920, 671088639, 2013265913, 1, 1342177282, 8, 2, 4, 2013265919, 1480868933, 939524097, 939524105, 666614716, 536870912, 268435456, 1073741816, 1996488705, 648719019, 1879048193, 16777216, 1364546902, 134217728, 33554432, 67108864, 1979711489, 1073741816, 2048, 32512, 939524105, 2013264897, 2013265409, 2013233153, 32, 671088683, 256, 2013265889, 1342177238, 2013265665, 2013265857, 2013265793, 64, 1073741824, 112, 2048, 939524097, 2013265857, 2013265889, 2013263873, 2, 671088643, 16, 2013265919, 1342177278, 2013265905, 2013265917, 2013265913, 4, 398179260, 1073741824, 1073741816, 1480868933, 1476395009, 1744830465, 939524105, 16777216, 1364546902, 134217728, 1996488705, 648719019, 1879048193, 1979711489, 1946157057, 33554432]

/-- The bypass witness for a design with fewer partial rounds than its width: a nonzero
difference whose images under `candInternal ^ j`, for every `j` below the number of partial
rounds, are zero on every masked position. -/
def witnessBypass : Fin 16 → ZMod candModulus :=
  pfVec candModulus 16 [0, 1, 1874352623, 1257495309, 554348384, 1074720774, 1470759498, 503939355, 953859619, 674842893, 152246033, 1732241493, 1185522086, 645267458, 0, 0]

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

/-- Claim `external.m4_mds`: `candExternal` is the Poseidon2 external matrix
`circ(2 M₄, M₄, …, M₄)` built from the `4 × 4` matrix `externalM4` (`2 M₄` on the diagonal blocks,
`M₄` on every other block, `Hades.poseidon2External`), and `externalM4` is MDS over
`ZMod candModulus`. The first part is one comparison of packed numbers
(`Packed.checkBlocks`); the second evaluates the `69` canonical minors of `externalM4`
(`isMDS_of_minors4Ok`). The statement is about `M₄`: it does not say that the
`16 × 16` external matrix is MDS, and for a width above `4` it is not. -/
theorem external_m4_mds :
    candExternal = Hades.poseidon2External 16 externalM4 ∧ IsMDS externalM4 :=
  ⟨Hades.pfMat_eq_poseidon2External_of_checkP (S := 70) (by decide +kernel),
    isMDS_of_minors4Ok externalM4 (by decide)⟩

/-- Claim `external.invertible`: the determinant of `candExternal` over `ZMod candModulus` is
nonzero. The certificate is the inverse matrix `witnessExternalInverse`, checked as for
`internal_invertible` (`Packed.det_ne_zero_of_checkInverse`). This is invertibility only: it
does not say that the external matrix is MDS. -/
theorem external_invertible : candExternal.det ≠ 0 :=
  Packed.det_ne_zero_of_checkInverse (S := 70) (Wr := witnessExternalInverse)
    (by decide +kernel)

/-- Claim `internal.invertible`: the determinant of `candInternal` over `ZMod candModulus` is
nonzero. The certificate is the inverse matrix `witnessInternalInverse`: the kernel checks
`candInternal * witnessInternalInverse = 1` entry by entry (`Packed.checkInverse`), each entry one
product of packed numbers in base `2 ^ 70`, and a matrix with a right inverse has a
nonzero determinant (`Packed.det_ne_zero_of_checkInverse`). -/
theorem internal_invertible : candInternal.det ≠ 0 :=
  Packed.det_ne_zero_of_checkInverse (S := 70) (Wr := witnessInternalInverse)
    (by decide +kernel)

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
      ∃ v : Fin 16 → ZMod candModulus, v ≠ 0 ∧
        Hades.Design.Bypass
          { external := candExternal, internal := candInternal, exponent := candExponent,
            fullRounds := candFullRounds, partialRounds := candPartialRounds }
          candMask v :=
  ⟨by decide, witnessBypass, NatMatrix.pfVec_ne_zero_of_check (by decide +kernel),
    Hades.Design.bypass_of_powers
      { external := candExternal, internal := candInternal, exponent := candExponent,
            fullRounds := candFullRounds, partialRounds := candPartialRounds }
      candMask witnessBypass
      (Hades.powers_zero_of_checkOrthP (S := 70) (by decide +kernel))⟩

end CryptificateJob
#cryptificate_audit CryptificateJob.field_prime
#cryptificate_audit CryptificateJob.external_not_mds
#cryptificate_audit CryptificateJob.external_m4_mds
#cryptificate_audit CryptificateJob.external_invertible
#cryptificate_audit CryptificateJob.internal_invertible
#cryptificate_audit CryptificateJob.power_bijective
#cryptificate_audit CryptificateJob.partial_bypass_short
