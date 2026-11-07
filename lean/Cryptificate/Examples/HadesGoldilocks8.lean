import Cryptificate

/-!
# Example: Poseidon2 over Goldilocks, width 8 (Plonky3)

The prime-field profile (`hades/prime/v1`) over Goldilocks,
`p = 2⁶⁴ - 2³² + 1 = 18446744069414584321`, with the linear layers, round numbers and S-box of
Plonky3's width-8 Poseidon2 (`examples/designs/goldilocks-t8.json`): the external matrix
`circ(2 M₄, M₄)` with `M₄ = [[2,3,1,1],[1,2,3,1],[1,1,2,3],[3,1,1,2]]` (`MDSMat4`,
`poseidon2/src/external.rs`), the internal matrix `1 · 1ᵀ + diag(V)` with
`V = [-2, 1, 2, 1/2, 3, -1/2, -3, -4]` (`goldilocks/src/poseidon2.rs`), `8` full and `22` partial
rounds, and `x ↦ x ^ 7` on coordinate `0` in the partial rounds, all as in the Plonky3 repository at
commit `0d803737b681774186cd283b1fd2d8e493655c82`. Round constants are not part of the design, and
no claim depends on them.

The certificate proves the modulus prime (`field_prime`) and then: the `8 × 8` external matrix is
not MDS: its submatrix on rows `0, 4` and columns `0, 1` is singular, so a nonzero input of weight
`2` has an image of weight `6`, `8` in total, below the `9` of an MDS matrix (`external_not_mds`,
counted on numerals); it is `circ(2 M₄, M₄, …, M₄)` for `M₄` above, and all `69` minors of `M₄` are
nonzero (`external_m4_mds`); it is invertible (`external_invertible`), and so is the internal matrix
(`internal_invertible`): the engine computes each inverse modulo `p`, and the kernel checks
`M · M⁻¹ = 1` with every row and column packed into one number in base `2 ^ 134`
(`Packed.checkInverse`); `x ↦ x ^ 7` is a bijection (`power_bijective`).

The rows `e₀ Mʲ`, `j < 8`, of the powers of the internal matrix have an inverse modulo `p`
(`witnessObsInverse`, checked as above after packed vector-matrix products), so for any round
constants and any two distinct states entering them, every `8` consecutive partial rounds feed
different inputs to some S-box, and there are at least `8` of the `22` partial rounds
(`partial_active`, window length `L = 8`).

Not established, and not in the certificate: `activity.outer` and `activity.total`. Their bound
needs an MDS external matrix, and no theorem here bounds the activity of full rounds whose external
matrix is `circ(2 M₄, M₄, …, M₄)`. These claims are lower bounds on active S-boxes in any case, not
security levels.

Instantiated by the engine (`emit-lean`) from the fragments `header`, `const_modulus_prime`,
`const_external_prime`, `const_internal_prime`, `const_exponent`, `const_rounds_hades`,
`const_mask_prime`, `const_witness_external_list_prime`, `const_external_m4_prime`,
`const_witness_external_inverse_prime`, `const_witness_internal_inverse_prime`,
`const_witness_observability_prime`, `field_prime`, `external_not_mds_prime_list`,
`external_m4_mds_prime`, `external_invertible_prime`, `internal_invertible_prime_packed`,
`power_bijective_prime`, `partial_active_prime_packed` and `footer`.
-/

set_option autoImplicit false
set_option maxRecDepth 16000
set_option maxHeartbeats 2000000

namespace CryptificateJob

open Cryptificate

/-- The candidate's prime modulus `p`, as submitted (or as named by the field preset). Every
matrix, vector and witness below is an element of `ZMod candModulus`, and every claim is about
that ring; claim `field.prime` proves it is a field. -/
def candModulus : ℕ := 18446744069414584321

#eval Audit.echoDecimal "candModulus" candModulus

/-- The candidate's external matrix over `ZMod candModulus`, row-major as submitted. HADES mixes
with it in every full round and, as Poseidon2 does, once before the first round. -/
def candExternal : Matrix (Fin 8) (Fin 8) (ZMod candModulus) :=
  pfMat candModulus 8 [4, 6, 2, 2, 2, 3, 1, 1, 2, 4, 6, 2, 1, 2, 3, 1, 2, 2, 4, 6, 1, 1, 2, 3, 6, 2, 2, 4, 3, 1, 1, 2, 2, 3, 1, 1, 4, 6, 2, 2, 1, 2, 3, 1, 2, 4, 6, 2, 1, 1, 2, 3, 2, 2, 4, 6, 3, 1, 1, 2, 6, 2, 2, 4]

#eval Audit.echoInput "candExternal" candExternal

/-- The candidate's internal matrix over `ZMod candModulus`, row-major as submitted. HADES mixes
with it in every partial round. -/
def candInternal : Matrix (Fin 8) (Fin 8) (ZMod candModulus) :=
  pfMat candModulus 8 [18446744069414584320, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 3, 1, 1, 1, 1, 1, 1, 1, 1, 9223372034707292162, 1, 1, 1, 1, 1, 1, 1, 1, 4, 1, 1, 1, 1, 1, 1, 1, 1, 9223372034707292161, 1, 1, 1, 1, 1, 1, 1, 1, 18446744069414584319, 1, 1, 1, 1, 1, 1, 1, 1, 18446744069414584318]

#eval Audit.echoInput "candInternal" candInternal

/-- The exponent `e` of the candidate's power S-box `x ↦ x ^ e`. -/
def candExponent : ℕ := 7

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
  [9223372034707292159, 1, 0, 0, 0, 0, 0, 0]

/-- The same witness as a state over `ZMod candModulus`. -/
def witnessVector : Fin 8 → ZMod candModulus :=
  pfVec candModulus 8 witnessVectorEntries

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
  [3162298983328214455, 702733107406269879, 5621864859250159031, 1932516045367242167, 12122146102758155411, 17041277854602044563, 7203014350914266259, 14581711978680099987, 702733107406269879, 5621864859250159031, 1932516045367242167, 3162298983328214455, 17041277854602044563, 7203014350914266259, 14581711978680099987, 12122146102758155411, 5621864859250159031, 1932516045367242167, 3162298983328214455, 702733107406269879, 7203014350914266259, 14581711978680099987, 12122146102758155411, 17041277854602044563, 1932516045367242167, 3162298983328214455, 702733107406269879, 5621864859250159031, 14581711978680099987, 12122146102758155411, 17041277854602044563, 7203014350914266259, 12122146102758155411, 17041277854602044563, 7203014350914266259, 14581711978680099987, 3162298983328214455, 702733107406269879, 5621864859250159031, 1932516045367242167, 17041277854602044563, 7203014350914266259, 14581711978680099987, 12122146102758155411, 702733107406269879, 5621864859250159031, 1932516045367242167, 3162298983328214455, 7203014350914266259, 14581711978680099987, 12122146102758155411, 17041277854602044563, 5621864859250159031, 1932516045367242167, 3162298983328214455, 702733107406269879, 14581711978680099987, 12122146102758155411, 17041277854602044563, 7203014350914266259, 1932516045367242167, 3162298983328214455, 702733107406269879, 5621864859250159031]

/-- An inverse witness for `candInternal`, computed by the engine and checked below: the
inverse matrix over `ZMod candModulus`, listed column by column, each column from its last entry
to its first (`Packed.revCols`), so that one multiplication of packed numbers gives one entry of
`candInternal * witnessInternalInverse`. -/
def witnessInternalInverse : List ℕ :=
  [17129119493027828298, 4392081921289186743, 7905747458320536137, 14054662148125397578, 10540996611094048184, 2635249152773512046, 5270498305547024092, 6588122881933780114, 2635249152773512046, 9662580226836210835, 2635249152773512047, 8784163842578373486, 15811494916641072274, 13176245763867560229, 7905747458320536138, 5270498305547024092, 1317624576386756023, 14054662148125397578, 10540996611094048184, 4392081921289186743, 7905747458320536137, 6588122881933780115, 13176245763867560229, 2635249152773512046, 5270498305547024092, 878416384257837349, 5270498305547024094, 17568327685156746972, 13176245763867560229, 7905747458320536137, 15811494916641072274, 10540996611094048184, 7027331074062698789, 15518689455221793159, 878416384257837349, 15225883993802514043, 17568327685156746972, 4392081921289186743, 8784163842578373486, 14054662148125397578, 13176245763867560229, 17568327685156746972, 13176245763867560225, 878416384257837349, 5270498305547024094, 10540996611094048184, 2635249152773512047, 7905747458320536137, 11419412995351885532, 9076969303997652602, 17568327685156746972, 15518689455221793159, 878416384257837349, 14054662148125397578, 9662580226836210835, 4392081921289186743, 13176245763867560229, 11419412995351885532, 13176245763867560229, 7027331074062698789, 5270498305547024092, 1317624576386756023, 2635249152773512046, 17129119493027828298]

/-- The rows of the observability certificate, as indices into the stacked rows `eᵢ Mʲ` of
`Packed.obsStackP` (power `j` major, masked position `i` minor). -/
def witnessObsRows : List ℕ :=
  [0, 1, 2, 3, 4, 5, 6, 7]

/-- An inverse of those rows over `ZMod candModulus`, column by column, each column from its last
entry to its first (`Packed.revCols`). -/
def witnessObsInverse : List ℕ :=
  [11770779549055020472, 17585896012841903720, 7694927526098655179, 15460128362937937335, 13527612317570695169, 5902958102212666982, 1844674406941458428, 1, 5656722652276263688, 3829895435364170840, 14250423513760001327, 5822645747080521853, 2947574978287409789, 17913838129631496330, 4919131751843889137, 0, 1526771334543383963, 17115943247263960738, 3458450792877999615, 15039743379043115176, 3103737891044358635, 15864199899696542514, 17678129733188976643, 0, 0, 1607501983191842348, 10927499820167496619, 5797548136101726501, 16162861470344207204, 10084220091279972760, 10760600707158507531, 0, 6496098308344863821, 6614475373461515235, 10174571490803636033, 18296158403541812204, 5211937213263168267, 3320413932494625178, 5226577486334132225, 0, 2271333793580979430, 803750991595921174, 17523151985394915337, 16545600037770836345, 14230345424976965049, 14880373549327764686, 7532420495010955263, 0, 9085335174323917720, 11454549650722199026, 12327946512784277304, 9085335174323917720, 7730064181468968668, 3197435638698527949, 2459565875921944576, 0, 7189071233703824396, 3179867311013371202, 7820415580992631938, 13904076482252625461, 6480760879413377772, 17380932189848408338, 17831852600434098177, 0]

/-- Claim `field.prime`: the modulus is prime, so `ZMod candModulus` is a field. The certificate is
a Pratt certificate, listed below as flat numerals: for each prime `n` it proves, a base `a`, the
number `m` of prime factors of `n - 1`, and those factors with their exponents, each proved prime
by an earlier step. The kernel evaluates the checker (`Pratt.checkFlat`): every product, power and
modular exponentiation is computed, nothing is searched, and `Pratt.prime_of_checkFlat` (Lucas's
test, Mathlib's `lucas_primality`, applied step by step) turns acceptance into primality. -/
theorem field_prime : Nat.Prime candModulus :=
  Pratt.prime_of_checkFlat [2, 1, 0, 3, 2, 1, 2, 1, 5, 2, 1, 2, 2, 17, 3, 1, 2, 4, 257, 3, 1, 2, 8, 65537, 3, 1, 2, 16, 18446744069414584321, 7, 6, 2, 32, 3, 1, 5, 1, 17, 1, 257, 1, 65537, 1] candModulus (by decide)

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
`8 × 8` external matrix is MDS, and for a width above `4` it is not. -/
theorem external_m4_mds :
    candExternal = Hades.poseidon2External 8 externalM4 ∧ IsMDS externalM4 :=
  ⟨Hades.pfMat_eq_poseidon2External_of_checkP (S := 134) (by decide +kernel),
    isMDS_of_minors4Ok externalM4 (by decide)⟩

/-- Claim `external.invertible`: the determinant of `candExternal` over `ZMod candModulus` is
nonzero. The certificate is the inverse matrix `witnessExternalInverse`, checked as for
`internal_invertible` (`Packed.det_ne_zero_of_checkInverse`). This is invertibility only: it
does not say that the external matrix is MDS. -/
theorem external_invertible : candExternal.det ≠ 0 :=
  Packed.det_ne_zero_of_checkInverse (S := 134) (Wr := witnessExternalInverse)
    (by decide +kernel)

/-- Claim `internal.invertible`: the determinant of `candInternal` over `ZMod candModulus` is
nonzero. The certificate is the inverse matrix `witnessInternalInverse`: the kernel checks
`candInternal * witnessInternalInverse = 1` entry by entry (`Packed.checkInverse`), each entry one
product of packed numbers in base `2 ^ 134`, and a matrix with a right inverse has a
nonzero determinant (`Packed.det_ne_zero_of_checkInverse`). -/
theorem internal_invertible : candInternal.det ≠ 0 :=
  Packed.det_ne_zero_of_checkInverse (S := 134) (Wr := witnessInternalInverse)
    (by decide +kernel)

/-- Claim `sbox.bijective`: `x ↦ x ^ candExponent` permutes `ZMod candModulus`, stated for
`PrimePower.ZModP.powMap candModulus candExponent` so that the statement names the field. The
certificate is an inverse exponent `d` and a multiplier `k` with
`candExponent * d = (p - 1) * k + 1`, given below in that order: an identity between natural
numbers that the kernel checks. By Fermat's little theorem in `ZMod p` (`PrimePower.ZModP.powMap_bijective`) `x ↦ x ^ d` is then the inverse
map. -/
theorem power_bijective : Function.Bijective (PrimePower.ZModP.powMap candModulus candExponent) :=
  PrimePower.ZModP.powMap_bijective candModulus candExponent
    10540996611094048183
    4 (by decide) (by decide) (by decide)

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
    8 ≤ candPartialRounds ∧
      Hades.Design.WindowActive
        { external := candExternal, internal := candInternal, exponent := candExponent,
            fullRounds := candFullRounds, partialRounds := candPartialRounds }
        candMask 8 :=
  ⟨by decide,
    Hades.Design.windowActive_of_observable
      { external := candExternal, internal := candInternal, exponent := candExponent,
            fullRounds := candFullRounds, partialRounds := candPartialRounds }
      (Hades.observable_of_checkObsP (S := 134) (sel := witnessObsRows)
        (Wr := witnessObsInverse) (by decide +kernel))⟩

end CryptificateJob
#cryptificate_audit CryptificateJob.field_prime
#cryptificate_audit CryptificateJob.external_not_mds
#cryptificate_audit CryptificateJob.external_m4_mds
#cryptificate_audit CryptificateJob.external_invertible
#cryptificate_audit CryptificateJob.internal_invertible
#cryptificate_audit CryptificateJob.power_bijective
#cryptificate_audit CryptificateJob.partial_active
