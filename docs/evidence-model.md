# Evidence model

Cryptificate reports claims, not scores. Every claim names one property of one exact input, the method that established it, and the scope in which it holds. This page explains how to read a report and what each kind of evidence does and does not tell you.

## Two chains

A report always shows two separate chains, because they answer separate questions.

| Chain | Question | Claims |
|---|---|---|
| **Design guarantees** | Does the *specification* have good diffusion? | `matrix.mds`, `offsets.dispersion`, `sbox.bijective`, `activity.bound`, `sbox.differential`, `sbox.linearity` (HADES: `external.mds`, `internal.invertible`, `sbox.bijective`, `activity.outer`, `activity.partial`, `activity.total`, `constants.grain`; over a 64-bit prime field `field.prime` first, and above width 4 `external.m4_mds` and `external.invertible` after `external.mds`) |
| **Implementation correspondence** | Does the *code* compute the specification? | `circuit.equivalence`, `rust.refinement`, `native.correctness`, `native.timing` |

A circuit can match its matrix perfectly while the matrix has weak diffusion (the identity example), and a matrix can be MDS while its circuit has a crossed wire (the wrong-wire example). Passing one chain says nothing about the other.

## Statuses

| Status | Meaning |
|---|---|
| `proved` | Lean checked a theorem stating the property for the exact submitted values. |
| `refuted` | Lean checked a concrete witness showing the property fails for the exact submitted values. |
| `not_established` | This method did not establish the property. It is not a counterexample. Downstream claims whose prerequisites failed land here. |
| `unsupported` | No method of this checker covers the claim for this input; today only `rust.refinement`, for BN254 circuits or a checkout without refinement proofs. |

Execution outcomes are reported separately: `completed`, `failed`, `timeout`, `cancelled`, `invalid`. A timeout or a crashed worker never turns into `refuted`.

A failed MDS check or a repeated row offset makes the activity bound **not established by this method**. It does not refute the bound: some other argument might still establish it.

Over a 64-bit prime field the activity bounds also need `field.prime`; without it they are not established.

Above width 4 (the Poseidon2 widths 8, 12, 16 and 24) the external matrix's minors are not enumerated. `external.mds` is refuted when a square submatrix of order at most 2 is singular, as it is for every Poseidon2 external matrix `circ(2 M₄, M₄, …, M₄)` of these widths, and is otherwise not established. Two claims say what is checked instead: `external.m4_mds` (the external matrix equals `circ(2 M₄, M₄, …, M₄)` for its `4 × 4` block `M₄`, and `M₄` is MDS; this is not the MDS property of the whole matrix) and `external.invertible` (an inverse matrix, checked by multiplication). `activity.outer` and `activity.total` need `external.mds` and are therefore not established at these widths; no theorem here bounds the full rounds through a matrix that is only invertible.

`activity.partial` is the one activity claim that can be refuted. Proved, it says that every window of `L` consecutive partial rounds of a HADES design activates an S-box for any two distinct states entering it, with `L` at most the number of partial rounds. Refuted, it comes with a nonzero difference that passes every partial round with no active S-box, whatever the round constants, and the refutation also states that the design has at least one partial round. A design with no partial rounds gets neither: `activity.partial` is then not established (out of scope), since a bypass of zero rounds would be vacuous. `activity.total` adds one active S-box per disjoint window to the full-round bound; it needs `external.mds`, `internal.invertible`, `sbox.bijective` and a proved `activity.partial`, and is otherwise not established.

`sbox.differential` and `sbox.linearity` state an exact value rather than a yes-or-no property, so they are `proved` or `not_established`, never `refuted`. A proved one carries the value and a pair of bytes attaining it, both repeated in the checked statement: the largest difference-table entry outside row 0 for an input difference and an output difference, and the largest absolute Walsh coefficient for an input mask and a nonzero output mask. They describe the S-box table alone and are not bounds on trails, differentials or linear hulls of the cipher.

## Claims

One row per claim id. "Proved" gives the Lean statement (or, outside Lean, the evidence); the certificate names every candidate value (`candMatrix`, `candModulus`, …), and the service compares those names' printed values with the request. Widths are those of the claim's certificate templates; any other input gets the claim as not established (`out-of-scope`).

| Claim | Proved means | Profiles and widths | Refuted with | Limits |
|---|---|---|---|---|
| `field.prime` | `Nat.Prime candModulus`, from a Pratt certificate (factorization of `p − 1` and a base of order `p − 1`) checked by kernel evaluation. | `hades/prime/v1`, every width | never refuted: a composite custom modulus is rejected as input | Says only that `p` is prime; every other claim of a prime-field certificate uses the field structure it gives, and the activity bounds need it proved. |
| `matrix.mds` | `IsMDS candMatrix`: all 69 square minors of the `4 × 4` matrix are nonzero. | AES-like, width 4 | `branch`: a nonzero `v` with weight of `v` plus weight of `Mv` below 5 | The matrix over GF(2⁸) with `0x11B`, nothing about a circuit. |
| `offsets.dispersion` | `DiffusionOptimal (gridCol 4 4) (shiftRowsPerm 4 4 candOffsets)`: the row offsets are pairwise distinct, so every column spreads to every column. | AES-like, width 4 | `offset-collision`: two rows with the same offset | The ShiftRows-style permutation alone. |
| `sbox.bijective` | AES-like: `Function.Bijective candSboxTable` (a left inverse checked on all 256 bytes). HADES: `Function.Bijective` of `x ↦ x^α` on the field (`PrimePower.ZModP.powMap candModulus candExponent` over a prime field). | every profile | `sbox-collision` (two bytes with one image) or `power-collision` (two field elements with one power) | A permutation, not a good S-box: see `sbox.differential` and `sbox.linearity`. |
| `sbox.differential` | `differentialUniformity candSboxTable = δ`, with an input difference `a ≠ 0` and output difference `b` whose count is `δ`; the `sbox-differential` witness repeats them. | AES-like (byte tables) | never refuted: an exact value, not a yes-or-no property | The table alone; no bound on differentials or trails of the cipher. |
| `sbox.linearity` | `linearity candSboxTable = L`: the largest absolute Walsh coefficient at a nonzero output mask, with masks attaining it (`sbox-linearity` witness). | AES-like (byte tables) | never refuted | The table alone; no bound on linear trails or hulls. |
| `activity.bound` | For every injective S-box, key sequence and pair of distinct inputs, the design's `r` rounds have at least `⌊r/4⌋·25 + (5 if r mod 4 ≥ 2)` active S-boxes. | AES-like, width 4 | never refuted | Attempted only after `matrix.mds`, `offsets.dispersion` and `sbox.bijective` are proved (else `precondition-failed`). Counts active S-boxes; says nothing about probabilities. |
| `external.mds` | `IsMDS candExternal`: every square minor of the external matrix is nonzero. | BN254 width 3; prime widths 2, 3 and 4 | `branch`: a nonzero `v` with too small a combined weight in `v` and `Mv`; above width 4 a singular submatrix of order at most 2, shown the same way | Above width 4 the minors are not enumerated: refuted or not established, never proved (see below). |
| `external.m4_mds` | `candExternal = Hades.poseidon2External t M₄ ∧ IsMDS M₄`: the external matrix is `circ(2 M₄, M₄, …, M₄)` and its block `M₄` is MDS. | prime widths 8, 12, 16 and 24 | `branch` witness for `M₄` (the block structure still proved) | Not the MDS property of the whole matrix. A matrix of another form gets it as not established. |
| `external.invertible` | `candExternal.det ≠ 0`, from an inverse matrix checked by packed multiplication. | prime widths 8, 12, 16 and 24 | `kernel`: a nonzero `x` with `Mx = 0` | Invertibility only. |
| `internal.invertible` | `candInternal.det ≠ 0`: by the determinant formula at widths 3 and 4, from an inverse matrix checked by packed multiplication at the other widths. | every HADES width | `kernel`: a nonzero `x` with `Mx = 0` | Invertibility only; the partial rounds are `activity.partial`. |
| `activity.outer` | For every mask, round constants and pair of distinct states, the full rounds have at least the HADES full-round bound of active S-boxes (branch number `t + 1` per pair of rounds). | BN254 width 3; prime widths 2, 3 and 4 | never refuted | Attempted only after `external.mds`, `internal.invertible`, `sbox.bijective` (and `field.prime`) are proved. Partial rounds are not counted. Not established above width 4. |
| `activity.partial` | Every window of `L` consecutive partial rounds activates an S-box, for any round constants, with `L` at most the number of partial rounds (rows `eᵢ Mʲ` with nonzero determinant or a checked inverse). | BN254 width 3; every prime width | `partial-bypass`: a nonzero difference that every partial round keeps at zero on the S-box positions | About the partial rounds alone. Expected to be refuted when there are fewer partial rounds than the width. A design with no partial rounds gets it as not established. |
| `activity.total` | The full-round bound plus one active S-box per disjoint window of `L` partial rounds, for any round constants. | BN254 width 3; prime widths 2, 3 and 4 | never refuted | Needs everything `activity.outer` needs and a proved `activity.partial`. |
| `constants.grain` | `Grain.poseidon2Constants candModulus t R_F R_P = some candConstants`: the constants are those of the Poseidon2 reference procedure (see below). | every HADES width, with explicit constants (BN254 also with the reference constants) | `constant-mismatch`: a position and the value the procedure generates there | Provenance, not security. Not established without constants. |
| `circuit.equivalence` | `candProgram.WellFormed ∧ ∀ x, candProgram.eval x = candMatrix.mulVec x` (or the BN254 external or internal matrix). | AES-like width 4; BN254 width 3 | `distinguishing-input`: an input, the matrix's output and the circuit's | The circuit model, not the compiled code. `not-run` without a circuit; no circuits over the 64-bit prime fields. |
| `native.correctness` | Not Lean: the generated Rust matched an independent evaluation on every test vector (label "Generated Rust passed N correctness cases"). | GF(2⁸) and BN254 circuits | `distinguishing-input` from a failing test vector | Testing, not a proof. `not-run` without a circuit, `native-unavailable` without a Rust toolchain. |
| `rust.refinement` | Not a certificate: the Aeneas refinement proofs of the GF(2⁸) kernels, checked on this machine by `scripts/setup.sh --with-refinement` while the kernel source keeps the extracted digest. | GF(2⁸) circuits | never refuted | Covers the arithmetic primitives the generated code calls, not the circuit code. `unsupported` for BN254 circuits (arkworks `Fr`) and for a checkout without the proofs; not established when the proofs were not checked here. |
| `native.timing` | Never proved in an analysis: it is always not established there (`not-run`, or `out-of-scope` over the 64-bit prime fields). Experiments measure timing and report their verdict in the experiment report, under the protocol in [batch-interface.md](batch-interface.md). | experiments on GF(2⁸) and BN254 matrices | never refuted | The recorded machine, compiler and workloads. |

### Why a claim is not established

A claim that is not established carries a machine-readable `reason` beside its note:

| Reason | Meaning |
|---|---|
| `not-run` | The run does not attempt the claim by design: no circuit was submitted, or timing in an analysis. CI policies skip these unless `--claims` names them ([ci.md](ci.md)). |
| `out-of-scope` | No certificate template or method covers this input (an experimental width, a design without round constants, the implementation chain over the 64-bit prime fields). |
| `precondition-failed` | A claim it needs was not proved (the activity bounds). |
| `lean-failed`, `lean-timeout`, `cancelled` | The Lean run failed, ran out of time or was stopped. Never a refutation. |
| `audit-missing-theorem`, `audit-type-mismatch`, `audit-forbidden-axiom`, `audit-input-mismatch` | Lean ran, but the result failed one of the [acceptance checks](#proof-acceptance). |
| `lean-unavailable`, `engine-unavailable`, `native-unavailable` | A tool was missing. Under a CI policy this is an error, never a pass. |

## Round constants: provenance, not security

Every other HADES claim holds for all round constants. `constants.grain` is the one claim about the constants themselves, and it is a statement about where they come from: that they are exactly the numbers the Poseidon2 reference procedure generates for the design's modulus `p`, width `t`, `R_F` full and `R_P` partial rounds. It says nothing about whether those constants, or that procedure, make the design secure.

The procedure is the one of `poseidon2_rust_params.sage` in [HorizenLabs/poseidon2](https://github.com/HorizenLabs/poseidon2) at commit `055bde3f4782731ba5f5ce5888a440a94327eaf3`, which shares its Grain LFSR with `generate_parameters_grain.sage` of the Poseidon reference ([hadeshash](https://extgit.isec.tugraz.at/krypto/hadeshash), commit `208b5a164c6a252b137997694d90931b2bb851c5`): an 80-bit register seeded with `FIELD = 1` (2 bits), `SBOX = 0` (4 bits), the bit length `n` of `p` (12 bits), `t` (12), `R_F` (10), `R_P` (10) and 30 ones; 160 clocks discarded; the self-shrinking generator; `n`-bit candidates, most significant bit first, redrawn while `≥ p`. The layout is Poseidon2's: `R_F·t + R_P` constants, each partial-round constant followed by `t − 1` zeros, so that row `r` of `t` numbers holds the constants added in round `r`. The exponent `α` is not part of the seed. Poseidon (version 1), with `t` constants per partial round, the S-box `x⁻¹` (`SBOX = 1`) and binary fields are outside the model.

- **Proved**: Lean evaluates `Grain.poseidon2Constants p t R_F R_P` in the kernel and obtains `some candConstants`, the submitted constants read row by row; the certificate prints `candConstants` back for comparison with the request. For the BN254 profile's reference constants the certificate reuses the library theorem `Grain.bn254_reference`, which proves WideTrail's pinned table equal to the generated one for `t = 3`, `R_F = 8`, `R_P = 56`.
- **Refuted**: Lean evaluates `Grain.constantAt p t R_F R_P i = some e` (the procedure runs to completion and generates `e` at flat position `i`) and checks that the submitted list does not have `e` there. Together these imply that the constants are not the generated ones (`Grain.ne_of_constantAt`). The witness names the round, the position and both values: `i` and `e` are those of the checked statement, and the service keeps the witness only if `round · t + position = i` and the submitted value it names is the one at that position of the request. That `i` is the *first* difference is the engine's computation and is not checked; the theorem is about position `i` alone.
- **Not established**: the design gives no constants, or names the reference constants with round numbers other than `R_F = 8`, `R_P = 56`.

What is trusted is the transcription: that `Grain.poseidon2Constants` computes what the reference scripts compute. It is not derived from a formal semantics of Sage. The library tests it: it reproduces WideTrail's pinned BN254 constants in the kernel, and the published BabyBear (`RC16`) and Goldilocks (`RC8`) constants of HorizenLabs/poseidon2 and the KoalaBear width-16 constants of Plonky3 in compiled tests; a second, clock-by-clock transcription agrees with it on several instances; and the engine's independent Rust implementation, used only to predict the result and to find the first difference, agrees with both.

## The field is part of every claim

Every claim is a statement about values in one exact field: `GF(2⁸)` with the polynomial `0x11B`, the BN254 scalar field (`hades/bn254/v1`), or `ZMod p` for the modulus `p` of a `hades/prime/v1` design. The same matrix can be MDS modulo one prime and not modulo another, and `x ↦ x³` is a permutation of KoalaBear but not of BabyBear, so a claim never transfers to another modulus.

For the prime-field profile the modulus is therefore stated in the normalized request (a named field such as `koalabear` is filled in with its modulus), it is part of the input digest, and the certificate prints it back (`candModulus`) for comparison with the request. The service derives the expected `candModulus` from the request itself (from the field preset if a design names one without stating the modulus), never from the engine. Every claim's printed statement names `candModulus`, or names `candExternal` or `candInternal`, which the certificate defines as matrices over `ZMod candModulus`, so the statement check also ties each claim to that field; for `sbox.bijective` this is why the statement is about `PrimePower.ZModP.powMap candModulus candExponent` rather than a bare `fun x => x ^ candExponent`, whose printed form would not show its domain. Its primality is a claim of its own, `field.prime`: the engine computes a Pratt certificate (the factorization of `p - 1` and a base of order `p - 1`, recursively for the large factors), and Lean checks it by kernel evaluation of one Boolean function (`Cryptificate.Pratt.prime_of_checkFlat`). Every other claim of the certificate uses the field structure on `ZMod p` that this proof provides, so a certificate whose primality proof failed proves nothing else either. The engine's own primality test (Miller–Rabin with twelve fixed bases, exact below `2⁶⁴`) only decides whether a custom modulus is accepted as input; it is never evidence.

## Evidence labels

| Label | What was checked | Scope |
|---|---|---|
| Lean-checked proof | A Lean theorem about the exact submitted constants, checked by the Lean kernel. | The property named in the theorem. |
| Lean-checked circuit equivalence | `∀ x, eval(program, x) = M·x` for the exact program and matrix. | The circuit model; the generated Rust is covered by native correctness. |
| Lean-checked counterexample | A concrete input whose property violation Lean evaluated. | That witness. |
| Rust-source refinement (Aeneas) | The recorded Rust source, translated by Charon and Aeneas, equals the mathematical model for all inputs. | Rust source, with Charon and Aeneas as the translation. |
| Generated Rust passed N correctness cases | The compiled variant matched an independent evaluation on N recorded inputs. | The recorded corpus. |
| Generated Rust failed F of N correctness cases | The compiled variant disagreed with the independent evaluation on F of N inputs; the claim is refuted and the witness is one failing input. Reports recorded before 0.2.0 label a refuted run "Generated Rust passed N correctness cases" with N the passing cases; read the status, not the label. | The recorded corpus. |
| Native timing measured on this machine | Paired timings under the protocol in [batch-interface.md](batch-interface.md). | The recorded machine, compiler and workloads. |
| Unchecked diagnostic | A value computed by the engine before Lean checks it. | A hint that guides certificate generation. |

## Origin badges

| Badge | Meaning |
|---|---|
| **Live** | Computed now, on this machine, for the inputs on screen. |
| **Cached exact result** | Reused from an earlier check whose canonical inputs, toolchain pins, checker version and templates all match. The `rust.refinement` claim is recomputed for this machine, not reused. |
| **Recorded run** | Replayed from a recorded bundle without a running service; nothing was checked now. |

Editing any input marks every result as belonging to an earlier version until it is checked again.

## Proof acceptance

A Lean process exiting with status 0 is not enough. The service accepts a certificate only when:

1. every expected theorem is present under its expected name;
2. its printed type equals the expected type, which mentions the exact candidate constants;
3. Lean's own evaluation of those constants equals the normalized request (no silent edits between request and proof);
4. the transitive axiom set of each headline theorem is a subset of `propext`, `Classical.choice`, `Quot.sound`.

Certificates use kernel evaluation (`decide`, `rfl`) on small concrete computations. They never use `native_decide` or `bv_decide`, which rely on `Lean.ofReduceBool` and so trust the whole Lean compiler rather than only the kernel ([Lean reference: axioms](https://lean-lang.org/doc/reference/latest/Axioms/)).

## Trusted base

- The Lean kernel and the statements of the WideTrail definitions (`GF256`, `IsMDS`, `weight`, the trail specification). These definitions are the mathematical model; read them.
- For the prime-field profile, Mathlib's `ZMod p`, `Nat.Prime` and `lucas_primality`, through which the Pratt checker's acceptance becomes primality.
- The certificate generator is *not* trusted for soundness: the acceptance checks above catch a generator that proves the wrong statement or about the wrong constants.
- For Rust-source refinement: Charon, Aeneas and the Rust compiler. The refinement theorem is about the source, not the binary.
- For native correctness and timing: the harness, the operating system and the hardware. These results support statements about the recorded machine and workload only.
