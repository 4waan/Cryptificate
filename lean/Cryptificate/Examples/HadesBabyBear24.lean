import Cryptificate

/-!
# Example: Poseidon2 over BabyBear, width 24 (Plonky3)

The prime-field profile (`hades/prime/v1`) over BabyBear, `p = 15 · 2²⁷ + 1 = 2013265921`, with the
linear layers, round numbers and S-box of Plonky3's width-24 Poseidon2
(`examples/designs/babybear-t24.json`): the external matrix `circ(2 M₄, M₄, …, M₄)` with
`M₄ = [[2,3,1,1],[1,2,3,1],[1,1,2,3],[3,1,1,2]]` (`MDSMat4`, `poseidon2/src/external.rs`), the
internal matrix `1 · 1ᵀ + diag(V)` with
`V = [-2, 1, 2, 1/2, 3, 4, -1/2, -3, -4, 1/2⁸, 1/4, 1/8, 1/16, 1/2⁷, 1/2⁹, 1/2²⁷, -1/2⁸, -1/4, -1/8, -1/16, -1/32, -1/64, -1/2⁷, -1/2²⁷]`
(`baby-bear/src/poseidon2.rs`), `8` full and `21` partial rounds, and `x ↦ x ^ 7` on coordinate `0`
in the partial rounds, all as in the Plonky3 repository at commit
`0d803737b681774186cd283b1fd2d8e493655c82`. Round constants are not part of the design, and no claim
depends on them.

The certificate proves the modulus prime (`field_prime`) and then: the `24 × 24` external matrix is
not MDS: its submatrix on rows `0, 4` and columns `0, 1` is singular, so a nonzero input of weight
`2` has an image of weight `18`, `20` in total, below the `25` of an MDS matrix (`external_not_mds`,
counted on numerals); it is `circ(2 M₄, M₄, …, M₄)` for `M₄` above, and all `69` minors of `M₄` are
nonzero (`external_m4_mds`); it is invertible (`external_invertible`), and so is the internal matrix
(`internal_invertible`): the engine computes each inverse modulo `p`, and the kernel checks
`M · M⁻¹ = 1` with every row and column packed into one number in base `2 ^ 71`
(`Packed.checkInverse`); `x ↦ x ^ 7` is a bijection (`power_bijective`).

With `21` partial rounds and one S-box each, fewer than the width `24`, the `21` rows `e₀ Mʲ`,
`j < 21`, cannot span all `24` coordinates: the difference `witnessBypass` is orthogonal to all of
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
def candModulus : ℕ := 2013265921

#eval Audit.echoDecimal "candModulus" candModulus

/-- The candidate's external matrix over `ZMod candModulus`, row-major as submitted. HADES mixes
with it in every full round and, as Poseidon2 does, once before the first round. -/
def candExternal : Matrix (Fin 24) (Fin 24) (ZMod candModulus) :=
  pfMat candModulus 24 [4, 6, 2, 2, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 4, 6, 2, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 2, 2, 4, 6, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 6, 2, 2, 4, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 2, 3, 1, 1, 4, 6, 2, 2, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 1, 2, 3, 1, 2, 4, 6, 2, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 1, 2, 3, 2, 2, 4, 6, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 3, 1, 1, 2, 6, 2, 2, 4, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 2, 3, 1, 1, 2, 3, 1, 1, 4, 6, 2, 2, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 1, 2, 3, 1, 1, 2, 3, 1, 2, 4, 6, 2, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 1, 2, 3, 1, 1, 2, 3, 2, 2, 4, 6, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 3, 1, 1, 2, 3, 1, 1, 2, 6, 2, 2, 4, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 4, 6, 2, 2, 2, 3, 1, 1, 2, 3, 1, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 2, 4, 6, 2, 1, 2, 3, 1, 1, 2, 3, 1, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 2, 2, 4, 6, 1, 1, 2, 3, 1, 1, 2, 3, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 6, 2, 2, 4, 3, 1, 1, 2, 3, 1, 1, 2, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 4, 6, 2, 2, 2, 3, 1, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 2, 4, 6, 2, 1, 2, 3, 1, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 2, 2, 4, 6, 1, 1, 2, 3, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 6, 2, 2, 4, 3, 1, 1, 2, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 4, 6, 2, 2, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 2, 4, 6, 2, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 2, 2, 4, 6, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 6, 2, 2, 4]

#eval Audit.echoInput "candExternal" candExternal

/-- The candidate's internal matrix over `ZMod candModulus`, row-major as submitted. HADES mixes
with it in every partial round. -/
def candInternal : Matrix (Fin 24) (Fin 24) (ZMod candModulus) :=
  pfMat candModulus 24 [2013265920, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1006632962, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1006632961, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2013265919, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2013265918, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2005401602, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1509949442, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1761607682, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1887436802, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1997537282, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2009333762, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2013265907, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 7864321, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 503316481, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 251658241, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 125829121, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 62914561, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 31457281, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 15728641, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 16]

#eval Audit.echoInput "candInternal" candInternal

/-- The exponent `e` of the candidate's power S-box `x ↦ x ^ e`. -/
def candExponent : ℕ := 7

#eval Audit.echoInput "candExponent" candExponent

/-- The candidate's number of full rounds, half of them before the partial rounds and half
after. -/
def candFullRounds : ℕ := 8

#eval Audit.echoInput "candFullRounds" candFullRounds

/-- The candidate's number of partial rounds. -/
def candPartialRounds : ℕ := 21

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
  [1006632959, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]

/-- The same witness as a state over `ZMod candModulus`. -/
def witnessVector : Fin 24 → ZMod candModulus :=
  pfVec candModulus 24 witnessVectorEntries

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
  [846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 961437195, 501262127, 1421612263, 731349661, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 501262127, 1421612263, 731349661, 961437195, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 1421612263, 731349661, 961437195, 501262127, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 731349661, 961437195, 501262127, 1421612263, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 961437195, 501262127, 1421612263, 731349661, 846393428, 1594177913, 98608943, 213652710, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 501262127, 1421612263, 731349661, 961437195, 1594177913, 98608943, 213652710, 846393428, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 1421612263, 731349661, 961437195, 501262127, 98608943, 213652710, 846393428, 1594177913, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 731349661, 961437195, 501262127, 1421612263, 213652710, 846393428, 1594177913, 98608943, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 961437195, 501262127, 1421612263, 731349661, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 501262127, 1421612263, 731349661, 961437195, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 1421612263, 731349661, 961437195, 501262127, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 731349661, 961437195, 501262127, 1421612263, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 961437195, 501262127, 1421612263, 731349661, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 501262127, 1421612263, 731349661, 961437195, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 1421612263, 731349661, 961437195, 501262127, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 731349661, 961437195, 501262127, 1421612263, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 846393428, 1594177913, 98608943, 213652710, 961437195, 501262127, 1421612263, 731349661, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 1594177913, 98608943, 213652710, 846393428, 501262127, 1421612263, 731349661, 961437195, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 98608943, 213652710, 846393428, 1594177913, 1421612263, 731349661, 961437195, 501262127, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 213652710, 846393428, 1594177913, 98608943, 731349661, 961437195, 501262127, 1421612263, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 961437195, 501262127, 1421612263, 731349661, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 501262127, 1421612263, 731349661, 961437195, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1421612263, 731349661, 961437195, 501262127, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 731349661, 961437195, 501262127, 1421612263, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943, 213652710, 846393428, 1594177913, 98608943]

/-- An inverse witness for `candInternal`, computed by the engine and checked below: the
inverse matrix over `ZMod candModulus`, listed column by column, each column from its last entry
to its first (`Packed.revCols`), so that one multiplication of packed numbers gives one entry of
`candInternal * witnessInternalInverse`. -/
def witnessInternalInverse : List ℕ :=
  [1088351649, 134859918, 67429959, 1040347940, 520173970, 260086985, 1136676453, 269719836, 924914272, 1473826249, 1878406003, 1493091951, 1753178936, 876589468, 1743546085, 1455162599, 598039518, 1574971187, 558103322, 1415226403, 438294734, 1116206644, 219147367, 1903692237, 1849828544, 1743546085, 1878406003, 1945835962, 972917981, 1493091951, 1753178936, 1473826249, 163437377, 1078879344, 269719836, 1040347940, 520173970, 260086985, 539439672, 1116206644, 817186885, 876589468, 897059277, 1196079036, 1136676453, 1794118554, 1574971188, 219147367, 924914272, 1878406003, 1945835962, 972917981, 1493091951, 1753178936, 876589468, 1743546085, 1088351649, 539439672, 134859918, 520173970, 260086985, 1136676453, 269719836, 558103322, 1415226403, 438294734, 1455162599, 598039518, 1574971187, 1903692238, 1794118554, 1116206644, 1686391167, 1473826249, 1743546085, 1878406003, 1945835962, 972917981, 1493091951, 934386577, 326874754, 144492767, 539439672, 67429959, 1040347940, 520173970, 1078879344, 219147367, 1634373770, 1753178936, 1794118554, 378892151, 260086987, 1574971187, 1136676453, 438294734, 1287698155, 1923359309, 1968312615, 1990789268, 995394634, 497697317, 1255481619, 1833452697, 725567766, 359626448, 89906612, 1017871287, 1515568604, 757784302, 179813224, 1714246162, 1614572909, 1634373770, 299019759, 1740870293, 378892151, 598039518, 1196079036, 1415226403, 462457136, 1945835962, 972917981, 1493091951, 1753178936, 876589468, 438294734, 1878406003, 1550808785, 269719836, 67429959, 260086985, 1136676453, 1574971187, 134859918, 279051661, 1714246162, 219147367, 1230897780, 299019759, 1794118554, 1455162599, 897059277, 558103322, 326874754, 539439672, 269719836, 134859918, 67429959, 1040347940, 520173970, 1078879344, 1686391167, 1868773154, 1473826249, 1945835962, 972917981, 1493091951, 934386577, 1794118554, 378892151, 260086983, 219147367, 1634373770, 1753178936, 438294734, 876589468, 1574971187, 725567766, 89906612, 44953306, 22476653, 1017871287, 1515568604, 757784302, 179813224, 1287698155, 1653639473, 1923359309, 995394634, 497697317, 1255481619, 1833452697, 299019759, 1069781652, 378892151, 1714246162, 1614572909, 1634373770, 1415226403, 817186885, 598039518, 1550808785, 67429959, 1040347940, 520173970, 260086985, 1136676453, 1574971187, 134859918, 462457136, 1743546085, 1945835962, 1753178936, 876589468, 438294734, 1878406003, 224264819, 299019759, 1794118554, 279051661, 1714246162, 219147367, 558103322, 1116206644, 1455162599, 438615829, 1416029219, 1714647570, 857323785, 1435294853, 1724280387, 1868773154, 818792517, 1574650092, 375680887, 597236702, 577971068, 288985534, 144492767, 1194473660, 1878406003, 1833452697, 934386577, 134859918, 179813224, 1078879344, 269719836, 539439672, 1743546085, 1359516413, 934386577, 1473826249, 1743546085, 1878406003, 1945835962, 972917981, 1868773154, 653749508, 288985534, 1078879344, 134859918, 67429959, 1040347944, 144492767, 438294734, 1255481619, 1493091951, 1574971187, 757784302, 520173970, 1136676453, 260086985, 876589468, 705766905, 1868773154, 934386577, 1473826249, 1743546085, 1878406003, 1945835962, 1724280387, 1307499016, 577971068, 144492767, 269719836, 134859926, 67429959, 288985534, 876589468, 497697317, 972917981, 1136676453, 1515568604, 1040347940, 260086985, 520173970, 1753178936, 1411533810, 1724280387, 1868773154, 934386577, 1473826249, 1743546085, 1878406003, 1435294853, 601732111, 1155942136, 288985534, 539439688, 269719836, 134859918, 577971068, 1753178936, 995394634, 1945835962, 260086985, 1017871287, 67429959, 520173970, 1040347940, 1493091951, 1225940875, 1714647570, 857323785, 1435294853, 1724280387, 1868773154, 934386577, 1416029219, 787325046, 1194473404, 298618479, 288985534, 144492767, 1078879344, 597236702, 1945835962, 1923359309, 1473826249, 67429959, 89906612, 539439672, 134859918, 269719836, 1878406003, 877231658, 818792517, 1416029219, 1714647570, 857323785, 1435294853, 1724280387, 1637585034, 1136034263, 751362286, 1194473404, 1155942136, 577971068, 288985534, 375680887, 1743546085, 1653639473, 1868773154, 269719836, 359626448, 144492767, 539439672, 1078879344, 1473826249, 1755726290, 1225940875, 1619603398, 809801699, 1411533810, 705766905, 1359516413, 438615829, 391757359, 1136034263, 787325046, 601732111, 1307499016, 653749508, 1574650092, 462457136, 1287698155, 1686391167, 1550808785, 725567766, 326874754, 1088351649, 163437377, 924914272, 1574650092, 597236702, 298618351, 1155942136, 577971068, 288985534, 144492767, 1194473148, 438615829, 1637585034, 1416029219, 1435294853, 1724280387, 1868773154, 818792517, 134859918, 179813224, 1078879344, 1878406003, 1833452697, 934386577, 1743546085, 1473826249, 269719836, 653749508, 1078879344, 539439672, 269719836, 134859918, 67429959, 1040347936, 144492767, 1359516413, 1724280387, 934386577, 1878406003, 1945835962, 972917981, 1868773154, 1574971187, 757784302, 520173970, 438294734, 1255481619, 1493091951, 876589468, 1753178936, 1136676453, 1307499016, 144492767, 1078879344, 539439672, 269719836, 134859910, 67429959, 288985534, 705766905, 1435294853, 1868773154, 1743546085, 1878406003, 1945835962, 1724280387, 1136676453, 1515568604, 1040347940, 876589468, 497697317, 972917981, 1753178936, 1493091951, 260086985, 601732111, 288985534, 144492767, 1078879344, 539439656, 269719836, 134859918, 577971068, 1411533810, 857323785, 1724280387, 1473826249, 1743546085, 1878406003, 1435294853, 260086985, 1017871287, 67429959, 1753178936, 995394634, 1945835962, 1493091951, 972917981, 520173970, 1203464222, 577971068, 288985534, 144492735, 1078879344, 539439672, 269719836, 1155942136, 809801699, 1714647570, 1435294853, 934386577, 1473826249, 1743546085, 857323785, 520173970, 22476653, 134859918, 1493091951, 1990789268, 1878406003, 972917981, 1945835962, 1040347940, 393662523, 1155942136, 577971004, 288985534, 144492767, 1078879344, 539439672, 298618351, 1619603398, 1416029219, 857323785, 1868773154, 934386577, 1473826249, 1714647570, 1040347940, 44953306, 269719836, 972917981, 1968312615, 1743546085, 1945835962, 1878406003, 67429959, 787325046, 298618223, 1155942136, 577971068, 288985534, 144492767, 1078879344, 597236702, 1225940875, 818792517, 1714647570, 1724280387, 1868773154, 934386577, 1416029219, 67429959, 89906612, 539439672, 1945835962, 1923359309, 1473826249, 1878406003, 1743546085, 134859918, 123321903, 787325046, 393662523, 1203464222, 601732111, 1307499016, 653749508, 1574650092, 1755726290, 877231658, 1225940875, 1411533810, 705766905, 1359516413, 438615829, 1550808785, 725567766, 326874754, 462457136, 1287698155, 1686391167, 924914272, 1849828544, 1088351649]

/-- The bypass witness for a design with fewer partial rounds than its width: a nonzero
difference whose images under `candInternal ^ j`, for every `j` below the number of partial
rounds, are zero on every masked position. -/
def witnessBypass : Fin 24 → ZMod candModulus :=
  pfVec candModulus 24 [0, 1, 774442156, 1284622213, 927922950, 939635425, 1328503668, 977692171, 1656230510, 1598851945, 587916668, 586240422, 751529569, 383233899, 609167427, 1788549732, 1666294131, 135202198, 177630312, 981377179, 1736644555, 1240972079, 0, 0]

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
`24 × 24` external matrix is MDS, and for a width above `4` it is not. -/
theorem external_m4_mds :
    candExternal = Hades.poseidon2External 24 externalM4 ∧ IsMDS externalM4 :=
  ⟨Hades.pfMat_eq_poseidon2External_of_checkP (S := 71) (by decide +kernel),
    isMDS_of_minors4Ok externalM4 (by decide)⟩

/-- Claim `external.invertible`: the determinant of `candExternal` over `ZMod candModulus` is
nonzero. The certificate is the inverse matrix `witnessExternalInverse`, checked as for
`internal_invertible` (`Packed.det_ne_zero_of_checkInverse`). This is invertibility only: it
does not say that the external matrix is MDS. -/
theorem external_invertible : candExternal.det ≠ 0 :=
  Packed.det_ne_zero_of_checkInverse (S := 71) (Wr := witnessExternalInverse)
    (by decide +kernel)

/-- Claim `internal.invertible`: the determinant of `candInternal` over `ZMod candModulus` is
nonzero. The certificate is the inverse matrix `witnessInternalInverse`: the kernel checks
`candInternal * witnessInternalInverse = 1` entry by entry (`Packed.checkInverse`), each entry one
product of packed numbers in base `2 ^ 71`, and a matrix with a right inverse has a
nonzero determinant (`Packed.det_ne_zero_of_checkInverse`). -/
theorem internal_invertible : candInternal.det ≠ 0 :=
  Packed.det_ne_zero_of_checkInverse (S := 71) (Wr := witnessInternalInverse)
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
      (Hades.powers_zero_of_checkOrthP (S := 71) (by decide +kernel))⟩

end CryptificateJob
#cryptificate_audit CryptificateJob.field_prime
#cryptificate_audit CryptificateJob.external_not_mds
#cryptificate_audit CryptificateJob.external_m4_mds
#cryptificate_audit CryptificateJob.external_invertible
#cryptificate_audit CryptificateJob.internal_invertible
#cryptificate_audit CryptificateJob.power_bijective
#cryptificate_audit CryptificateJob.partial_bypass_short
