import Cryptificate

/-!
# Example: Poseidon2 over Goldilocks, width 12 (Plonky3)

The prime-field profile (`hades/prime/v1`) over Goldilocks,
`p = 2⁶⁴ - 2³² + 1 = 18446744069414584321`, with the linear layers, round numbers and S-box of
Plonky3's width-12 Poseidon2 (`examples/designs/goldilocks-t12.json`): the external matrix
`circ(2 M₄, M₄, M₄)` with `M₄ = [[2,3,1,1],[1,2,3,1],[1,1,2,3],[3,1,1,2]]` (`MDSMat4`,
`poseidon2/src/external.rs`), the internal matrix `1 · 1ᵀ + diag(V)` with
`V = [-2, 1, 2, 1/2, 3, 4, -1/2, -3, -4, 1/4, -1/4, 1/8]` (`goldilocks/src/poseidon2.rs`), `8` full
and `22` partial rounds, and `x ↦ x ^ 7` on coordinate `0` in the partial rounds, all as in the
Plonky3 repository at commit `0d803737b681774186cd283b1fd2d8e493655c82`. Round constants are not
part of the design, and no claim depends on them.

The certificate proves the modulus prime (`field_prime`) and then: the `12 × 12` external matrix is
not MDS: its submatrix on rows `0, 4` and columns `0, 1` is singular, so a nonzero input of weight
`2` has an image of weight `9`, `11` in total, below the `13` of an MDS matrix (`external_not_mds`,
counted on numerals); it is `circ(2 M₄, M₄, …, M₄)` for `M₄` above, and all `69` minors of `M₄` are
nonzero (`external_m4_mds`); it is invertible (`external_invertible`), and so is the internal matrix
(`internal_invertible`): the engine computes each inverse modulo `p`, and the kernel checks
`M · M⁻¹ = 1` with every row and column packed into one number in base `2 ^ 136`
(`Packed.checkInverse`); `x ↦ x ^ 7` is a bijection (`power_bijective`).

The rows `e₀ Mʲ`, `j < 12`, of the powers of the internal matrix have an inverse modulo `p`
(`witnessObsInverse`, checked as above after packed vector-matrix products), so for any round
constants and any two distinct states entering them, every `12` consecutive partial rounds feed
different inputs to some S-box, and there are at least `12` of the `22` partial rounds
(`partial_active`, window length `L = 12`).

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
def candExternal : Matrix (Fin 12) (Fin 12) (ZMod candModulus) :=
  pfMat candModulus 12 [4, 6, 2, 2, 2, 3, 1, 1, 2, 3, 1, 1, 2, 4, 6, 2, 1, 2, 3, 1, 1, 2, 3, 1, 2, 2, 4, 6, 1, 1, 2, 3, 1, 1, 2, 3, 6, 2, 2, 4, 3, 1, 1, 2, 3, 1, 1, 2, 2, 3, 1, 1, 4, 6, 2, 2, 2, 3, 1, 1, 1, 2, 3, 1, 2, 4, 6, 2, 1, 2, 3, 1, 1, 1, 2, 3, 2, 2, 4, 6, 1, 1, 2, 3, 3, 1, 1, 2, 6, 2, 2, 4, 3, 1, 1, 2, 2, 3, 1, 1, 2, 3, 1, 1, 4, 6, 2, 2, 1, 2, 3, 1, 1, 2, 3, 1, 2, 4, 6, 2, 1, 1, 2, 3, 1, 1, 2, 3, 2, 2, 4, 6, 3, 1, 1, 2, 3, 1, 1, 2, 6, 2, 2, 4]

#eval Audit.echoInput "candExternal" candExternal

/-- The candidate's internal matrix over `ZMod candModulus`, row-major as submitted. HADES mixes
with it in every partial round. -/
def candInternal : Matrix (Fin 12) (Fin 12) (ZMod candModulus) :=
  pfMat candModulus 12 [18446744069414584320, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 9223372034707292162, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 9223372034707292161, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 18446744069414584319, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 18446744069414584318, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 13835058052060938242, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4611686017353646081, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 16140901060737761282]

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
  [9223372034707292159, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]

/-- The same witness as a state over `ZMod candModulus`. -/
def witnessVector : Fin 12 → ZMod candModulus :=
  pfVec candModulus 12 witnessVectorEntries

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
  [16206782289557099082, 14362107882615640650, 18051456696498557514, 15284445086086369866, 16206782289557099082, 14362107882615640650, 18051456696498557514, 15284445086086369866, 6719885339572455717, 12253908560396831013, 1185862118748080421, 9486896949984643365, 14362107882615640650, 18051456696498557514, 15284445086086369866, 16206782289557099082, 14362107882615640650, 18051456696498557514, 15284445086086369866, 16206782289557099082, 12253908560396831013, 1185862118748080421, 9486896949984643365, 6719885339572455717, 18051456696498557514, 15284445086086369866, 16206782289557099082, 14362107882615640650, 18051456696498557514, 15284445086086369866, 16206782289557099082, 14362107882615640650, 1185862118748080421, 9486896949984643365, 6719885339572455717, 12253908560396831013, 15284445086086369866, 16206782289557099082, 14362107882615640650, 18051456696498557514, 15284445086086369866, 16206782289557099082, 14362107882615640650, 18051456696498557514, 9486896949984643365, 6719885339572455717, 12253908560396831013, 1185862118748080421, 16206782289557099082, 14362107882615640650, 18051456696498557514, 15284445086086369866, 6719885339572455717, 12253908560396831013, 1185862118748080421, 9486896949984643365, 16206782289557099082, 14362107882615640650, 18051456696498557514, 15284445086086369866, 14362107882615640650, 18051456696498557514, 15284445086086369866, 16206782289557099082, 12253908560396831013, 1185862118748080421, 9486896949984643365, 6719885339572455717, 14362107882615640650, 18051456696498557514, 15284445086086369866, 16206782289557099082, 18051456696498557514, 15284445086086369866, 16206782289557099082, 14362107882615640650, 1185862118748080421, 9486896949984643365, 6719885339572455717, 12253908560396831013, 18051456696498557514, 15284445086086369866, 16206782289557099082, 14362107882615640650, 15284445086086369866, 16206782289557099082, 14362107882615640650, 18051456696498557514, 9486896949984643365, 6719885339572455717, 12253908560396831013, 1185862118748080421, 15284445086086369866, 16206782289557099082, 14362107882615640650, 18051456696498557514, 6719885339572455717, 12253908560396831013, 1185862118748080421, 9486896949984643365, 16206782289557099082, 14362107882615640650, 18051456696498557514, 15284445086086369866, 16206782289557099082, 14362107882615640650, 18051456696498557514, 15284445086086369866, 12253908560396831013, 1185862118748080421, 9486896949984643365, 6719885339572455717, 14362107882615640650, 18051456696498557514, 15284445086086369866, 16206782289557099082, 14362107882615640650, 18051456696498557514, 15284445086086369866, 16206782289557099082, 1185862118748080421, 9486896949984643365, 6719885339572455717, 12253908560396831013, 18051456696498557514, 15284445086086369866, 16206782289557099082, 14362107882615640650, 18051456696498557514, 15284445086086369866, 16206782289557099082, 14362107882615640650, 9486896949984643365, 6719885339572455717, 12253908560396831013, 1185862118748080421, 15284445086086369866, 16206782289557099082, 14362107882615640650, 18051456696498557514, 15284445086086369866, 16206782289557099082, 14362107882615640650, 18051456696498557514]

/-- An inverse witness for `candInternal`, computed by the engine and checked below: the
inverse matrix over `ZMod candModulus`, listed column by column, each column from its last entry
to its first (`Packed.revCols`), so that one multiplication of packed numbers gives one entry of
`candInternal * witnessInternalInverse`. -/
def witnessInternalInverse : List ℕ :=
  [11068046441648750593, 3689348813882916864, 14757395255531667457, 230584300867682304, 307445734490243072, 1844674406941458432, 18216159768546902017, 18139298334924341249, 16602069662473125889, 17985575467679219713, 17524406865943855105, 9684540636442656768, 14757395255531667456, 11068046441648750593, 7378697627765833728, 17985575467679219713, 17831852600434098177, 14757395255531667457, 461168601735364608, 614891468980486144, 3689348813882916864, 922337203470729216, 1844674406941458433, 17524406865943855105, 7378697627765833728, 14757395255531667457, 3689348813882916864, 18216159768546902017, 18139298334924341249, 16602069662473125889, 230584300867682304, 307445734490243072, 1844674406941458432, 9684540636442656769, 922337203470729216, 17985575467679219713, 11068046441648750591, 3689348813882916865, 14757395255531667456, 17524406865943855105, 17216961131453612033, 11068046441648750593, 922337203470729216, 1229782937960972288, 7378697627765833730, 1844674406941458432, 3689348813882916864, 16602069662473125889, 4919131751843889152, 15987178193492639745, 2459565875921944576, 18293021202169462785, 5943950866811366059, 17216961131453612033, 153722867245121536, 6353878512798356822, 1229782937960972288, 307445734490243072, 614891468980486144, 18139298334924341249, 3689348813882916864, 16602069662473125889, 1844674406941458432, 18331451918980743169, 18293021202169462785, 17524406865943855105, 13950350202494779393, 153722867245121536, 922337203470729216, 230584300867682304, 461168601735364608, 18216159768546902017, 7378697627765833730, 14757395255531667456, 3689348813882916865, 922337203470729216, 1229782937960972288, 7378697627765833726, 17524406865943855105, 17216961131453612033, 11068046441648750593, 16602069662473125889, 14757395255531667457, 1844674406941458432, 13527612317570695169, 2459565875921944576, 15987178193492639745, 153722867245121536, 204963822993495381, 1229782937960972288, 18293021202169462785, 5943950866811366059, 17216961131453612033, 18139298334924341249, 17831852600434098177, 307445734490243072, 14757395255531667457, 1844674406941458432, 16602069662473125889, 4726978167787487232, 153722867245121536, 922337203470729216, 18331451918980743169, 18293021202169462785, 17524406865943855105, 18216159768546902017, 17985575467679219713, 230584300867682304, 3689348813882916861, 7378697627765833730, 11068046441648750595, 16602069662473125889, 15987178193492639745, 3689348813882916865, 1844674406941458432, 2459565875921944576, 14757395255531667456, 3689348813882916864, 7378697627765833728, 14757395255531667457, 14757395255531667460, 11068046441648750587, 7378697627765833730, 1844674406941458432, 2459565875921944576, 14757395255531667456, 16602069662473125889, 15987178193492639745, 3689348813882916865, 14757395255531667457, 11068046441648750593, 3689348813882916864, 7378697627765833730, 14757395255531667460, 3689348813882916861, 14757395255531667457, 13527612317570695169, 7378697627765833730, 3689348813882916864, 4919131751843889152, 11068046441648750591, 7378697627765833728, 14757395255531667456, 11068046441648750593]

/-- The rows of the observability certificate, as indices into the stacked rows `eᵢ Mʲ` of
`Packed.obsStackP` (power `j` major, masked position `i` minor). -/
def witnessObsRows : List ℕ :=
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

/-- An inverse of those rows over `ZMod candModulus`, column by column, each column from its last
entry to its first (`Packed.revCols`). -/
def witnessObsInverse : List ℕ :=
  [4615264269585597167, 18044516970184787829, 18397240554546906910, 10664613156672612698, 17336566165927943901, 16817072529858139415, 5717643756050008342, 10195742306218525003, 13580596162970374246, 3041272725941579086, 10716679887945615651, 1, 4191219088771126067, 17881005571353113535, 8511360531286488276, 12504913915106800501, 165044697920863560, 4519838056582728711, 6070755624677840590, 17924829748798686798, 16657067513692091015, 12822189737778055614, 9432239930519711260, 0, 12946898833318935346, 9570689176804949414, 13419636037858504684, 14656556941790938519, 1430219830563933440, 10601416785672629621, 8473235856455908422, 14694090366300872003, 11063398735911936466, 9810934993955312253, 4013386857853585758, 0, 14586136979489862256, 1193394887980342739, 13358465271230449054, 10443216545720906032, 7155286066158898962, 3363786322430572913, 9892354376151240251, 17650419536451937123, 1872405717837781517, 4609495398716361103, 8108759244904569655, 0, 12535394677960830945, 12497670121901736673, 379880257076226467, 9033893791443569059, 6186228694558412243, 17915752984395063732, 17106738298487857249, 13238295391010787475, 7446863978572439022, 5779090547385592685, 8560655673694990376, 0, 12162257139919296818, 8614456140047392633, 4248092135627030525, 11396934420406207818, 10505988251902933986, 160587528618395787, 8951988792680817476, 17783418179246758924, 10107520589373866755, 15748032044040123334, 11001189194624681870, 0, 3558318931142478536, 13055982869683967010, 14600116205132123175, 18440508625379738188, 16197659571227960595, 17790636745960031995, 15371082576272988069, 2200934193554338741, 4559399327814488789, 4418304277056291072, 487521093263099756, 0, 17355891839457624237, 4415562209694676754, 7884083146380066767, 1749077644832757039, 2327965236446363025, 3550215094945654327, 1087079851571244407, 2827308067557732245, 15064453681210509381, 9418532297066601308, 8106807208495107794, 0, 11323464275690820276, 5239586913684151262, 8166955785756958579, 16802485444435714396, 13542243347232487447, 16781415331445302760, 2828201699053053414, 7052672869763695860, 3283139332485377308, 12802235587814667705, 12858063829125276919, 0, 9622958956763389511, 9871597565538426027, 496014780276750580, 16145666118973259673, 10368816469313367114, 11573530917584636254, 17671637276318390279, 15690661633014065765, 11662642928911815800, 10649443078286373782, 15374238760921615462, 0, 13475854503166595053, 2954906512631352316, 577814018874808889, 9595412345718377684, 11213413208500085936, 14385430070002973072, 12193995929395391246, 7520309505097692700, 11851339781826462343, 17760841853716563375, 9151146687557203312, 0, 11734218624735743372, 6157853069787745807, 5327959319722709306, 14654881613708766473, 9314455652643567558, 6221344536007370103, 14330769381760836958, 15426621640588320311, 14951049661232248883, 6279657750651929182, 6281653165648267973, 0]

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
    12 ≤ candPartialRounds ∧
      Hades.Design.WindowActive
        { external := candExternal, internal := candInternal, exponent := candExponent,
            fullRounds := candFullRounds, partialRounds := candPartialRounds }
        candMask 12 :=
  ⟨by decide,
    Hades.Design.windowActive_of_observable
      { external := candExternal, internal := candInternal, exponent := candExponent,
            fullRounds := candFullRounds, partialRounds := candPartialRounds }
      (Hades.observable_of_checkObsP (S := 136) (sel := witnessObsRows)
        (Wr := witnessObsInverse) (by decide +kernel))⟩

end CryptificateJob
#cryptificate_audit CryptificateJob.field_prime
#cryptificate_audit CryptificateJob.external_not_mds
#cryptificate_audit CryptificateJob.external_m4_mds
#cryptificate_audit CryptificateJob.external_invertible
#cryptificate_audit CryptificateJob.internal_invertible
#cryptificate_audit CryptificateJob.power_bijective
#cryptificate_audit CryptificateJob.partial_active
