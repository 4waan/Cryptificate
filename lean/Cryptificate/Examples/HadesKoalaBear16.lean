import Cryptificate

/-!
# Example: Poseidon2 over KoalaBear, width 16 (Plonky3)

The prime-field profile (`hades/prime/v1`) over KoalaBear, `p = 127 · 2²⁴ + 1 = 2130706433`, with
the linear layers, round numbers and S-box of Plonky3's width-16 Poseidon2
(`examples/designs/koalabear-t16.json`): the external matrix `circ(2 M₄, M₄, M₄, M₄)` with
`M₄ = [[2,3,1,1],[1,2,3,1],[1,1,2,3],[3,1,1,2]]` (`MDSMat4`, `poseidon2/src/external.rs`), the
internal matrix `1 · 1ᵀ + diag(V)` with
`V = [-2, 1, 2, 1/2, 3, 4, -1/2, -3, -4, 1/2⁸, 1/8, 1/2²⁴, -1/2⁸, -1/8, -1/16, -1/2²⁴]`
(`koala-bear/src/poseidon2.rs`), `8` full and `20` partial rounds, and `x ↦ x ^ 3` on coordinate `0`
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
(`Packed.checkInverse`); `x ↦ x ^ 3` is a bijection (`power_bijective`).

The rows `e₀ Mʲ`, `j < 16`, of the powers of the internal matrix have an inverse modulo `p`
(`witnessObsInverse`, checked as above after packed vector-matrix products), so for any round
constants and any two distinct states entering them, every `16` consecutive partial rounds feed
different inputs to some S-box, and there are at least `16` of the `20` partial rounds
(`partial_active`, window length `L = 16`).

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
def candModulus : ℕ := 2130706433

#eval Audit.echoDecimal "candModulus" candModulus

/-- The candidate's external matrix over `ZMod candModulus`, row-major as submitted. HADES mixes
with it in every full round and, as Poseidon2 does, once before the first round. -/
def candExternal : Matrix (Fin 16) (Fin 16) (ZMod candModulus) :=
  pfMat candModulus 16 [4, 6, 2, 2, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 4, 6, 2, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 2, 2, 4, 6, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 6, 2, 2, 4, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 2, 3, 1, 1, 4, 6, 2, 2, 2, 3, 1, 1, 2, 3, 1, 1, 1, 2, 3, 1, 2, 4, 6, 2, 1, 2, 3, 1, 1, 2, 3, 1, 1, 1, 2, 3, 2, 2, 4, 6, 1, 1, 2, 3, 1, 1, 2, 3, 3, 1, 1, 2, 6, 2, 2, 4, 3, 1, 1, 2, 3, 1, 1, 2, 2, 3, 1, 1, 2, 3, 1, 1, 4, 6, 2, 2, 2, 3, 1, 1, 1, 2, 3, 1, 1, 2, 3, 1, 2, 4, 6, 2, 1, 2, 3, 1, 1, 1, 2, 3, 1, 1, 2, 3, 2, 2, 4, 6, 1, 1, 2, 3, 3, 1, 1, 2, 3, 1, 1, 2, 6, 2, 2, 4, 3, 1, 1, 2, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 4, 6, 2, 2, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 2, 4, 6, 2, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 3, 2, 2, 4, 6, 3, 1, 1, 2, 3, 1, 1, 2, 3, 1, 1, 2, 6, 2, 2, 4]

#eval Audit.echoInput "candExternal" candExternal

/-- The candidate's internal matrix over `ZMod candModulus`, row-major as submitted. HADES mixes
with it in every partial round. -/
def candInternal : Matrix (Fin 16) (Fin 16) (ZMod candModulus) :=
  pfMat candModulus 16 [2130706432, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1065353218, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1065353217, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2130706431, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2130706430, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2122383362, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1864368130, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2130706307, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 8323073, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 266338305, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 133169153, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 128]

#eval Audit.echoInput "candInternal" candInternal

/-- The exponent `e` of the candidate's power S-box `x ↦ x ^ e`. -/
def candExponent : ℕ := 3

#eval Audit.echoInput "candExponent" candExponent

/-- The candidate's number of full rounds, half of them before the partial rounds and half
after. -/
def candFullRounds : ℕ := 8

#eval Audit.echoInput "candFullRounds" candFullRounds

/-- The candidate's number of partial rounds. -/
def candPartialRounds : ℕ := 20

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
  [1065353215, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]

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
  [2021127245, 401790356, 1509757701, 146105584, 2021127245, 401790356, 1509757701, 146105584, 2021127245, 401790356, 1509757701, 146105584, 438316752, 523545009, 353088495, 1546284097, 401790356, 1509757701, 146105584, 2021127245, 401790356, 1509757701, 146105584, 2021127245, 401790356, 1509757701, 146105584, 2021127245, 523545009, 353088495, 1546284097, 438316752, 1509757701, 146105584, 2021127245, 401790356, 1509757701, 146105584, 2021127245, 401790356, 1509757701, 146105584, 2021127245, 401790356, 353088495, 1546284097, 438316752, 523545009, 146105584, 2021127245, 401790356, 1509757701, 146105584, 2021127245, 401790356, 1509757701, 146105584, 2021127245, 401790356, 1509757701, 1546284097, 438316752, 523545009, 353088495, 2021127245, 401790356, 1509757701, 146105584, 2021127245, 401790356, 1509757701, 146105584, 438316752, 523545009, 353088495, 1546284097, 2021127245, 401790356, 1509757701, 146105584, 401790356, 1509757701, 146105584, 2021127245, 401790356, 1509757701, 146105584, 2021127245, 523545009, 353088495, 1546284097, 438316752, 401790356, 1509757701, 146105584, 2021127245, 1509757701, 146105584, 2021127245, 401790356, 1509757701, 146105584, 2021127245, 401790356, 353088495, 1546284097, 438316752, 523545009, 1509757701, 146105584, 2021127245, 401790356, 146105584, 2021127245, 401790356, 1509757701, 146105584, 2021127245, 401790356, 1509757701, 1546284097, 438316752, 523545009, 353088495, 146105584, 2021127245, 401790356, 1509757701, 2021127245, 401790356, 1509757701, 146105584, 438316752, 523545009, 353088495, 1546284097, 2021127245, 401790356, 1509757701, 146105584, 2021127245, 401790356, 1509757701, 146105584, 401790356, 1509757701, 146105584, 2021127245, 523545009, 353088495, 1546284097, 438316752, 401790356, 1509757701, 146105584, 2021127245, 401790356, 1509757701, 146105584, 2021127245, 1509757701, 146105584, 2021127245, 401790356, 353088495, 1546284097, 438316752, 523545009, 1509757701, 146105584, 2021127245, 401790356, 1509757701, 146105584, 2021127245, 401790356, 146105584, 2021127245, 401790356, 1509757701, 1546284097, 438316752, 523545009, 353088495, 146105584, 2021127245, 401790356, 1509757701, 146105584, 2021127245, 401790356, 1509757701, 438316752, 523545009, 353088495, 1546284097, 2021127245, 401790356, 1509757701, 146105584, 2021127245, 401790356, 1509757701, 146105584, 2021127245, 401790356, 1509757701, 146105584, 523545009, 353088495, 1546284097, 438316752, 401790356, 1509757701, 146105584, 2021127245, 401790356, 1509757701, 146105584, 2021127245, 401790356, 1509757701, 146105584, 2021127245, 353088495, 1546284097, 438316752, 523545009, 1509757701, 146105584, 2021127245, 401790356, 1509757701, 146105584, 2021127245, 401790356, 1509757701, 146105584, 2021127245, 401790356, 1546284097, 438316752, 523545009, 353088495, 146105584, 2021127245, 401790356, 1509757701, 146105584, 2021127245, 401790356, 1509757701, 146105584, 2021127245, 401790356, 1509757701]

/-- An inverse witness for `candInternal`, computed by the engine and checked below: the
inverse matrix over `ZMod candModulus`, listed column by column, each column from its last entry
to its first (`Packed.revCols`), so that one multiplication of packed numbers gives one entry of
`candInternal * witnessInternalInverse`. -/
def witnessInternalInverse : List ℕ :=
  [1826918986, 1521933167, 1826319800, 913159909, 303787447, 304386633, 1217546524, 589749102, 786332136, 456579950, 1540957331, 1344374297, 1674126483, 951208229, 1902416458, 114144987, 607574894, 1217546532, 608773266, 304386615, 1523131539, 1521933167, 1826319818, 951208229, 558042161, 1217546533, 1179498204, 1572664272, 913159900, 228289975, 456579951, 1902416458, 303787447, 608773266, 304386633, 1217546524, 1826918986, 1826319800, 913159909, 1540957331, 1344374297, 1674126483, 589749102, 786332136, 456579950, 114144988, 228289975, 951208229, 1215149788, 304386631, 1217546532, 608773230, 915556645, 913159901, 1521933203, 1902416458, 1116084322, 304386633, 228289975, 1014622111, 1826319802, 456579950, 913159900, 1674126483, 1622995920, 405848844, 202924422, 101462205, 507710513, 1927782011, 2029244228, 1737540365, 1606485009, 1116084322, 393166068, 1234456902, 1014622111, 786332136, 1572664272, 1344374297, 1217246940, 304386633, 1217546533, 608773262, 913459493, 913159900, 1521933171, 1835831882, 1737540365, 1902416458, 1892904376, 393166068, 228289975, 589749102, 1179498204, 1540957331, 915556645, 1826319802, 913159901, 1521933203, 1215149788, 1217546532, 608773230, 228289975, 1014622111, 1826319798, 1902416458, 1116084322, 304386633, 1674126483, 1217546533, 456579950, 507710513, 1724857589, 1927782011, 2029244228, 1622995920, 202924422, 101462205, 393166068, 1944692379, 1014622111, 1737540365, 1606485009, 1116084322, 1344374297, 558042161, 786332136, 913459493, 1826319800, 913159900, 1521933171, 1217246940, 1217546533, 608773262, 827551159, 393166068, 228289975, 1835831882, 1737540365, 1902416458, 1540957331, 951208229, 589749102, 2128309688, 608772974, 304386487, 1217541852, 2396745, 1826319946, 913164837, 608773262, 101462205, 608773230, 1521933171, 2029244228, 1521933203, 913159909, 1826319818, 1217546524, 599186286, 1217546524, 608773262, 304386487, 1531520147, 1521933179, 1826319946, 1217546533, 202924422, 1217546532, 913159900, 1927782011, 913159901, 1826319800, 1521933167, 304386633, 599195722, 1198372572, 599186286, 2128309688, 1548287927, 1531520147, 2396745, 1217246940, 1622995920, 1215149788, 913459493, 507710513, 915556645, 1826918986, 1523131539, 303787447, 2396745, 1521933459, 1826319946, 913164325, 2128309688, 304386487, 1217541852, 1521933171, 2029244228, 1521933203, 608773262, 101462205, 608773230, 1217546524, 304386615, 913159909, 1531520147, 913159909, 1521933163, 1826319946, 599186286, 608773262, 304386487, 913159900, 1927782011, 913159901, 1217546533, 202924422, 1217546532, 304386633, 608773266, 1826319800, 932333861, 1826319802, 913159909, 1521933459, 1198372572, 1217546524, 608772974, 1826319800, 1724857589, 1826319802, 304386633, 405848844, 304386631, 608773266, 1217546532, 1521933167, 1514733495, 932333861, 1531520147, 2396745, 599195722, 599186286, 2128309688, 913459493, 507710513, 915556645, 1217246940, 1622995920, 1215149788, 303787447, 607574894, 1826918986]

/-- The rows of the observability certificate, as indices into the stacked rows `eᵢ Mʲ` of
`Packed.obsStackP` (power `j` major, masked position `i` minor). -/
def witnessObsRows : List ℕ :=
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]

/-- An inverse of those rows over `ZMod candModulus`, column by column, each column from its last
entry to its first (`Packed.revCols`). -/
def witnessObsInverse : List ℕ :=
  [2097229488, 487410159, 747232378, 105466021, 897142758, 1950396964, 2054235630, 683458396, 1097950974, 27079200, 1440969818, 1499152836, 368182330, 543905580, 915132500, 1, 2107414714, 940812463, 420740671, 184492687, 1202431835, 502451076, 197155292, 329117307, 603031017, 1239041819, 1870865095, 1220856754, 2099372002, 1419979661, 577182639, 0, 1629715899, 698366619, 1682115926, 478163611, 251507268, 1324193530, 348520054, 1984245530, 479491242, 304077207, 1680202788, 155854675, 8094065, 1772953372, 2117443245, 0, 1760065316, 1744587337, 385558297, 1422396160, 1803358611, 1434962117, 1753542936, 1062038240, 2039080240, 1206173959, 1637936693, 1803851669, 1009802093, 1797967902, 445742760, 0, 787721874, 526291242, 1668608725, 554124747, 2002699503, 891744033, 1966006325, 110464755, 244282399, 713749963, 513285615, 609354921, 516089036, 540262809, 1139552651, 0, 1387829621, 971702024, 1184824403, 1374843850, 864697723, 500870652, 735151783, 30267898, 957152368, 360246818, 1568761410, 1213643500, 1418929559, 592623482, 1753399940, 0, 350125095, 29160848, 2004718762, 1187441403, 1319646563, 499184672, 1655012026, 1420034333, 113780370, 692741922, 1341038538, 630271698, 419630129, 1771143836, 1481014836, 0, 1058242803, 585446330, 584091454, 1743045842, 536978055, 2007744146, 1687256803, 1704842513, 1187965269, 827258466, 1703013590, 1540159313, 46741529, 289468409, 1543396942, 0, 377631745, 1542373378, 876525974, 1874491142, 444358668, 521483549, 394477899, 26753877, 1903656398, 772355652, 1385702244, 1748393514, 2019412874, 2041632978, 1116401572, 0, 1432516426, 67455800, 828359584, 1165706241, 333818677, 607102116, 260464436, 11010198, 1414635583, 1238751271, 1203082942, 89187126, 1263584481, 9676905, 728180379, 0, 777601979, 546711424, 1687269763, 847358278, 559758507, 818517231, 764845019, 1657934567, 1099972100, 1307429008, 1431253190, 1233429309, 592229310, 1754957862, 1966383917, 0, 2013989531, 2099185282, 132092570, 757728877, 1345742556, 597380971, 1181758889, 911602409, 1893875569, 280031440, 938142437, 1282080317, 580087345, 544255115, 356991723, 0, 338021991, 1397072628, 1162155813, 716803395, 1828319435, 170413155, 361508650, 1990413804, 1343314731, 1135682403, 55824635, 968000635, 1431219318, 2078421995, 2068478876, 0, 1635569722, 2074185963, 2058947542, 1978142305, 1601646685, 1265521633, 2081408223, 1055239250, 1643749499, 271065942, 560740902, 1539213317, 77562726, 1619449316, 1844621305, 0, 477057233, 542565594, 1589020602, 878331644, 756135022, 256089300, 1038397930, 416047977, 1648586475, 1534763367, 123499681, 940067336, 601136319, 251965144, 1730574974, 0, 2050344971, 720098412, 515643854, 462530951, 1975572867, 1711511426, 752131321, 196379854, 151088845, 324379690, 1771189459, 2101476605, 1024731413, 1659168900, 1629402896, 0]

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
    1420470955
    2 (by decide) (by decide) (by decide)

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
    16 ≤ candPartialRounds ∧
      Hades.Design.WindowActive
        { external := candExternal, internal := candInternal, exponent := candExponent,
            fullRounds := candFullRounds, partialRounds := candPartialRounds }
        candMask 16 :=
  ⟨by decide,
    Hades.Design.windowActive_of_observable
      { external := candExternal, internal := candInternal, exponent := candExponent,
            fullRounds := candFullRounds, partialRounds := candPartialRounds }
      (Hades.observable_of_checkObsP (S := 70) (sel := witnessObsRows)
        (Wr := witnessObsInverse) (by decide +kernel))⟩

end CryptificateJob
#cryptificate_audit CryptificateJob.field_prime
#cryptificate_audit CryptificateJob.external_not_mds
#cryptificate_audit CryptificateJob.external_m4_mds
#cryptificate_audit CryptificateJob.external_invertible
#cryptificate_audit CryptificateJob.internal_invertible
#cryptificate_audit CryptificateJob.power_bijective
#cryptificate_audit CryptificateJob.partial_active
