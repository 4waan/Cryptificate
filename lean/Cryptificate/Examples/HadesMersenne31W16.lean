import Cryptificate

/-!
# Example: Poseidon2 over Mersenne31, width 16 (Plonky3)

The prime-field profile (`hades/prime/v1`) over Mersenne31, `p = 2³¹ - 1 = 2147483647`, with the
linear layers, round numbers and S-box of Plonky3's width-16 Poseidon2
(`examples/designs/mersenne31-t16.json`): the external matrix `circ(2 M₄, M₄, M₄, M₄)` with
`M₄ = [[2,3,1,1],[1,2,3,1],[1,1,2,3],[3,1,1,2]]` (`MDSMat4`, `poseidon2/src/external.rs`), the
internal matrix `1 · 1ᵀ + diag(V)` with
`V = [-2, 1, 2, 4, 8, 16, 32, 64, 2⁷, 2⁸, 2¹⁰, 2¹², 2¹³, 2¹⁴, 2¹⁵, 2¹⁶]`
(`mersenne-31/src/poseidon2.rs`), `8` full and `14` partial rounds, and `x ↦ x ^ 5` on coordinate
`0` in the partial rounds, all as in the Plonky3 repository at commit
`0d803737b681774186cd283b1fd2d8e493655c82`. Round constants are not part of the design, and no claim
depends on them.

The certificate proves the modulus prime (`field_prime`) and then: the `16 × 16` external matrix is
not MDS: its submatrix on rows `0, 4` and columns `0, 1` is singular, so a nonzero input of weight
`2` has an image of weight `12`, `14` in total, below the `17` of an MDS matrix (`external_not_mds`,
counted on numerals); it is `circ(2 M₄, M₄, …, M₄)` for `M₄` above, and all `69` minors of `M₄` are
nonzero (`external_m4_mds`); it is invertible (`external_invertible`), and so is the internal matrix
(`internal_invertible`): the engine computes each inverse modulo `p`, and the kernel checks
`M · M⁻¹ = 1` with every row and column packed into one number in base `2 ^ 70`
(`Packed.checkInverse`); `x ↦ x ^ 5` is a bijection (`power_bijective`).

With `14` partial rounds and one S-box each, fewer than the width `16`, the `14` rows `e₀ Mʲ`,
`j < 14`, cannot span all `16` coordinates: the difference `witnessBypass` is orthogonal to all of
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
def candModulus : ℕ := 2147483647

#eval Audit.echoDecimal "candModulus" candModulus

/-- The candidate's external matrix over `ZMod candModulus`, row-major as submitted. HADES mixes
with it in every full round and, as Poseidon2 does, once before the first round. -/
def candExternal : Matrix (Fin 16) (Fin 16) (ZMod candModulus) :=
  pfMat candModulus 16 [4, 6, 2, 2, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 4, 6, 2, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 2, 2, 4, 6, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 6, 2, 2, 4, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 2, 3, 1, 1, 4, 6, 2, 2, 2, 3, 1, 1, 2, 3, 1, 1, 1, 2, 3, 1, 2, 4, 6, 2, 1, 2, 3, 1, 1, 2, 3, 1, 1, 1, 2, 3, 2, 2, 4, 6, 1, 1, 2, 3, 1, 1, 2, 3, 3, 1, 1, 2, 6, 2, 2, 4, 3, 1, 1, 2, 3, 1, 1, 2, 2, 3, 1, 1, 2, 3, 1, 1, 4, 6, 2, 2, 2, 3, 1, 1, 1, 2, 3, 1, 1, 2, 3, 1, 2, 4, 6, 2, 1, 2, 3, 1, 1, 1, 2, 3, 1, 1, 2, 3, 2, 2, 4, 6, 1, 1, 2, 3, 3, 1, 1, 2, 3, 1, 1, 2, 6, 2, 2, 4, 3, 1, 1, 2, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 4, 6, 2, 2, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 2, 4, 6, 2, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 2, 2, 4, 6, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 6, 2, 2, 4]

#eval Audit.echoInput "candExternal" candExternal

/-- The candidate's internal matrix over `ZMod candModulus`, row-major as submitted. HADES mixes
with it in every partial round. -/
def candInternal : Matrix (Fin 16) (Fin 16) (ZMod candModulus) :=
  pfMat candModulus 16 [2147483646, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 9, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 17, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 33, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 65, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 129, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 257, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1025, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4097, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 8193, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 16385, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 32769, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 65537]

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
  [1073741822, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]

/-- The same witness as a state over `ZMod candModulus`. -/
def witnessVector : Fin 16 → ZMod candModulus :=
  pfVec candModulus 16 witnessVectorEntries

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
  [294512043, 1067606156, 1668901577, 1754800923, 294512043, 1067606156, 1668901577, 1754800923, 294512043, 1067606156, 1668901577, 1754800923, 969435475, 24542670, 1914328280, 1570730896, 1067606156, 1668901577, 1754800923, 294512043, 1067606156, 1668901577, 1754800923, 294512043, 1067606156, 1668901577, 1754800923, 294512043, 24542670, 1914328280, 1570730896, 969435475, 1668901577, 1754800923, 294512043, 1067606156, 1668901577, 1754800923, 294512043, 1067606156, 1668901577, 1754800923, 294512043, 1067606156, 1914328280, 1570730896, 969435475, 24542670, 1754800923, 294512043, 1067606156, 1668901577, 1754800923, 294512043, 1067606156, 1668901577, 1754800923, 294512043, 1067606156, 1668901577, 1570730896, 969435475, 24542670, 1914328280, 294512043, 1067606156, 1668901577, 1754800923, 294512043, 1067606156, 1668901577, 1754800923, 969435475, 24542670, 1914328280, 1570730896, 294512043, 1067606156, 1668901577, 1754800923, 1067606156, 1668901577, 1754800923, 294512043, 1067606156, 1668901577, 1754800923, 294512043, 24542670, 1914328280, 1570730896, 969435475, 1067606156, 1668901577, 1754800923, 294512043, 1668901577, 1754800923, 294512043, 1067606156, 1668901577, 1754800923, 294512043, 1067606156, 1914328280, 1570730896, 969435475, 24542670, 1668901577, 1754800923, 294512043, 1067606156, 1754800923, 294512043, 1067606156, 1668901577, 1754800923, 294512043, 1067606156, 1668901577, 1570730896, 969435475, 24542670, 1914328280, 1754800923, 294512043, 1067606156, 1668901577, 294512043, 1067606156, 1668901577, 1754800923, 969435475, 24542670, 1914328280, 1570730896, 294512043, 1067606156, 1668901577, 1754800923, 294512043, 1067606156, 1668901577, 1754800923, 1067606156, 1668901577, 1754800923, 294512043, 24542670, 1914328280, 1570730896, 969435475, 1067606156, 1668901577, 1754800923, 294512043, 1067606156, 1668901577, 1754800923, 294512043, 1668901577, 1754800923, 294512043, 1067606156, 1914328280, 1570730896, 969435475, 24542670, 1668901577, 1754800923, 294512043, 1067606156, 1668901577, 1754800923, 294512043, 1067606156, 1754800923, 294512043, 1067606156, 1668901577, 1570730896, 969435475, 24542670, 1914328280, 1754800923, 294512043, 1067606156, 1668901577, 1754800923, 294512043, 1067606156, 1668901577, 969435475, 24542670, 1914328280, 1570730896, 294512043, 1067606156, 1668901577, 1754800923, 294512043, 1067606156, 1668901577, 1754800923, 294512043, 1067606156, 1668901577, 1754800923, 24542670, 1914328280, 1570730896, 969435475, 1067606156, 1668901577, 1754800923, 294512043, 1067606156, 1668901577, 1754800923, 294512043, 1067606156, 1668901577, 1754800923, 294512043, 1914328280, 1570730896, 969435475, 24542670, 1668901577, 1754800923, 294512043, 1067606156, 1668901577, 1754800923, 294512043, 1067606156, 1668901577, 1754800923, 294512043, 1067606156, 1570730896, 969435475, 24542670, 1914328280, 1754800923, 294512043, 1067606156, 1668901577, 1754800923, 294512043, 1067606156, 1668901577, 1754800923, 294512043, 1067606156, 1668901577]

/-- An inverse witness for `candInternal`, computed by the engine and checked below: the
inverse matrix over `ZMod candModulus`, listed column by column, each column from its last entry
to its first (`Packed.revCols`), so that one multiplication of packed numbers gives one entry of
`candInternal * witnessInternalInverse`. -/
def witnessInternalInverse : List ℕ :=
  [49980993, 99961986, 199923972, 399847944, 799695888, 1051299905, 2057715973, 1967948299, 1788412951, 1429342255, 711200863, 1422401726, 697319805, 1394639610, 641795573, 1826585860, 2047521661, 1947559675, 1747635703, 1347787759, 548091871, 44883837, 179535348, 359070696, 718141392, 1436282784, 725081921, 1450163842, 752844037, 1505688074, 863892502, 641795573, 2097502654, 2047521661, 1947559675, 1747635703, 1347787759, 1096183742, 89767674, 179535348, 359070696, 718141392, 1436282784, 725081921, 1450163842, 1826585861, 1505688074, 1394639610, 1048751327, 2097502654, 2047521661, 1947559675, 1747635703, 548091871, 44883837, 89767674, 179535348, 359070696, 718141392, 1436282784, 1261952833, 1450163842, 752844037, 697319805, 1598117487, 1048751327, 2097502654, 2047521661, 1947559675, 1347787759, 1096183742, 44883837, 89767674, 179535348, 359070696, 986576848, 1436282784, 725081921, 1450163842, 1422401726, 1872800567, 1598117487, 1048751327, 2097502654, 2047521661, 1747635703, 548091871, 1096183742, 44883837, 89767674, 313753076, 359070696, 718141392, 1436282784, 725081921, 711200863, 2010142107, 1872800567, 1598117487, 1048751327, 2097502654, 1947559675, 1347787759, 548091871, 1096183742, 111992701, 89767674, 179535348, 359070696, 718141392, 1436282784, 1429342255, 2078812877, 2010142107, 1872800567, 1598117487, 1048751327, 2047521661, 1747635703, 1347787759, 581646303, 1096183742, 44883837, 89767674, 179535348, 359070696, 718141392, 1788412951, 2113148262, 2078812877, 2010142107, 1872800567, 1598117487, 2097502654, 1947559675, 1764412919, 1347787759, 548091871, 1096183742, 44883837, 89767674, 179535348, 359070696, 1967948299, 1056574131, 2113148262, 2078812877, 2010142107, 1872800567, 1048751327, 2055910269, 1947559675, 1747635703, 1347787759, 548091871, 1096183742, 44883837, 89767674, 179535348, 2057715973, 1874756268, 1602028889, 1056574131, 2113148262, 2078812877, 1874897719, 1048751327, 2097502654, 2047521661, 1947559675, 1747635703, 1347787759, 548091871, 1096183742, 44883837, 1051299905, 468689067, 937378134, 1874756268, 1602028889, 1057098419, 2078812877, 1872800567, 1598117487, 1048751327, 2097502654, 2047521661, 1947559675, 1747635703, 1347787759, 548091871, 799695888, 1308086357, 468689067, 937378134, 1875018412, 1602028889, 2113148262, 2010142107, 1872800567, 1598117487, 1048751327, 2097502654, 2047521661, 1947559675, 1747635703, 1347787759, 399847944, 1727785002, 1308086357, 468820139, 937378134, 1874756268, 1056574131, 2078812877, 2010142107, 1872800567, 1598117487, 1048751327, 2097502654, 2047521661, 1947559675, 1747635703, 199923972, 863892501, 1727850538, 1308086357, 468689067, 937378134, 1602028889, 2113148262, 2078812877, 2010142107, 1872800567, 1598117487, 1048751327, 2097502654, 2047521661, 1947559675, 99961986, 1505720842, 863892501, 1727785002, 1308086357, 468689067, 1874756268, 1056574131, 2113148262, 2078812877, 2010142107, 1872800567, 1598117487, 1048751327, 2097502654, 2047521661, 49980993]

/-- The bypass witness for a design with fewer partial rounds than its width: a nonzero
difference whose images under `candInternal ^ j`, for every `j` below the number of partial
rounds, are zero on every masked position. -/
def witnessBypass : Fin 16 → ZMod candModulus :=
  pfVec candModulus 16 [0, 1, 417877280, 1829699387, 1274231450, 1328915760, 1294559907, 717121070, 636971886, 184808428, 834656324, 457748790, 1318772040, 1251362827, 1338176732, 0]

#eval Audit.echoInput "witnessBypass" witnessBypass

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
    1717986917
    4 (by decide) (by decide) (by decide)

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
