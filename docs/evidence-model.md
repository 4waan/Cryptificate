# Evidence model

Cryptificate reports claims, not scores. Every claim names one property of one exact input, the method that established it, and the scope in which it holds. This page explains how to read a report and what each kind of evidence does and does not tell you.

## Two chains

A report always shows two separate chains, because they answer separate questions.

| Chain | Question | Claims |
|---|---|---|
| **Design guarantees** | Does the *specification* have good diffusion? | `matrix.mds`, `offsets.dispersion`, `sbox.bijective`, `activity.bound` (HADES: `external.mds`, `internal.invertible`, `sbox.bijective`, `activity.outer`) |
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

## Evidence labels

| Label | What was checked | What it does not cover |
|---|---|---|
| Lean-checked proof | A Lean theorem about the exact submitted constants, checked by the Lean kernel. | Properties not named in the theorem. |
| Lean-checked circuit equivalence | `∀ x, eval(program, x) = M·x` for the exact program and matrix. | The generated Rust or the compiled binary. |
| Lean-checked counterexample | A concrete input whose property violation Lean evaluated. | Nothing beyond that witness. |
| Rust-source refinement (Aeneas) | The recorded Rust source, translated by Charon and Aeneas, equals the mathematical model for all inputs. | The Rust compiler, the translation tools themselves, the hardware, constant-time behaviour. |
| Generated Rust passed N correctness cases | The compiled variant matched an independent evaluation on N recorded inputs. | Inputs outside the corpus. It is a test, not a proof. |
| Native timing measured on this machine | Paired timings under the protocol in [batch-interface.md](batch-interface.md). | Other machines, other compilers, other workloads. |
| Unchecked diagnostic | A value computed by the engine that Lean has not checked. | Anything: it is a hint. |

## Origin badges

| Badge | Meaning |
|---|---|
| **Live** | Computed now, on this machine, for the inputs on screen. |
| **Cached exact result** | Reused from an earlier check whose canonical inputs, toolchain pins, checker version and templates all match. |
| **Recorded run** | Loaded from a recorded bundle. The public site only shows recorded runs; it does not run Lean or benchmarks in your browser. |

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
- The certificate generator is *not* trusted for soundness: the acceptance checks above catch a generator that proves the wrong statement or about the wrong constants.
- For Rust-source refinement: Charon, Aeneas and the Rust compiler. The refinement theorem is about the source, not the binary.
- For native correctness and timing: the harness, the operating system and the hardware. These results support statements about the recorded machine and workload only.

## What a report never claims

- A security level, a number of security bits, or a recommended round count.
- That fewer operations or a faster binary means a stronger cipher.
- That an MDS matrix is better than another MDS matrix. The activity figure is a conservative lower bound shared by every passing design.
- Constant-time execution, fault resistance or freedom from side channels.
- Global optimality of a searched circuit. The search reports the best *measured* among the *checked, shortlisted* candidates.
