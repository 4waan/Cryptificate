import Cryptificate

/-!
# Example: Poseidon2 over Mersenne31, width 24 (Plonky3)

The prime-field profile (`hades/prime/v1`) over Mersenne31, `p = 2³¹ - 1 = 2147483647`, with the
linear layers, round numbers and S-box of Plonky3's width-24 Poseidon2
(`examples/designs/mersenne31-t24.json`): the external matrix `circ(2 M₄, M₄, …, M₄)` with
`M₄ = [[2,3,1,1],[1,2,3,1],[1,1,2,3],[3,1,1,2]]` (`MDSMat4`, `poseidon2/src/external.rs`), the
internal matrix `1 · 1ᵀ + diag(V)` with `V = [-2, 2⁰, 2¹, 2², …, 2²²]`
(`mersenne-31/src/poseidon2.rs`), `8` full and `22` partial rounds, and `x ↦ x ^ 5` on coordinate
`0` in the partial rounds, all as in the Plonky3 repository at commit
`0d803737b681774186cd283b1fd2d8e493655c82`. Round constants are not part of the design, and no claim
depends on them.

The certificate proves the modulus prime (`field_prime`) and then: the `24 × 24` external matrix is
not MDS: its submatrix on rows `0, 4` and columns `0, 1` is singular, so a nonzero input of weight
`2` has an image of weight `18`, `20` in total, below the `25` of an MDS matrix (`external_not_mds`,
counted on numerals); it is `circ(2 M₄, M₄, …, M₄)` for `M₄` above, and all `69` minors of `M₄` are
nonzero (`external_m4_mds`); it is invertible (`external_invertible`), and so is the internal matrix
(`internal_invertible`): the engine computes each inverse modulo `p`, and the kernel checks
`M · M⁻¹ = 1` with every row and column packed into one number in base `2 ^ 72`
(`Packed.checkInverse`); `x ↦ x ^ 5` is a bijection (`power_bijective`).

With `22` partial rounds and one S-box each, fewer than the width `24`, the `22` rows `e₀ Mʲ`,
`j < 22`, cannot span all `24` coordinates: the difference `witnessBypass` is orthogonal to all of
them modulo `p`, so it stays at zero on coordinate `0` through every partial round and passes them
with no active S-box (`partial_bypass_short`). The engine finds no invariant subspace here (the rows
`e₀ Mʲ`, `j < 24`, have full rank), so `24` or more partial rounds would charge every window of
`24`; that is not part of this certificate. The statement concerns differences through the partial
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
def candExternal : Matrix (Fin 24) (Fin 24) (ZMod candModulus) :=
  pfMat candModulus 24 [4, 6, 2, 2, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 4, 6, 2, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 2, 2, 4, 6, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 6, 2, 2, 4, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 2, 3, 1, 1, 4, 6, 2, 2, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 1, 2, 3, 1, 2, 4, 6, 2, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 1, 2, 3, 2, 2, 4, 6, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 3, 1, 1, 2, 6, 2, 2, 4, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 2, 3, 1, 1, 2, 3, 1, 1, 4, 6, 2, 2, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 1, 2, 3, 1, 1, 2, 3, 1, 2, 4, 6, 2, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 1, 2, 3, 1, 1, 2, 3, 2, 2, 4, 6, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 3, 1, 1, 2, 3, 1, 1, 2, 6, 2, 2, 4, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 4, 6, 2, 2, 2, 3, 1, 1, 2, 3, 1, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 2, 4, 6, 2, 1, 2, 3, 1, 1, 2, 3, 1, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 2, 2, 4, 6, 1, 1, 2, 3, 1, 1, 2, 3, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 6, 2, 2, 4, 3, 1, 1, 2, 3, 1, 1, 2, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 4, 6, 2, 2, 2, 3, 1, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 2, 4, 6, 2, 1, 2, 3, 1, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 2, 2, 4, 6, 1, 1, 2, 3, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 6, 2, 2, 4, 3, 1, 1, 2, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 4, 6, 2, 2, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 2, 4, 6, 2, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 2, 2, 4, 6, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 6, 2, 2, 4]

#eval Audit.echoInput "candExternal" candExternal

/-- The candidate's internal matrix over `ZMod candModulus`, row-major as submitted. HADES mixes
with it in every partial round. -/
def candInternal : Matrix (Fin 24) (Fin 24) (ZMod candModulus) :=
  pfMat candModulus 24 [2147483646, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 9, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 17, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 33, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 65, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 129, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 257, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 513, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1025, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2049, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4097, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 8193, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 16385, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 32769, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 65537, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 131073, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 262145, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 524289, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1048577, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2097153, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4194305]

#eval Audit.echoInput "candInternal" candInternal

/-- The exponent `e` of the candidate's power S-box `x ↦ x ^ e`. -/
def candExponent : ℕ := 5

#eval Audit.echoInput "candExponent" candExponent

/-- The candidate's number of full rounds, half of them before the partial rounds and half
after. -/
def candFullRounds : ℕ := 8

#eval Audit.echoInput "candFullRounds" candFullRounds

/-- The candidate's number of partial rounds. -/
def candPartialRounds : ℕ := 22

#eval Audit.echoInput "candPartialRounds" candPartialRounds

/-- The candidate's partial-round mask: `true` at the positions where a partial round applies
the S-box, as submitted. -/
def candPartialMask : Fin 24 → Bool :=
  maskBits 24 [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]

#eval Audit.echoInput "candPartialMask" candPartialMask

/-- The positions where `candPartialMask` is `true`: the S-box positions of a partial round. -/
def candMask : Finset (Fin 24) :=
  Finset.univ.filter fun i => candPartialMask i = true

/-- The branch-number witness for the external matrix, as numerals: a nonzero state that,
together with its image under `candExternal`, has at most as many nonzero coordinates as the
width. -/
def witnessVectorEntries : List ℕ :=
  [1073741822, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]

/-- The same witness as a state over `ZMod candModulus`. -/
def witnessVector : Fin 24 → ZMod candModulus :=
  pfVec candModulus 24 witnessVectorEntries

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
  [210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 885289177, 333079096, 1437499258, 1682925960, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 333079096, 1437499258, 1682925960, 885289177, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1437499258, 1682925960, 885289177, 333079096, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1682925960, 885289177, 333079096, 1437499258, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 885289177, 333079096, 1437499258, 1682925960, 210365745, 1376142582, 1192072555, 1866995987, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 333079096, 1437499258, 1682925960, 885289177, 1376142582, 1192072555, 1866995987, 210365745, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1437499258, 1682925960, 885289177, 333079096, 1192072555, 1866995987, 210365745, 1376142582, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1682925960, 885289177, 333079096, 1437499258, 1866995987, 210365745, 1376142582, 1192072555, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 885289177, 333079096, 1437499258, 1682925960, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 333079096, 1437499258, 1682925960, 885289177, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1437499258, 1682925960, 885289177, 333079096, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1682925960, 885289177, 333079096, 1437499258, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 885289177, 333079096, 1437499258, 1682925960, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 333079096, 1437499258, 1682925960, 885289177, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1437499258, 1682925960, 885289177, 333079096, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1682925960, 885289177, 333079096, 1437499258, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 210365745, 1376142582, 1192072555, 1866995987, 885289177, 333079096, 1437499258, 1682925960, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 1376142582, 1192072555, 1866995987, 210365745, 333079096, 1437499258, 1682925960, 885289177, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1192072555, 1866995987, 210365745, 1376142582, 1437499258, 1682925960, 885289177, 333079096, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1866995987, 210365745, 1376142582, 1192072555, 1682925960, 885289177, 333079096, 1437499258, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 885289177, 333079096, 1437499258, 1682925960, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 333079096, 1437499258, 1682925960, 885289177, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1437499258, 1682925960, 885289177, 333079096, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1682925960, 885289177, 333079096, 1437499258, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555, 1866995987, 210365745, 1376142582, 1192072555]

/-- An inverse witness for `candInternal`, computed by the engine and checked below: the
inverse matrix over `ZMod candModulus`, listed column by column, each column from its last entry
to its first (`Packed.revCols`), so that one multiplication of packed numbers gives one entry of
`candInternal * witnessInternalInverse`. -/
def witnessInternalInverse : List ℕ :=
  [746034554, 1492069108, 836654569, 1673309138, 1199134629, 250785611, 501571222, 1003142444, 2006284888, 1865086129, 1582688611, 1017893575, 2035787150, 1924090653, 1700697659, 1253911671, 360339695, 720679390, 1441358780, 735233913, 1470467826, 793452005, 1586904010, 280289818, 655414539, 1310829078, 474174509, 948349018, 1896698036, 1645912425, 1144341203, 141198759, 282397518, 564795036, 1129590072, 111696497, 223392994, 446785988, 893571976, 1787143952, 1426804257, 706124867, 1412249734, 677015821, 1354031642, 560579637, 1121159275, 1586904010, 1401449093, 655414539, 1310829078, 474174509, 948349018, 1896698036, 1645912425, 1144341203, 141198759, 282397518, 564795036, 1129590072, 111696497, 223392994, 446785988, 893571976, 1787143952, 1426804257, 706124867, 1412249734, 677015821, 280289819, 560579637, 793452005, 1774466370, 1401449093, 655414539, 1310829078, 474174509, 948349018, 1896698036, 1645912425, 1144341203, 141198759, 282397518, 564795036, 1129590072, 111696497, 223392994, 446785988, 893571976, 1787143952, 1426804257, 706124867, 1949120646, 677015821, 1354031642, 1470467826, 887233185, 1774466370, 1401449093, 655414539, 1310829078, 474174509, 948349018, 1896698036, 1645912425, 1144341203, 141198759, 282397518, 564795036, 1129590072, 111696497, 223392994, 446785988, 893571976, 1787143952, 1695239713, 706124867, 1412249734, 677015821, 735233913, 1517358416, 887233185, 1774466370, 1401449093, 655414539, 1310829078, 474174509, 948349018, 1896698036, 1645912425, 1144341203, 141198759, 282397518, 564795036, 1129590072, 111696497, 223392994, 446785988, 1027789704, 1787143952, 1426804257, 706124867, 1412249734, 1441358780, 758679208, 1517358416, 887233185, 1774466370, 1401449093, 655414539, 1310829078, 474174509, 948349018, 1896698036, 1645912425, 1144341203, 141198759, 282397518, 564795036, 1129590072, 111696497, 290501858, 446785988, 893571976, 1787143952, 1426804257, 706124867, 720679390, 379339604, 758679208, 1517358416, 887233185, 1774466370, 1401449093, 655414539, 1310829078, 474174509, 948349018, 1896698036, 1645912425, 1144341203, 141198759, 282397518, 564795036, 1163144504, 111696497, 223392994, 446785988, 893571976, 1787143952, 1426804257, 360339695, 189669802, 379339604, 758679208, 1517358416, 887233185, 1774466370, 1401449093, 655414539, 1310829078, 474174509, 948349018, 1896698036, 1645912425, 1144341203, 141198759, 299174734, 564795036, 1129590072, 111696497, 223392994, 446785988, 893571976, 1787143952, 1253911671, 94834901, 189669802, 379339604, 758679208, 1517358416, 887233185, 1774466370, 1401449093, 655414539, 1310829078, 474174509, 948349018, 1896698036, 1645912425, 1152729811, 141198759, 282397518, 564795036, 1129590072, 111696497, 223392994, 446785988, 893571976, 1700697659, 1121159274, 94834901, 189669802, 379339604, 758679208, 1517358416, 887233185, 1774466370, 1401449093, 655414539, 1310829078, 474174509, 948349018, 1900892340, 1645912425, 1144341203, 141198759, 282397518, 564795036, 1129590072, 111696497, 223392994, 446785988, 1924090653, 560579637, 1121159274, 94834901, 189669802, 379339604, 758679208, 1517358416, 887233185, 1774466370, 1401449093, 655414539, 1310829078, 476271661, 948349018, 1896698036, 1645912425, 1144341203, 141198759, 282397518, 564795036, 1129590072, 111696497, 223392994, 2035787150, 1354031642, 560579637, 1121159274, 94834901, 189669802, 379339604, 758679208, 1517358416, 887233185, 1774466370, 1401449093, 656463115, 1310829078, 474174509, 948349018, 1896698036, 1645912425, 1144341203, 141198759, 282397518, 564795036, 1129590072, 111696497, 1017893575, 677015821, 1354031642, 560579637, 1121159274, 94834901, 189669802, 379339604, 758679208, 1517358416, 887233185, 1774990658, 1401449093, 655414539, 1310829078, 474174509, 948349018, 1896698036, 1645912425, 1144341203, 141198759, 282397518, 564795036, 1129590072, 1582688611, 1412249734, 677015821, 1354031642, 560579637, 1121159274, 94834901, 189669802, 379339604, 758679208, 1517620560, 887233185, 1774466370, 1401449093, 655414539, 1310829078, 474174509, 948349018, 1896698036, 1645912425, 1144341203, 141198759, 282397518, 564795036, 1865086129, 706124867, 1412249734, 677015821, 1354031642, 560579637, 1121159274, 94834901, 189669802, 379470676, 758679208, 1517358416, 887233185, 1774466370, 1401449093, 655414539, 1310829078, 474174509, 948349018, 1896698036, 1645912425, 1144341203, 141198759, 282397518, 2006284888, 1426804257, 706124867, 1412249734, 677015821, 1354031642, 560579637, 1121159274, 94900437, 189669802, 379339604, 758679208, 1517358416, 887233185, 1774466370, 1401449093, 655414539, 1310829078, 474174509, 948349018, 1896698036, 1645912425, 1144341203, 141198759, 1003142444, 1787143952, 1426804257, 706124867, 1412249734, 677015821, 1354031642, 560612405, 1121159274, 94834901, 189669802, 379339604, 758679208, 1517358416, 887233185, 1774466370, 1401449093, 655414539, 1310829078, 474174509, 948349018, 1896698036, 1645912425, 1144341203, 501571222, 893571976, 1787143952, 1426804257, 706124867, 1412249734, 677032205, 1354031642, 560579637, 1121159274, 94834901, 189669802, 379339604, 758679208, 1517358416, 887233185, 1774466370, 1401449093, 655414539, 1310829078, 474174509, 948349018, 1896698036, 1645912425, 250785611, 446785988, 893571976, 1787143952, 1426804257, 706133059, 1412249734, 677015821, 1354031642, 560579637, 1121159274, 94834901, 189669802, 379339604, 758679208, 1517358416, 887233185, 1774466370, 1401449093, 655414539, 1310829078, 474174509, 948349018, 1896698036, 1199134629, 223392994, 446785988, 893571976, 1787148048, 1426804257, 706124867, 1412249734, 677015821, 1354031642, 560579637, 1121159274, 94834901, 189669802, 379339604, 758679208, 1517358416, 887233185, 1774466370, 1401449093, 655414539, 1310829078, 474174509, 948349018, 1673309138, 111696497, 223392994, 446788036, 893571976, 1787143952, 1426804257, 706124867, 1412249734, 677015821, 1354031642, 560579637, 1121159274, 94834901, 189669802, 379339604, 758679208, 1517358416, 887233185, 1774466370, 1401449093, 655414539, 1310829078, 474174509, 836654569, 1129590072, 111697521, 223392994, 446785988, 893571976, 1787143952, 1426804257, 706124867, 1412249734, 677015821, 1354031642, 560579637, 1121159274, 94834901, 189669802, 379339604, 758679208, 1517358416, 887233185, 1774466370, 1401449093, 655414539, 1310829078, 1492069108, 564795548, 1129590072, 111696497, 223392994, 446785988, 893571976, 1787143952, 1426804257, 706124867, 1412249734, 677015821, 1354031642, 560579637, 1121159274, 94834901, 189669802, 379339604, 758679208, 1517358416, 887233185, 1774466370, 1401449093, 655414539, 746034554]

/-- The bypass witness for a design with fewer partial rounds than its width: a nonzero
difference whose images under `candInternal ^ j`, for every `j` below the number of partial
rounds, are zero on every masked position. -/
def witnessBypass : Fin 24 → ZMod candModulus :=
  pfVec candModulus 24 [0, 1, 2046, 2792108, 1119282713, 774096301, 904107460, 113443077, 1283591242, 85803919, 2135475014, 1340174324, 23857060, 24017266, 734465884, 1521712627, 1239939031, 445572366, 625438953, 690175183, 1700003754, 268435328, 2147483519, 0]

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
`24 × 24` external matrix is MDS, and for a width above `4` it is not. -/
theorem external_m4_mds :
    candExternal = Hades.poseidon2External 24 externalM4 ∧ IsMDS externalM4 :=
  ⟨Hades.pfMat_eq_poseidon2External_of_checkP (S := 72) (by decide +kernel),
    isMDS_of_minors4Ok externalM4 (by decide)⟩

/-- Claim `external.invertible`: the determinant of `candExternal` over `ZMod candModulus` is
nonzero. The certificate is the inverse matrix `witnessExternalInverse`, checked as for
`internal_invertible` (`Packed.det_ne_zero_of_checkInverse`). This is invertibility only: it
does not say that the external matrix is MDS. -/
theorem external_invertible : candExternal.det ≠ 0 :=
  Packed.det_ne_zero_of_checkInverse (S := 72) (Wr := witnessExternalInverse)
    (by decide +kernel)

/-- Claim `internal.invertible`: the determinant of `candInternal` over `ZMod candModulus` is
nonzero. The certificate is the inverse matrix `witnessInternalInverse`: the kernel checks
`candInternal * witnessInternalInverse = 1` entry by entry (`Packed.checkInverse`), each entry one
product of packed numbers in base `2 ^ 72`, and a matrix with a right inverse has a
nonzero determinant (`Packed.det_ne_zero_of_checkInverse`). -/
theorem internal_invertible : candInternal.det ≠ 0 :=
  Packed.det_ne_zero_of_checkInverse (S := 72) (Wr := witnessInternalInverse)
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
      ∃ v : Fin 24 → ZMod candModulus, v ≠ 0 ∧
        Hades.Design.Bypass
          { external := candExternal, internal := candInternal, exponent := candExponent,
            fullRounds := candFullRounds, partialRounds := candPartialRounds }
          candMask v :=
  ⟨by decide, witnessBypass, NatMatrix.pfVec_ne_zero_of_check (by decide +kernel),
    Hades.Design.bypass_of_powers
      { external := candExternal, internal := candInternal, exponent := candExponent,
            fullRounds := candFullRounds, partialRounds := candPartialRounds }
      candMask witnessBypass
      (Hades.powers_zero_of_checkOrthP (S := 72) (by decide +kernel))⟩

end CryptificateJob
#cryptificate_audit CryptificateJob.field_prime
#cryptificate_audit CryptificateJob.external_not_mds
#cryptificate_audit CryptificateJob.external_m4_mds
#cryptificate_audit CryptificateJob.external_invertible
#cryptificate_audit CryptificateJob.internal_invertible
#cryptificate_audit CryptificateJob.power_bijective
#cryptificate_audit CryptificateJob.partial_bypass_short
