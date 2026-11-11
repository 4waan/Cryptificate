# Evidence model

Cryptificate reports claims, not scores. Every claim names one property of one exact input, the method that established it, and the scope in which it holds. This page explains how to read a report and what each kind of evidence does and does not tell you.

## Two chains

A report always shows two separate chains, because they answer separate questions.

| Chain | Question | Claims |
|---|---|---|
| **Design guarantees** | Does the *specification* have good diffusion? | `matrix.mds`, `offsets.dispersion`, `sbox.bijective`, `activity.bound`, `sbox.differential`, `sbox.linearity` (HADES: `external.mds`, `internal.invertible`, `sbox.bijective`, `activity.outer`, `activity.partial`, `activity.total`; over a 64-bit prime field `field.prime` first) |
| **Implementation correspondence** | Does the *code* compute the specification? | `circuit.equivalence`, `rust.refinement`, `native.correctness`, `native.timing` |

A circuit can match its matrix perfectly while the matrix has weak diffusion (the identity example), and a matrix can be MDS while its circuit has a crossed wire (the wrong-wire example). Passing one chain says nothing about the other.

## Statuses

| Status | Meaning |
|---|---|
| `proved` | Lean checked a theorem stating the property for the exact submitted values. |
| `refuted` | Lean checked a concrete witness showing the property fails for the exact submitted values. |
| `not_established` | This method did not establish the property. It is not a counterexample. Downstream claims whose prerequisites failed land here. |
| `unsupported` | The input is outside the supported model (for example a width without release checks). |

Execution outcomes are reported separately: `completed`, `failed`, `timeout`, `cancelled`, `invalid`. A timeout or a crashed worker never turns into `refuted`.

A failed MDS check or a repeated row offset makes the activity bound **not established by this method**. It does not refute the bound: some other argument might still establish it.

Over a 64-bit prime field the activity bounds also need `field.prime`; without it they are not established.

`activity.partial` is the one activity claim that can be refuted. Proved, it says that every window of `L` consecutive partial rounds of a HADES design activates an S-box for any two distinct states entering it, with `L` at most the number of partial rounds. Refuted, it comes with a nonzero difference that passes every partial round with no active S-box, whatever the round constants, and the refutation also states that the design has at least one partial round. A design with no partial rounds gets neither: `activity.partial` is then not established (out of scope), since a bypass of zero rounds would be vacuous. `activity.total` adds one active S-box per disjoint window to the full-round bound; it needs `external.mds`, `internal.invertible`, `sbox.bijective` and a proved `activity.partial`, and is otherwise not established.

`sbox.differential` and `sbox.linearity` state an exact value rather than a yes-or-no property, so they are `proved` or `not_established`, never `refuted`. A proved one carries the value and a pair of bytes attaining it, both repeated in the checked statement: the largest difference-table entry outside row 0 for an input difference and an output difference, and the largest absolute Walsh coefficient for an input mask and a nonzero output mask. They describe the S-box table alone and are not bounds on trails, differentials or linear hulls of the cipher.

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
| Native timing measured on this machine | Paired timings under the protocol in [batch-interface.md](batch-interface.md). | The recorded machine, compiler and workloads. |
| Unchecked diagnostic | A value computed by the engine before Lean checks it. | A hint that guides certificate generation. |

## Origin badges

| Badge | Meaning |
|---|---|
| **Live** | Computed now, on this machine, for the inputs on screen. |
| **Cached exact result** | Reused from an earlier check whose canonical inputs, toolchain pins, checker version and templates all match. The `rust.refinement` claim is recomputed for this machine, not reused. |

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
