import Cryptificate

/-!
# Example: Poseidon2 over KoalaBear, width 24 (Plonky3)

The prime-field profile (`hades/prime/v1`) over KoalaBear, `p = 127 · 2²⁴ + 1 = 2130706433`, with
the linear layers, round numbers and S-box of Plonky3's width-24 Poseidon2
(`examples/designs/koalabear-t24.json`): the external matrix `circ(2 M₄, M₄, …, M₄)` with
`M₄ = [[2,3,1,1],[1,2,3,1],[1,1,2,3],[3,1,1,2]]` (`MDSMat4`, `poseidon2/src/external.rs`), the
internal matrix `1 · 1ᵀ + diag(V)` with
`V = [-2, 1, 2, 1/2, 3, 4, -1/2, -3, -4, 1/2⁸, 1/4, 1/8, 1/16, 1/32, 1/64, 1/2²⁴, -1/2⁸, -1/8, -1/16, -1/32, -1/64, -1/2⁷, -1/2⁹, -1/2²⁴]`
(`koala-bear/src/poseidon2.rs`), `8` full and `23` partial rounds, and `x ↦ x ^ 3` on coordinate `0`
in the partial rounds, all as in the Plonky3 repository at commit
`0d803737b681774186cd283b1fd2d8e493655c82`. Round constants are not part of the design, and no claim
depends on them.

The certificate proves the modulus prime (`field_prime`) and then: the `24 × 24` external matrix is
not MDS: its submatrix on rows `0, 4` and columns `0, 1` is singular, so a nonzero input of weight
`2` has an image of weight `18`, `20` in total, below the `25` of an MDS matrix (`external_not_mds`,
counted on numerals); it is `circ(2 M₄, M₄, …, M₄)` for `M₄` above, and all `69` minors of `M₄` are
nonzero (`external_m4_mds`); it is invertible (`external_invertible`), and so is the internal matrix
(`internal_invertible`): the engine computes each inverse modulo `p`, and the kernel checks
`M · M⁻¹ = 1` with every row and column packed into one number in base `2 ^ 72`
(`Packed.checkInverse`); `x ↦ x ^ 3` is a bijection (`power_bijective`).

With `23` partial rounds and one S-box each, fewer than the width `24`, the `23` rows `e₀ Mʲ`,
`j < 23`, cannot span all `24` coordinates: the difference `witnessBypass` is orthogonal to all of
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
def candModulus : ℕ := 2130706433

#eval Audit.echoDecimal "candModulus" candModulus

/-- The candidate's external matrix over `ZMod candModulus`, row-major as submitted. HADES mixes
with it in every full round and, as Poseidon2 does, once before the first round. -/
def candExternal : Matrix (Fin 24) (Fin 24) (ZMod candModulus) :=
  pfMat candModulus 24 [4, 6, 2, 2, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 4, 6, 2, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 2, 2, 4, 6, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 6, 2, 2, 4, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 2, 3, 1, 1, 4, 6, 2, 2, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 1, 2, 3, 1, 2, 4, 6, 2, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 1, 2, 3, 2, 2, 4, 6, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 3, 1, 1, 2, 6, 2, 2, 4, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 2, 3, 1, 1, 2, 3, 1, 1, 4, 6, 2, 2, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 1, 2, 3, 1, 1, 2, 3, 1, 2, 4, 6, 2, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 1, 2, 3, 1, 1, 2, 3, 2, 2, 4, 6, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 3, 1, 1, 2, 3, 1, 1, 2, 6, 2, 2, 4, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 4, 6, 2, 2, 2, 3, 1, 1, 2, 3, 1, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 2, 4, 6, 2, 1, 2, 3, 1, 1, 2, 3, 1, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 2, 2, 4, 6, 1, 1, 2, 3, 1, 1, 2, 3, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 6, 2, 2, 4, 3, 1, 1, 2, 3, 1, 1, 2, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 4, 6, 2, 2, 2, 3, 1, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 2, 4, 6, 2, 1, 2, 3, 1, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 2, 2, 4, 6, 1, 1, 2, 3, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 6, 2, 2, 4, 3, 1, 1, 2, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 4, 6, 2, 2, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 2, 4, 6, 2, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 2, 2, 4, 6, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 6, 2, 2, 4]

#eval Audit.echoInput "candExternal" candExternal

/-- The candidate's internal matrix over `ZMod candModulus`, row-major as submitted. HADES mixes
with it in every partial round. -/
def candInternal : Matrix (Fin 24) (Fin 24) (ZMod candModulus) :=
  pfMat candModulus 24 [2130706432, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1065353218, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1065353217, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2130706431, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2130706430, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2122383362, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1598029826, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1864368130, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1997537282, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2064121858, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2097414146, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2130706307, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 8323073, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 266338305, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 133169153, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 66584577, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 33292289, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 16646145, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4161537, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 128]

#eval Audit.echoInput "candInternal" candInternal

/-- The exponent `e` of the candidate's power S-box `x ↦ x ^ e`. -/
def candExponent : ℕ := 3

#eval Audit.echoInput "candExponent" candExponent

/-- The candidate's number of full rounds, half of them before the partial rounds and half
after. -/
def candFullRounds : ℕ := 8

#eval Audit.echoInput "candFullRounds" candFullRounds

/-- The candidate's number of partial rounds. -/
def candPartialRounds : ℕ := 23

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
  [1065353215, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]

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
  [530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 1078398358, 1017521031, 1139275685, 2113312911, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 1017521031, 1139275685, 2113312911, 1078398358, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 1139275685, 2113312911, 1078398358, 1017521031, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 2113312911, 1078398358, 1017521031, 1139275685, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 1078398358, 1017521031, 1139275685, 2113312911, 530502418, 895766378, 165238458, 713134398, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 1017521031, 1139275685, 2113312911, 1078398358, 895766378, 165238458, 713134398, 530502418, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 1139275685, 2113312911, 1078398358, 1017521031, 165238458, 713134398, 530502418, 895766378, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 2113312911, 1078398358, 1017521031, 1139275685, 713134398, 530502418, 895766378, 165238458, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 1078398358, 1017521031, 1139275685, 2113312911, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 1017521031, 1139275685, 2113312911, 1078398358, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 1139275685, 2113312911, 1078398358, 1017521031, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 2113312911, 1078398358, 1017521031, 1139275685, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 1078398358, 1017521031, 1139275685, 2113312911, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 1017521031, 1139275685, 2113312911, 1078398358, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 1139275685, 2113312911, 1078398358, 1017521031, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 2113312911, 1078398358, 1017521031, 1139275685, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 530502418, 895766378, 165238458, 713134398, 1078398358, 1017521031, 1139275685, 2113312911, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 895766378, 165238458, 713134398, 530502418, 1017521031, 1139275685, 2113312911, 1078398358, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 165238458, 713134398, 530502418, 895766378, 1139275685, 2113312911, 1078398358, 1017521031, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 713134398, 530502418, 895766378, 165238458, 2113312911, 1078398358, 1017521031, 1139275685, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 1078398358, 1017521031, 1139275685, 2113312911, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 1017521031, 1139275685, 2113312911, 1078398358, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 1139275685, 2113312911, 1078398358, 1017521031, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 2113312911, 1078398358, 1017521031, 1139275685, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458, 713134398, 530502418, 895766378, 165238458]

/-- An inverse witness for `candInternal`, computed by the engine and checked below: the
inverse matrix over `ZMod candModulus`, listed column by column, each column from its last entry
to its first (`Packed.revCols`), so that one multiplication of packed numbers gives one entry of
`candInternal * witnessInternalInverse`. -/
def witnessInternalInverse : List ℕ :=
  [114278245, 1075435424, 268858856, 134429428, 67214714, 33607357, 1082156895, 537717712, 2016428188, 1996277005, 2063491719, 2097099076, 1048549538, 524274769, 1592988721, 100401979, 844104783, 803215832, 2030304454, 1286601650, 1327490601, 1929902475, 1729098517, 1266157174, 1902149943, 2110542018, 1592988721, 1861847577, 1996277005, 2063491719, 2097099076, 1055271009, 228556490, 268858856, 134429428, 67214714, 33607357, 1082156895, 1075435424, 1929902475, 442496867, 524274769, 200803958, 1688209566, 1606431664, 401607916, 803215833, 1729098517, 2016428188, 1055271009, 1861847577, 1996277005, 2063491719, 2097099076, 1048549538, 1592988721, 114278245, 134429428, 67214714, 33607357, 1082156895, 1606431664, 537717712, 2030304454, 1286601650, 1327490601, 100401979, 844104783, 803215832, 1266157175, 401607916, 1929902475, 1673593453, 2090377603, 1055271009, 1592988721, 1861847577, 1996277005, 2063491719, 2110542018, 457112980, 537717712, 268858856, 134429428, 67214714, 33607357, 20164415, 1729098517, 884993734, 1048549538, 401607916, 1245712699, 1082156897, 803215832, 1606431664, 1327490601, 634049981, 703514006, 1241231718, 620615859, 1375661146, 687830573, 1409268503, 351757003, 1496656452, 1510090574, 755045287, 1442875860, 721437930, 360718965, 1778949430, 643300825, 1567969911, 884993734, 1487405608, 1272972000, 1245712699, 844104783, 1688209566, 1286601650, 1008214094, 1592988721, 1996277005, 2063491719, 2097099076, 1048549538, 524274769, 1861847577, 1122492339, 67214714, 33607357, 1082156895, 1606431664, 803215832, 268858856, 1015152227, 643300825, 1729098517, 582877598, 1487405608, 401607916, 100401979, 200803958, 2030304454, 457112980, 40328830, 1075435424, 537717712, 268858856, 134429428, 67214714, 20164415, 1673593453, 1592988721, 1861847577, 1996277005, 2063491719, 2097099076, 2110542018, 401607916, 1245712699, 1082156893, 1729098517, 884993734, 1048549538, 1327490601, 524274769, 803215832, 1496656452, 1427192427, 889474715, 1510090574, 755045287, 1442875860, 721437930, 1778949430, 634049981, 620615859, 1375661146, 687830573, 1409268503, 1769987468, 351757003, 1487405608, 1983207477, 1245712699, 643300825, 1567969911, 884993734, 1286601650, 442496867, 844104783, 1122492339, 537717712, 134429428, 67214714, 33607357, 1082156895, 1606431664, 268858856, 1008214094, 2063491719, 2097099076, 1048549538, 524274769, 1327490601, 1861847577, 1648230814, 1487405608, 401607916, 1015152227, 643300825, 1729098517, 2030304454, 1929902475, 100401979, 1149318684, 1230029059, 840183873, 1485445153, 1808075793, 1969391113, 2050048773, 1680367746, 981387749, 645261280, 322630640, 161315320, 80657660, 40328830, 450338943, 1861847577, 351757003, 2110542018, 268858856, 1778949430, 20164415, 537717712, 1075435424, 1592988721, 1216480473, 2050048773, 2110542018, 1055271009, 1592988721, 1861847577, 1996277005, 2090377603, 914225960, 1075435424, 537717712, 268858856, 134429428, 67214718, 40328830, 1327490601, 1769987468, 2097099076, 803215832, 360718965, 33607357, 1606431664, 1082156895, 524274769, 302254513, 1969391113, 2090377603, 2110542018, 1055271009, 1592988721, 1861847577, 2050048773, 1828451920, 20164415, 1075435424, 537717712, 268858864, 134429428, 80657660, 524274769, 1409268503, 2063491719, 1606431664, 721437930, 67214714, 1082156895, 33607357, 1048549538, 604509026, 1808075793, 2050048773, 2090377603, 2110542018, 1055271009, 1592988721, 1969391113, 1526197407, 40328830, 20164415, 1075435440, 537717712, 268858856, 161315320, 1048549538, 687830573, 1996277005, 1082156895, 1442875860, 134429428, 33607357, 67214714, 2097099076, 1209018052, 1485445153, 1969391113, 2050048773, 2090377603, 2110542018, 1055271009, 1808075793, 921688381, 80657660, 40328862, 20164415, 1075435424, 537717712, 322630640, 2097099076, 1375661146, 1861847577, 33607357, 755045287, 268858856, 67214714, 134429428, 2063491719, 287329671, 840183873, 1808075793, 1969391113, 2050048773, 2090377603, 2110542018, 1485445153, 1843376762, 161315384, 80657660, 40328830, 20164415, 1075435424, 645261280, 2063491719, 620615859, 1592988721, 67214714, 1510090574, 537717712, 134429428, 268858856, 1996277005, 1276868074, 167930935, 574659342, 287329671, 1209018052, 604509026, 302254513, 1149318684, 870615575, 1843376762, 921688381, 1526197407, 1828451920, 914225960, 981387749, 1008214094, 634049981, 1673593453, 1122492339, 1496656452, 457112980, 114278245, 228556490, 2016428188, 981387749, 900677374, 1290522560, 645261280, 322630640, 161315320, 80657660, 450338431, 1149318684, 1485445153, 1808075793, 1969391113, 2050048773, 2090377603, 1680367746, 268858856, 1778949430, 20164415, 1861847577, 351757003, 2110542018, 1592988721, 1055271009, 537717712, 1828451920, 161315320, 40328830, 20164415, 1075435424, 537717712, 268858848, 80657660, 302254513, 2110542018, 1055271009, 1592988721, 1861847577, 1996277005, 2050048773, 1606431664, 721437930, 67214714, 524274769, 1409268503, 2063491719, 1048549538, 2097099076, 1082156895, 1526197407, 322630640, 80657660, 40328830, 20164415, 1075435408, 537717712, 161315320, 604509026, 2090377603, 2110542018, 1055271009, 1592988721, 1861847577, 1969391113, 1082156895, 1442875860, 134429428, 1048549538, 687830573, 1996277005, 2097099076, 2063491719, 33607357, 921688381, 645261280, 161315320, 80657660, 40328798, 20164415, 1075435424, 322630640, 1209018052, 2050048773, 2090377603, 2110542018, 1055271009, 1592988721, 1808075793, 33607357, 755045287, 268858856, 2097099076, 1375661146, 1861847577, 2063491719, 1996277005, 67214714, 1843376762, 1290522560, 322630640, 161315256, 80657660, 40328830, 20164415, 645261280, 287329671, 1969391113, 2050048773, 2090377603, 2110542018, 1055271009, 1485445153, 67214714, 1510090574, 537717712, 2063491719, 620615859, 1592988721, 1996277005, 1861847577, 134429428, 1556047091, 450338687, 645261152, 322630640, 161315320, 80657660, 40328830, 1290522560, 574659342, 1808075793, 1969391113, 2050048773, 2090377603, 2110542018, 840183873, 134429428, 889474715, 1075435424, 1996277005, 1241231718, 1055271009, 1861847577, 1592988721, 268858856, 1962775498, 1801354236, 450338687, 1290522560, 645261280, 322630640, 161315320, 900677374, 167930935, 840183873, 1485445153, 1808075793, 1969391113, 2050048773, 1230029059, 537717712, 1427192427, 40328830, 1592988721, 703514006, 2090377603, 1055271009, 2110542018, 1075435424, 837061143, 1962775498, 1556047091, 1843376762, 921688381, 1526197407, 1828451920, 981387749, 1276868074, 287329671, 1209018052, 604509026, 302254513, 1216480473, 1149318684, 1122492339, 1496656452, 457112980, 1008214094, 634049981, 1673593453, 2016428188, 1902149943, 114278245]

/-- The bypass witness for a design with fewer partial rounds than its width: a nonzero
difference whose images under `candInternal ^ j`, for every `j` below the number of partial
rounds, are zero on every masked position. -/
def witnessBypass : Fin 24 → ZMod candModulus :=
  pfVec candModulus 24 [0, 1, 494456127, 1280945720, 805645238, 848783294, 195344790, 1058332191, 236497923, 1673456419, 713223759, 1408515767, 1697659040, 797254573, 931688532, 2077482078, 1413189177, 1745174617, 1351164020, 434938864, 1472747909, 1870516605, 1773980588, 1287479964]

#eval Audit.echoInput "witnessBypass" witnessBypass

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
    1420470955
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
