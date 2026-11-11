# Cipher-security research directions

Cryptificate checks the consequences of changes to supported cryptographic components. This note separates what the tool checks today from research directions it is built to grow into. Proposed work is marked as such; nothing here is a security-level claim.

## Scope of the current release

Cryptificate certifies components first. Three profiles are checked and tested:

| Profile | Model | Field | Width | Round template |
|---|---|---|---|---|
| AES-like | `aes-like/gf256/v1` | GF(2⁸), polynomial `0x11B` | 4 | pre-addition, byte S-box, row shifting, column mixing; 4 to 32 rounds |
| HADES | `hades/bn254/v1` | BN254 scalar field | 3 | initial external mixing, then full / partial / full rounds with pre-addition; up to 160 rounds |
| HADES over a 64-bit prime | `hades/prime/v1` | BabyBear, KoalaBear, Mersenne31, Goldilocks, or a custom prime below 2⁶⁴ | 2, 3, 4, 8, 12, 16 and 24 | as for BN254 |

The engine's representation accepts AES-like widths two through four; widths two and three are experimental. Other profile and width pairs are rejected until their checks exist.

Which claims exist differs by profile, and the table is exact:

| Claim | AES-like, width 4 | HADES BN254, width 3 | HADES 64-bit prime, widths 2, 3 and 4 | HADES 64-bit prime, widths 8, 12, 16 and 24 |
|---|---|---|---|---|
| `field.prime` (Pratt certificate) | – | – (WideTrail's pinned proof) | yes | yes |
| `matrix.mds`, `offsets.dispersion`, `activity.bound` | yes | – | – | – |
| `external.mds` | – | yes | yes | refutation only (a singular submatrix of order at most 2); otherwise not established |
| `external.m4_mds`, `external.invertible` | – | – | – | yes |
| `internal.invertible`, `activity.partial` | – | yes | yes | yes |
| `activity.outer`, `activity.total` | – | yes | yes | not established |
| `sbox.bijective` | table or AES S-box | power map | power map | power map |
| `sbox.differential`, `sbox.linearity` (exact value of a byte S-box table) | yes | – | – | – |
| `constants.grain` (round constants against the Poseidon2 Grain procedure) | – | explicit or reference constants | explicit constants | explicit constants |
| `circuit.equivalence`, native correctness and timing, circuit search | yes | yes | not offered | not offered |
| `rust.refinement` | yes | unsupported (native variants call arkworks `Fr`) | not established (out of scope) | not established (out of scope) |

Editable within each template's fixed operation order: matrices, row offsets, round counts, byte S-box tables, prime-field power exponents, partial-round masks and explicit constant arrays; in the prime-field profile also the field and, for a custom field, its modulus. Constant arrays must match the submitted schedule exactly; they are never extended silently. An edited reference configuration is reported as a variant. Every claim except `constants.grain` holds for every choice of round constants; that one compares the constants with the Poseidon2 reference generation procedure (below), so explicit constants are part of a request, its digest and, through `candConstants`, of the certificate. The prime-field profile has no reference constants and leaves them unspecified unless given; `constants.grain` is then not established.

The exact GF(2⁸) polynomial and prime modulus are part of every claim's meaning. The BN254 profile uses

```text
21888242871839275222246405745257275088548364400416034343698204186575808495617
```

The prime-field profile names its modulus in every normalized request: BabyBear `2013265921 = 15 · 2²⁷ + 1`, KoalaBear `2130706433 = 127 · 2²⁴ + 1`, Mersenne31 `2147483647 = 2³¹ - 1`, Goldilocks `18446744069414584321 = 2⁶⁴ - 2³² + 1`, or the submitted custom prime. Each certificate proves its modulus prime from a Pratt certificate (claim `field.prime`, below) before any other claim uses it.

### Implementation assurance is part of the scope

The release includes a formal connection from Rust source to the mathematical model:

`recorded Rust source → Aeneas model → executable mathematical model → named properties`

For the GF(2⁸) kernels and the AES-like round it covers field arithmetic, S-box table lookup, state layout, round keys, linear layers and complete bounded round execution, with successful execution and equality to the specification for every input (for multi-round execution, given enough round keys). For AES given as byte arrays (matrix, offsets, FIPS 197 S-box), the wide-trail bound is proved for the Rust executions with no design hypothesis (at least 55 active S-boxes over ten rounds, for any two different inputs and any round keys), both for ten full rounds and for the AES data path whose last round is the final round without MixColumns, and, conditionally on three kernel-evaluable checks on its bytes, for any design. The AES key expansion is not modelled: the theorems hold for every key sequence, and the FIPS 197 ciphertexts are checked by tests. For BN254 it covers a self-contained Montgomery kernel (`crates/kernels/src/bn254_mont.rs`: CIOS multiplication, addition, subtraction, conversions) against `ZMod p` on canonical inputs; the arkworks arithmetic that the native BN254 variants call, the arithmetic of the other prime fields and HADES rounds are not covered. Charon, Aeneas and the Rust compiler remain trusted. This does not establish machine-code correctness or constant-time execution. [refinement/STATUS.md](../refinement/STATUS.md) records which links are proved today.

## What the underlying library establishes

Cryptificate builds on the [WideTrail](https://github.com/4waan/Wide-Trail-formal-verification) Lean library:

- `Algebra/MDS`: an MDS matrix gives the optimal branch bound. `Algebra/AESMix` discharges the AES MixColumns case.
- `Propagation/Cipher`: activity lower bounds for supported support trails. `Propagation/Grid`: diffusion-optimal row rotations are exactly those with distinct offsets.
- `Hades/Schedule` models executions with fixed additions; `Hades/Bounds` proves activity contributed by full outer rounds under invertibility and branch hypotheses.
- `Differential`: exact differential-count identities, independent-round-key trail bounds, and small examples separating fixed-key from key-averaged behaviour.
- `Poseidon2/BN254`: bijectivity, external MDS mixing and an outer-round activity bound for the pinned width-three instance.

Cryptificate adds fresh-input certificates (canonical minors, checked counterexamples, offsets, activity instantiation, partial-round windows and bypasses), primality certificates for submitted moduli, a universal circuit-equivalence checker, S-box and exponent certificates, exact differential uniformity and linearity of byte S-box tables, an optimizer, a native measurement harness, the Rust refinement chain, and replayable bundles.

### Prime fields: what is proved

`lean/Cryptificate/PrimeField` makes the HADES certificates field-generic:

- **Primality by kernel evaluation.** `Pratt.prime_of_checkFlat` proves `Nat.Prime p` from a flat list of numerals that `Pratt.checkFlat` accepts: steps `n, a, m, q₁, k₁, …`, each proving `n` prime from `n - 1 = ∏ qᵢ^kᵢ` with every `qᵢ` proved by an earlier step, `a^(n-1) ≡ 1` and `a^((n-1)/qᵢ) ≢ 1 (mod n)` (Mathlib's `lucas_primality`). Modular powers are square-and-multiply on natural numbers, so the kernel's arbitrary-precision arithmetic does all the work and nothing is searched. The engine factors `p - 1` (Pollard's rho, Miller–Rabin) and picks the smallest primitive root; none of that is trusted. The library proves the four named moduli prime with the same checker, and BN254 too, as a cross-check of WideTrail's tactic proof.
- **Field-generic encoders and power maps.** Matrices, vectors and masks over `ZMod p` are written as numeral lists (`pfMat`, `pfVec`, `maskBits`) and echoed back in decimal; `PrimePower.ZModP.pow_bijective` is the inverse-exponent certificate for any prime `p`; a collision `w ≠ 1`, `w^e = 1` refutes injectivity in any monoid. Certificates state both for `PrimePower.ZModP.powMap p e` (`powMap_bijective`, `powMap_not_injective_of_root`), so the printed statement names `p`.
- **Width four.** `Hades.observable_of_rows4` (four rows `eᵢ Mʲ` with a nonzero explicit `4 × 4` determinant), `Hades.powers_zero_of_invariant` (an invariant subspace of any dimension that vanishes on the mask, with explicit coefficients) and `Hades.powers_zero_of_rows` (a bypass of fewer partial rounds than the width, checked row by row). With `Diffusion.Minors4` for MDS and the width-generic `Hades.Design` and `Hades.Partial`, every HADES claim has a certificate at widths three and four.
- **Wide widths by packed inverse witnesses** (`PrimeField/Packed.lean`, `PrimeField/NatMatrix.lean`). Determinant formulas do not scale to width 24, and a kernel that walks lists entry by entry spends seconds on one `24 × 24` product. The engine instead computes witnesses modulo `p` and the kernel only checks them. A vector of `n` residues is packed into one natural number in base `2 ^ S`, with `n² p² ≤ 2 ^ S` (`boundOk`); a matrix row times a column of a witness, given column by column and reversed (`revCols`), is then digit `n - 1` of one product of two packed numbers, and the kernel's GMP-backed arithmetic on numerals does each such product in one step (Kronecker substitution; the carry analysis is `Packed.kron_eq`, proved once for every base, length and digit bound). On that basis:
  - `Packed.det_ne_zero_of_checkInverse`: `pfMat p n E * revCols p n W = 1`, so `det ≠ 0`. This certifies `internal.invertible` and `external.invertible` at every width other than 3 and 4.
  - `Hades.observable_of_checkObsP`: the rows `eᵢ Mʲ`, `j < L`, computed by packed vector-matrix products, contain `n` rows with an inverse, so the internal matrix is observable from the mask in `L` steps and every window of `L` partial rounds is charged. With a single masked position `L = t`.
  - `Hades.powers_zero_of_checkOrthP`: every row `eᵢ Mʲ` with `j` below the number of partial rounds is orthogonal to `v`, a bypass of those rounds. `Hades.invariant_of_check` (on lists) certifies an invariant subspace of any dimension, a bypass of every number of rounds; `NatMatrix.mulVec_eq_zero_of_check` a kernel vector of a singular matrix.
  - `Hades.pfMat_eq_poseidon2External_of_checkP`: one packed comparison shows that a `t × t` matrix is `Hades.poseidon2External t M₄ = circ(2 M₄, M₄, …, M₄)`; with `Diffusion.Minors4` on `M₄` this is the claim `external.m4_mds`. It says nothing about the MDS property of the `t × t` matrix, which for `t ≥ 8` fails: rows `0, 4` and columns `0, 1` of `circ(2 M₄, M₄, …)` form a singular `2 × 2` submatrix (row 4 is half of row 0 there), and `NatMatrix.not_isMDS_of_checkBranch` refutes `external.mds` with the corresponding weight-two vector, counting nonzero entries on numerals (deciding the same weights over `ZMod p` exhausts the kernel's memory at width 24).
  - `Mat2.isMDS_of_minorsOk`: the five canonical minors of a `2 × 2` matrix, so width two keeps every claim, the activity bounds included.

  Measured on one thread with the whole certificate file (about 3.8 to 4.4 s of it is importing the library, defining the constants and proving the modulus prime): Plonky3's width-16 and width-24 instances check in 4.4–6.8 s in total. Each inverse check of a `24 × 24` matrix adds 0.6–0.9 s, the observability certificate with `L = 24` about 0.9 s, the low-weight refutation about 0.2 s and the `M₄` structure with its minors about 1 s; at width 16 the internal inverse adds about 0.2 s.

  Not established at these widths: `activity.outer` and `activity.total`. Their bound (`Hades.Design.outer_activity`) needs an MDS external matrix, and no theorem here bounds the activity of full rounds through `circ(2 M₄, M₄, …, M₄)`; a bound for that structure would need an argument about the construction itself (for example through the branch number of `M₄` on each block and the mixing between blocks), which is future work.

Every theorem above has its axioms pinned to `propext`, `Classical.choice` and `Quot.sound` (`PrimeField/Axioms.lean`; `powMod_eq` needs only `propext` and `Quot.sound`). Regression certificates for KoalaBear and BabyBear at width four, Mersenne31 and Goldilocks at width three, a custom prime at widths four and twelve, Plonky3's Poseidon2 instances (BabyBear, KoalaBear and Mersenne31 at widths 16 and 24, Goldilocks at widths 8 and 12; internal diagonals, rounds and S-boxes of Plonky3 commit `0d803737b681774186cd283b1fd2d8e493655c82`), a deliberately bad width-eight design and a width-two design are in `lean/Cryptificate/Examples/Hades*.lean`; each checks in 3 to 7 seconds.

### Round constants: what is proved

`lean/Cryptificate/Grain` transcribes the round-constant generation of the Poseidon2 reference, `poseidon2_rust_params.sage` in [HorizenLabs/poseidon2](https://github.com/HorizenLabs/poseidon2) at commit `055bde3f4782731ba5f5ce5888a440a94327eaf3` (file SHA-256 `c301c6d0…5223`), whose Grain LFSR, self-shrinking generator and sampling are those of the Poseidon reference `generate_parameters_grain.sage` ([hadeshash](https://extgit.isec.tugraz.at/krypto/hadeshash), formerly at extgit.iaik.tugraz.at, commit `208b5a164c6a252b137997694d90931b2bb851c5`, file SHA-256 `8d692787…1630`). It covers prime fields (`FIELD = 1`), the power S-box with a positive exponent (`SBOX = 0`) and the Poseidon2 layout, and is written for the kernel: the 80-bit register is a natural number, 16 clocks are one expression (the nearest tap is 62 positions behind the newest bit), the self-shrinking step reads a byte at a time from a table proved equal to its definition (`Grain.shrinkTable_spec`), and every loop is structural recursion on an explicit budget, so `poseidon2Constants … = some cs` means the procedure ran to completion and produced `cs`.

- **The pinned BN254 constants.** `Grain.bn254_reference`: WideTrail's `Poseidon2.BN254.roundConstants`, read row by row, are `poseidon2Constants p 3 8 56` for the BN254 modulus, by kernel evaluation in about three seconds.
- **Refutation.** `Grain.ne_of_constantAt`: a list that differs at one position from the generated list is not it.
- **Faithfulness, tested, not proved.** `Grain.Bitwise` transcribes the scripts a second time, clock by clock and bit by bit; both versions agree on BN254, BabyBear, KoalaBear, Mersenne31, Goldilocks and a small prime where half of the candidates are rejected (`#guard`, and `Bitwise.start_eq` in the kernel). `Grain.Vectors` checks the published BabyBear `RC16` and Goldilocks `RC8` of HorizenLabs/poseidon2 and Plonky3's KoalaBear width-16 constants. The engine's Rust implementation (`crates/core/src/grain.rs`) is a third, independent one and is only used to predict the outcome and to locate the first difference.

The certificate states `poseidon2Constants candModulus t candFullRounds candPartialRounds = some candConstants`, or for a refutation `constantAt … i = some e ∧ candConstants[i]? ≠ some e`. Certificates for explicit constants (proved or refuted) depend on `propext` only; the certificate for the profile's reference BN254 constants (`"constants": {"kind": "reference"}`) reuses `Grain.bn254_reference` and has the standard three axioms (`propext`, `Classical.choice`, `Quot.sound`). KoalaBear (`t = 4`, 52 constants) and BN254 (`t = 3`, 80 constants of 254 bits, 192 layout entries) certificates check in about four and six seconds (`lean/Cryptificate/Examples/Grain*.lean`); the full certificate for the reference BN254 design, reference constants included, is `HadesReference.lean` (about three seconds). Parameters the seed cannot hold (`n` or `t` of 4096 or more, `R_F` or `R_P` of 1024 or more) and odd `R_F` are outside the model; the schema rejects them anyway.

The claim is provenance, not security: it ties the constants to a public procedure and its parameters, as the Poseidon and Poseidon2 papers ask of an instance, and says nothing about the procedure's quality. Poseidon (version 1) constants (`t` per partial round), the inverse S-box and binary fields are not modelled, and Plonky3's and HorizenLabs' constants at every width the profiles accept (2, 3, 4, 8, 12, 16 and 24) can be imported with `cryptificate import` and checked as `constants.grain`.

## 1. Audit diffusion changes and implementation substitutions

*Implemented.* Two equivalent circuits implement the same matrix and therefore have the same diffusion; a changed matrix needs fresh evidence. Cryptificate checks circuit equivalence, matrix properties and round-template prerequisites separately. A failing branch-bound claim comes with a checked nonzero `v` whose combined weight in `v` and `Mv` is too small; a circuit mismatch comes with a checked distinguishing input. Fewer operations or faster execution is not evidence of stronger security.

## 2. Partial rounds that miss a subspace

*Implemented for HADES width 3 over BN254 and every width of `hades/prime/v1` (2, 3, 4, 8, 12, 16 and 24) as `activity.partial`; `activity.total` wherever `activity.outer` applies (BN254, and prime widths 2 to 4).* Can a nonzero difference pass through a sequence of partial rounds without reaching an active S-box? Linear-layer choices affect middle-round behaviour even when every matrix is MDS ([Keller and Rosemarin, *Mind the Middle Layer*](https://eprint.iacr.org/2020/179)).

A concrete example over the pinned prime field: use

```text
M = [2 1 1]      v = [0, 1, -1]
    [1 2 1]
    [1 1 2]
```

as the repeated internal matrix of a partial round whose S-box touches only coordinate 0. Then `Mv = v` and `v₀ = 0`, so two states differing by `v` feed equal values to the only S-box, and the difference stays `v` forever. This matrix is the pinned *external* matrix; using it as the internal matrix is a deliberately different construction. The pinned internal matrix is `[[2,1,1],[1,2,1],[1,1,3]]`. The design is [`examples/designs/poseidon2-bypass.json`](../examples/designs/poseidon2-bypass.json); its report refutes `activity.partial` with the witness `[0, 1, -1]` while every full-round claim still holds.

### What is proved

`lean/Cryptificate/Hades/Partial.lean` proves, for any field, width and partial-round mask:

- **Inactivity lemma.** A partial round in which two states agree at every masked position multiplies their difference by the internal matrix `M` (`Design.round_sub_of_agree`), so along `L` such rounds the difference after `j` rounds is `Mʲ d` (`Design.run_sub_of_agree`). The round constants cancel.
- **Bypass.** If `(Mʲ v)ᵢ = 0` for every masked `i` and every `j` below the number of partial rounds, then for every choice of round constants and every state `z` entering the first partial round, the runs from `z` and `z + v` give equal inputs to every masked S-box of every partial round (`Design.Bypass`, `Design.bypass_of_powers`). The certificate is an invariant subspace: at most two vectors that vanish on the mask and that `M` maps into their span with explicit coefficients (`powers_zero_of_invariant2`), so the kernel checks a few products however many partial rounds there are. At width three every bypass of more than two partial rounds has this form. A design with one or two partial rounds may have a bypass that lies in no invariant subspace; it is checked directly, `v` and `M v` at the masked positions (`powers_zero_of_short`), and then only the first `RP` powers are known to vanish there.
- **Charged windows.** If the stacked rows `eᵢ Mʲ`, `i` masked and `j < L`, have full column rank (`Observable`; certified at width three by three of them with a nonzero `3 × 3` determinant, `observable_of_rows3`), then for every choice of round constants, every window of `L` consecutive partial rounds and every two distinct states entering it, some masked S-box of the window receives different inputs (`Design.WindowActive`). With `L` at most the number of partial rounds this rules out every bypass (`Design.not_bypass_of_windowActive`), so the two certificates never both exist. For every width-three design with at least one partial round one of them does: either the stacked rows reach full rank within the partial rounds, or they have a nonzero null vector, and the engine emits the corresponding certificate. The refutation states `0 < RP` as well as the bypass. With no partial rounds (`partialRounds = 0`, which the schema allows) every difference would pass them vacuously and no window fits, so `activity.partial` is reported as not established (out of scope, with no witness and no certificate) and `activity.total` is not established either; `activity.outer` then already bounds every S-box of the permutation.
- **Whole-permutation bound.** Under the hypotheses of the full-round bound (MDS external matrix, invertible internal matrix, bijective `x ↦ x^e`), two distinct inputs stay distinct at every round, the partial rounds hold `⌊RP / L⌋` disjoint charged windows, and the active S-boxes of the full and partial rounds together number at least `outerBound + ⌊RP / L⌋` (`Design.total_activity`).

For the pinned internal matrix and mask `{0}`,

```text
O_3 = [1 0 0]
      [2 1 1]      det(O_3) = 1
      [6 5 6]
```

so every three consecutive partial rounds activate the S-box of coordinate 0: 18 disjoint windows in 56 partial rounds, plus the 16 full-round applications, for a total lower bound of **34** active S-boxes over the whole permutation for any two distinct inputs and any round constants (`Hades.reference_total_activity`, and the `activity.total` certificate of the pinned instance).

The engine finds the window length `L` by scanning the rows `eᵢ Mʲ` in order and keeping those that raise the rank, and finds a bypass as the null space of the stacked rows for `j` below the width, which is the largest subspace that every power of `M` keeps at zero on the mask; when that subspace is zero and there are fewer partial rounds than the window needs, it takes a null vector of the rows for `j` below the number of partial rounds instead. Neither computation is trusted: Lean checks the determinant or the inverse of the kept rows, the invariance and vanishing of the subspace, or the orthogonality of `v` to the rows, for the submitted matrix and mask.

### Scope and limits

The bound counts S-boxes with a nonzero input difference in two executions with the same round constants. It is neither a tightness result nor a security level, it says nothing about probabilities, and one charged S-box per window is all it extracts from the partial rounds; a sharper count of the partial rounds, or bounds across the boundary between full and partial rounds, would need a further argument. The certificates are written for width three over BN254 and for widths 2, 3, 4, 8, 12, 16 and 24 over the 64-bit prime fields (with `observable_of_rows4`, `powers_zero_of_invariant` and `powers_zero_of_rows` at width four, and the packed checks at the other widths); the other library lemmas hold at every width. With a single masked position a window needs at least `t` partial rounds, and a design with fewer partial rounds than that is refuted by a bypass of its few rounds: among Plonky3's instances this is the case for BabyBear-16 (13 partial rounds), BabyBear-24 (21), KoalaBear-24 (23) and Mersenne31-16 and -24 (14 and 22). Such a refutation is about differences through the partial rounds alone and says nothing about the full rounds. At widths 8 to 24, `activity.outer` and `activity.total` are not established: the Poseidon2 external matrix is not MDS by construction, and a full-round bound for it needs claims about the construction itself. Related subspace-trail criteria exist ([Grassi, Rechberger and Schofnegger](https://eprint.iacr.org/2020/500)); the contribution is a scoped formalization with reusable checked certificates.

## 3. Tighter activity bounds from checked search (proposed)

A search tool proposes low-activity trails; each is checked independently. A support-compatible trail, a realizable differential trail and a concrete fixed-key pair are different objects. A candidate bounds the minimum from above only in the model where its feasibility is checked; a stronger lower bound needs a proof or a checked completeness certificate. Not finding a trail proves nothing. The implementation optimizer in Cryptificate and a cryptanalytic trail search are different search problems.

## 4. S-box quality and probability under an explicit model (byte tables implemented; the rest proposed)

Bijectivity does not imply good differential behaviour. For byte S-boxes, a checked difference-distribution table gives exact local evidence; for large prime fields, structural proofs replace tables. Edited S-boxes inherit nothing from AES or fifth-power bounds.

*Implemented for byte S-boxes.* Every AES-like report has two claims about the submitted table (`lean/Cryptificate/Sbox/Quality.lean`):

- `sbox.differential`: the differential uniformity, the exact maximum over `a ≠ 0` and `b` of `#{x : S(x ⊕ a) ⊕ S(x) = b}`, stated over WideTrail's `diffCount`. `differentialUniformity F ≤ u` is WideTrail's `IsDiffUniform F u`, the hypothesis of its trail-probability theorems.
- `sbox.linearity`: the linearity, the exact maximum over `a` and `b ≠ 0` of `|∑ₓ (-1)^(a·x ⊕ b·S(x))|`. The usual nonlinearity is `128 − linearity / 2`; the certificate states the Walsh value.

Each claim states the value together with a pair attaining it, so both the bound and its sharpness are checked. The kernel evaluates the table packed into one natural number: each row of the difference table becomes 256 ten-bit counters tested against the bound with one addition and one mask, and for each output mask a fast Walsh-Hadamard transform in counting form computes all 256 input masks' disagreement counts in eight packed butterfly stages; the soundness of both encodings is proved once. A certificate for a submitted table checks both claims in about 11 s on one thread, of which about 4 s is loading the library; the AES S-box values (4 and 32) are checked once in the library. An edited AES table with two entries swapped has differential uniformity 6 (`SboxQualityEdited`).

These are properties of one table. They are not a bound on any trail, differential or linear hull of a cipher using it, and they do not depend on keys. Algebraic degree and boomerang uniformity are not checked.

*Proposed.* Prime-field power maps need structural proofs instead of tables (WideTrail has `x⁵` over BN254 only). A future report can combine charged activity, a local bound and the exact probability space into an individual-trail inequality. That is not a fixed-key bound, a hull bound or a security level.

## 5. Trails, hulls and real key schedules (proposed)

`Differential/Counts.diffCount_comp` writes a composition count as a sum over intermediate differences; its terms are joint counts, not products of local table entries. WideTrail's toy checks exhibit a differential with two contributing trails and the failure of the independent-key product formula at a fixed key. Next steps: interactive versions of these examples, exact reduced-size hull sums, aggregation bounds, and a specified key schedule with its induced distribution. Every probability statement must keep the distribution used in its proof.

## 6. Linear and algebraic cryptanalysis (proposed)

Linear cryptanalysis needs masks, correlations and dual linear-layer semantics; none of that exists yet, and circuit equivalence is not resistance to linear cryptanalysis. Algebraic analysis needs a model of polynomial relations and of the property bounded; a symbolic degree estimate is not an attack cost. Candidates: checked mask propagation, exact small-model correlations, invariant-subspace certificates, checked polynomial identities for reduced constructions ([Ashur, Buschman and Mahzoun, *Algebraic Cryptanalysis of HADES*](https://eprint.iacr.org/2023/537) is relevant background and does not imply the pinned instance is broken).

## 7. From the formal circuit to deployed code

The refinement chain above connects Rust source to the model. Strengthening it means verified code generation for searched circuits (today each generated variant is checked by tests, not refined), moving the native BN254 variants from arkworks to the proved Montgomery kernel (or verifying arkworks' arithmetic itself), and adapters for other implementation languages through the batch interface, for example OxCaml implementations studied by [FP Launchpad](https://fplaunchpad.org). Constant-time behaviour, fault resistance and leakage need their own models; memory safety and a good benchmark establish none of them.

## Reporting rules

Each report names the exact construction, field, operation order, property, assumptions, theorem or witness, input binding and the conclusions it does not support. Statuses stay separate: a proved property, a checked refutation, a property not established, an unsupported model. A timeout is an execution outcome, not a counterexample. Passing component checks establishes the named properties, never blanket resistance to attacks, a round-count recommendation or a number of security bits.

The adoption goal: another researcher submits a supported change, understands the evidence without writing Lean, and replays the exact claims independently.
