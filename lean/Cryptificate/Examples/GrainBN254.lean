import Cryptificate

/-!
# Example: BN254 round constants submitted explicitly

The design of `examples/designs/poseidon2-bn254-grain.json`: the BN254 width-three Poseidon2 design
of `HadesReference` (`8` full and `56` partial rounds, `x ↦ x ^ 5`) with its `64 × 3` round
constants written out instead of named as the profile's reference constants. They are the
constants of HorizenLabs/poseidon2 (`poseidon2_instance_bn256.rs`, `RC3`), in decimal.

`constants_grain` is proved by kernel evaluation of `Grain.poseidon2Constants Poseidon2.BN254.modulus
3 candFullRounds candPartialRounds`, which runs the Grain LFSR, the self-shrinking generator and
the rejection sampling for `n = 254`, `t = 3`, `R_F = 8`, `R_P = 56` and compares the `192` numbers
with `candConstants`; it takes a few seconds. This is a statement about provenance, not about
security.

Instantiated from the fragments `header`, `const_external_bn254`, `const_internal_bn254`,
`const_exponent`, `const_rounds_hades`, `const_mask_hades`, `const_constants`, `external_mds`,
`internal_invertible`, `power_bijective`, `hades_activity`, `partial_active`,
`hades_total_activity`, `constants_grain_bn254` and `footer`.
-/

set_option autoImplicit false
set_option maxRecDepth 16000
set_option maxHeartbeats 2000000

namespace CryptificateJob

open Cryptificate

/-- The candidate's external matrix over the BN254 scalar field, row-major as submitted. HADES
mixes with it in every full round and, as Poseidon2 does, once before the first round. -/
def candExternal : Matrix (Fin 3) (Fin 3) Poseidon2.BN254.F :=
  bnMat3 2 1 1 1 2 1 1 1 2

#eval Audit.echoInput "candExternal" candExternal

/-- The candidate's internal matrix over the BN254 scalar field, row-major as submitted. HADES
mixes with it in every partial round. -/
def candInternal : Matrix (Fin 3) (Fin 3) Poseidon2.BN254.F :=
  bnMat3 2 1 1 1 2 1 1 1 3

#eval Audit.echoInput "candInternal" candInternal

/-- The exponent `e` of the candidate's power S-box `x ↦ x ^ e`. -/
def candExponent : ℕ := 5

#eval Audit.echoInput "candExponent" candExponent

/-- The candidate's number of full rounds, half of them before the partial rounds and half
after. -/
def candFullRounds : ℕ := 8

#eval Audit.echoInput "candFullRounds" candFullRounds

/-- The candidate's number of partial rounds. -/
def candPartialRounds : ℕ := 56

#eval Audit.echoInput "candPartialRounds" candPartialRounds

/-- The candidate's partial-round mask: `true` at the positions where a partial round applies
the S-box, as submitted. -/
def candPartialMask : Fin 3 → Bool :=
  maskBits3 1 0 0

#eval Audit.echoInput "candPartialMask" candPartialMask

/-- The positions where `candPartialMask` is `true`: the S-box positions of a partial round. -/
def candMask : Finset (Fin 3) :=
  Finset.univ.filter fun i => candPartialMask i = true

/-- The candidate's round constants as submitted, one row of `3` numerals per round, the
rows concatenated in round order (row `r` holds positions `3·r` to `3·r + 3 - 1`).
Only claim `constants.grain` uses them: every other claim holds for all round constants. -/
def candConstants : List ℕ := [13128406282895484157369354038809433636203389051939936481821261911791933663254, 18931653859213243425446645781588512487838213266321401679594943842133071369744, 14100663835952519432830313936592734340076294692040144715814219945570907513297, 4829113795940962171577509772302063766582957624337039572002553144762883322341, 15524196826242151316602020382811195434692947787822797536837043495207890599720, 11824742889827005569732308046012743315382715056680481843559537371456931944245, 15824369292130948538570881538463827283727388637222356799784648390667783881850, 7395652367440825515524159918310823124942438011035473842936180620057265532493, 1241351203963627868835881804826107927839874261162687401459390240620885410254, 6688265362431458560657026053775250595854204120757399493099812773970419156132, 18628865421786169197184064906533816626840829027307965436801990532221681661310, 17770079997659052348824924629777474963416629061770380464722096481670103655806, 11811415718957691261673974625780511541635150909919309658375768251762566747317, 0, 0, 17491388639298611159333770975992024026420968324544834879936543171716736973879, 0, 0, 5647537972700463414111873015737673282707440513292923385601908870282442800104, 0, 0, 13098696909140066209556423100763036393001603197583133354863092304798723388565, 0, 0, 6951180250619279643770888203380891623788978362131976553140006882493632020745, 0, 0, 11250251081997661635793843737498879309304455145146915350538637298238893102958, 0, 0, 2246982048814095620312232487641427155108104073024754628893054837638848127964, 0, 0, 18897180842973857564376958241871700087418903006311506731527228148081597475814, 0, 0, 11557404599711559103972421944754928847181400366333080241838467983028485750549, 0, 0, 17156358787639157774388183034849932704703797218604790661321342987075785318260, 0, 0, 8846001957151556825394442611430138293780354129800063716225175548340091032449, 0, 0, 21883449834630454155761926448978525628607016008113566399646971468161186616967, 0, 0, 11782201180140779170005707786217005381305915516114251118577530420880166417952, 0, 0, 19574374768428302416384468550351257389078501920039012797497943057156188490399, 0, 0, 8515987927591912252146893631936027853249294776314628553087138119917968203620, 0, 0, 17278996890957540943430295799612663512184925495827057764219426280563743078943, 0, 0, 4560144125266860756441160513270281593457202308593722614013851111005532208589, 0, 0, 18507459160700813704135500972073304101922968342745790738233104310822653821881, 0, 0, 12853272419783978245995917302225694649366687506910892647236063701566570840428, 0, 0, 14374895923592519298500369713759001634990764548024903321294831249025876110484, 0, 0, 1754533789272381217541450481312878927560073411620344950409407505576538004136, 0, 0, 20448232810715691360468548645921483318770769828465347895613479253435247065293, 0, 0, 4203277692183102377396835282861288449527228200284576966986741905195109677387, 0, 0, 11506339386261725202512749094297334054772084639665212079028551409689271965431, 0, 0, 4408799661846477128378547528471700197737434561274043409442231147309460168718, 0, 0, 10862521404448958117187164110262290189825635328197001646848012017699995213390, 0, 0, 7012061838863338817532836723152059636816924388921632356281537445328382279260, 0, 0, 8337544039076735620694225144163354013921209405711398618659178986151546625400, 0, 0, 16173744372216956516796750206695252671549928142051779144629150462255079400849, 0, 0, 19072902632067672883974143637757649536845413107085656789672471396027868707732, 0, 0, 3487852254355424154670010750480228751987308757772575371606146474985412561707, 0, 0, 17727517395793273304860106667199855253218123164763798377815886217088561516989, 0, 0, 13280131383170382695839570176732265848909891244754629477752800360224963964534, 0, 0, 21504421972374418324171209120165696620934505501591484695447432472073975792776, 0, 0, 13753604424945682926871108642602624411461374991709441590662260371815673344981, 0, 0, 8053178768600673579416591772204841415225213226540397062676127402210384682315, 0, 0, 15101558583452488762759591936595783545455044970328380152280373697190919758012, 0, 0, 6286700389345423344101403023711121482167900236544298155098199100234816571786, 0, 0, 19368755554193272721035317233504719593365546521121074341670771231332472422552, 0, 0, 13306281365497267243785678269212920842854030794417306689235276460198094483575, 0, 0, 10121764749051640353641114693266514664967620368543293902008953934189850195966, 0, 0, 179619165022370308972665071682395477322215797039585945216341070107573537790, 0, 0, 14053393851645634065914179337120715807963438235922115988819572738574714471437, 0, 0, 17345906218970918797922168310670548252023720338285437740234091480846393436478, 0, 0, 10383068492552043678323859571562933490503408853170063884414176092784243607055, 0, 0, 12096041499044892166554391619429604246288825927654072010011878199637889490527, 0, 0, 6449742640166027959651492823149770763572943879017164812917305794918053034585, 0, 0, 6551805454148805882554763665748573416514894105513920161214733482541847062214, 0, 0, 3651410956659878392469489270906333016569562868954890104332567650040497030813, 0, 0, 15219053914464753937310253926447830297339787956721755285255510737973021838676, 0, 0, 881679665678132972106931291023348167890022611850562267871389203532691753422, 0, 0, 5006067481688857073852527145736822635357747460125905556158034280392250104971, 0, 0, 12765332320844032254009314500332101047115754896003948733635815046365410860591, 0, 0, 12908190215073542091623737558383307555705501651914623082354191483197810853182, 0, 0, 1446042792715825508366007519346636771782990303010685652946852324744810237839, 0, 0, 17414863822034645298427260856470503848317996477890518738401812766215195632841, 0, 0, 12123026335854515584932892161148559902027319284544852339906677442670161590992, 11747143856113197599032240626240804787576886917202313931914972592787570603429, 12689083329367969619896630238881490862330991685178863399139986099061967775891, 9363616378570856727297258914956380343356030981401312041884116403700849212733, 13238291046435061349401827110993774315432323243867917623501520885175217584478, 13857006478672530359037215101120381968370236111775805219419707798416454682620, 2022752961549084842139747691238383165524359342011064407942599644003308437489, 11377043765620686524844863869245961003946340433252666374730228559486855986878, 9107028336454933966239128359918274121166034584181733998485105905495346200934, 900063247840342897532382686223939136593244983486268682637380837456165317070, 11261302954518146885624063833699323298803404236535464228351677636819579513431, 7126990412157463341897179572979760225771626877677162088926546182321369054630]

#eval Grain.echoConstants "candConstants" 3 candConstants

/-- Claim `external.mds`: every square submatrix of `candExternal` is nonsingular, so its branch
number is `4`. The kernel evaluates the `19` canonical minors by explicit formulas
(`Mat3.minorsOk`), and `Mat3.isMDS_of_minorsOk`, proved once for every `3 × 3` matrix, turns
that into WideTrail's `IsMDS`. -/
theorem external_mds : IsMDS candExternal :=
  Mat3.isMDS_of_minorsOk candExternal (by decide)

/-- Claim `internal.invertible`: the determinant of `candInternal`, which the kernel evaluates
with the six-term formula of `Matrix.det_fin_three`, is nonzero. -/
theorem internal_invertible : candInternal.det ≠ 0 :=
  Mat3.det_ne_zero_of_det3 (by decide)

/-- Claim `sbox.bijective`: `x ↦ x ^ candExponent` permutes the BN254 scalar field. The
certificate is an inverse exponent `d` and a multiplier `k` with
`candExponent * d = (p - 1) * k + 1`, given below in that order: an identity between natural
numbers that the kernel checks. By Fermat's little theorem `x ↦ x ^ d` is then the inverse
map. -/
theorem power_bijective : Function.Bijective (fun x : Poseidon2.BN254.F => x ^ candExponent) :=
  PrimePower.BN254.pow_bijective candExponent
    17510594297471420177797124596205820070838691520332827474958563349260646796493
    4 (by decide) (by decide) (by decide)

/-- Claim `activity.outer`: run the candidate permutation on two distinct inputs: the external
matrix, then `h = candFullRounds / 2` full rounds, `candPartialRounds` partial rounds with
S-boxes on the positions in `mask`, and `h` full rounds, where each round adds its constant,
applies `x ↦ x ^ candExponent` and multiplies by its matrix. For every mask and every choice of
round constants, at least `(h / 2 + h / 2) * 4 + h % 2 + h % 2` S-box evaluations in the full
rounds receive different inputs in the two executions. Partial rounds are not counted. The
design is written out field by field from the candidate constants, so the statement names every
value the bound depends on. Uses `external_mds`, `internal_invertible` and `power_bijective`
from this file. -/
theorem hades_activity :
    ∀ (mask : Finset (Fin 3)) (constants : ℕ → Fin 3 → Poseidon2.BN254.F)
      (x y : Fin 3 → Poseidon2.BN254.F), x ≠ y →
        (candFullRounds / 2 / 2 + candFullRounds / 2 / 2) * 4
            + candFullRounds / 2 % 2 + candFullRounds / 2 % 2
          ≤ Hades.Design.outerActivity
              { external := candExternal, internal := candInternal, exponent := candExponent,
                fullRounds := candFullRounds, partialRounds := candPartialRounds }
              mask constants x y :=
  -- The design is passed explicitly: leaving it to unification makes elaboration time out.
  fun mask constants _ _ hxy =>
    Hades.Design.outer_activity
      { external := candExternal, internal := candInternal, exponent := candExponent,
        fullRounds := candFullRounds, partialRounds := candPartialRounds }
      external_mds internal_invertible power_bijective mask constants hxy

/-- Claim `activity.partial`: the candidate's partial rounds cannot be passed by a nonzero
difference without an active S-box. Each partial round adds its round constants, applies
`x ↦ x ^ candExponent` at the positions of `candMask` and multiplies by `candInternal`. The
statement says that there are at least as many partial rounds as the window length, and that every
window of that many consecutive partial rounds is charged: for every choice of round constants,
every window inside the partial rounds and every two distinct states entering it, some S-box of
the window receives different inputs in the two runs. A bypass is therefore impossible
(`Hades.Design.not_bypass_of_windowActive`). The certificate is observability: the rows of
`candInternal ^ j` at masked positions, for `j` below the window length, include three rows with a
nonzero determinant (`Hades.observable_of_rows3`); the powers and positions of those rows are
listed below in that order. -/
theorem partial_active :
    3 ≤ candPartialRounds ∧
      Hades.Design.WindowActive
        { external := candExternal, internal := candInternal, exponent := candExponent,
          fullRounds := candFullRounds, partialRounds := candPartialRounds }
        candMask 3 :=
  ⟨by decide,
    Hades.Design.windowActive_of_observable
      { external := candExternal, internal := candInternal, exponent := candExponent,
        fullRounds := candFullRounds, partialRounds := candPartialRounds }
      (Hades.observable_of_rows3 candInternal candMask 3
        ![0, 1, 2] ![0, 0, 0] (by decide) (by decide) (by decide))⟩

/-- Claim `activity.total`: run the candidate permutation on two distinct inputs, with the
partial-round S-boxes at the positions of `candMask`. For every choice of round constants, the
full rounds and the partial rounds together contain at least the full-round bound of
`hades_activity` plus one S-box for each of the disjoint windows of consecutive partial rounds
that `partial_active` charges, here written `candPartialRounds / L` with `L` the window length.
Full rounds count every S-box, partial rounds the masked ones, so the two counts together are
every active S-box of the permutation. Uses `external_mds`, `internal_invertible`,
`power_bijective` and `partial_active` from this file. -/
theorem hades_total_activity :
    ∀ (constants : ℕ → Fin 3 → Poseidon2.BN254.F) (x y : Fin 3 → Poseidon2.BN254.F), x ≠ y →
        (candFullRounds / 2 / 2 + candFullRounds / 2 / 2) * 4
            + candFullRounds / 2 % 2 + candFullRounds / 2 % 2 + candPartialRounds / 3
          ≤ Hades.Design.outerActivity
              { external := candExternal, internal := candInternal, exponent := candExponent,
                fullRounds := candFullRounds, partialRounds := candPartialRounds }
              candMask constants x y
            + Hades.Design.partialActivity
              { external := candExternal, internal := candInternal, exponent := candExponent,
                fullRounds := candFullRounds, partialRounds := candPartialRounds }
              candMask constants x y :=
  -- The design is passed explicitly, as in `hades_activity`.
  fun constants _ _ hxy =>
    Hades.Design.total_activity
      { external := candExternal, internal := candInternal, exponent := candExponent,
        fullRounds := candFullRounds, partialRounds := candPartialRounds }
      external_mds internal_invertible power_bijective partial_active.2 constants hxy

/-- Claim `constants.grain`: the submitted round constants are exactly the ones the Poseidon2
reference procedure generates for the BN254 scalar field (`n = 254` bits), width `3`,
`candFullRounds` full and `candPartialRounds` partial rounds: the Grain LFSR seeded from these
parameters, 160 discarded clocks, the self-shrinking generator and rejection of candidates `≥ p`,
in the Poseidon2 layout (one constant per partial round, followed by zeros). The kernel runs the
procedure (`Grain.poseidon2Constants`) and compares the result with `candConstants`. This is a
statement about where the constants come from, not about their quality. -/
theorem constants_grain :
    Grain.poseidon2Constants Poseidon2.BN254.modulus 3 candFullRounds candPartialRounds =
      some candConstants := by
  decide +kernel

end CryptificateJob
#cryptificate_audit CryptificateJob.external_mds
#cryptificate_audit CryptificateJob.internal_invertible
#cryptificate_audit CryptificateJob.power_bijective
#cryptificate_audit CryptificateJob.hades_activity
#cryptificate_audit CryptificateJob.partial_active
#cryptificate_audit CryptificateJob.hades_total_activity
#cryptificate_audit CryptificateJob.constants_grain
