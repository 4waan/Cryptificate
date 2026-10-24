# Cipher-security research directions

Cryptificate checks the consequences of changes to supported cryptographic components. This note separates what the tool checks today from research directions it is built to grow into. Proposed work is marked as such; nothing here is a security-level claim.

## Scope of the current release

Cryptificate certifies components first. Two profiles are checked and tested:

| Profile | Field | Width | Round template |
|---|---|---|---|
| AES-like | GF(2⁸), polynomial `0x11B` | 4 | pre-addition, byte S-box, row shifting, column mixing; 4 to 32 rounds |
| HADES | BN254 scalar field | 3 | initial external mixing, then full / partial / full rounds with pre-addition; up to 160 rounds |

The engine's representation accepts widths two through four. Other profile and width pairs are experimental until their checks exist.

Fields are fixed. Editable within each template's fixed operation order: matrices, row offsets, round counts, byte S-box tables, prime-field power exponents, partial-round masks and explicit constant arrays. Constant arrays must match the submitted schedule exactly; they are never extended silently. An edited reference configuration is reported as a variant.

The exact GF(2⁸) polynomial and prime modulus are part of every claim's meaning. The BN254 profile uses

```text
21888242871839275222246405745257275088548364400416034343698204186575808495617
```

### Implementation assurance is part of the scope

The release requires a formal connection from Rust source to the mathematical model:

`recorded Rust source → Aeneas model → executable mathematical model → named properties`

It covers arithmetic, S-box evaluation, state layout, constants, linear layers and complete bounded round execution, with successful execution and equality to the specification for valid inputs. Charon, Aeneas and the Rust compiler remain trusted. This does not establish machine-code correctness or constant-time execution. [refinement/STATUS.md](../refinement/STATUS.md) records which links are proved today.

## What the underlying library establishes

Cryptificate builds on the [WideTrail](https://github.com/4waan/Wide-Trail-formal-verification) Lean library:

- `Algebra/MDS`: an MDS matrix gives the optimal branch bound. `Algebra/AESMix` discharges the AES MixColumns case.
- `Propagation/Cipher`: activity lower bounds for supported support trails. `Propagation/Grid`: diffusion-optimal row rotations are exactly those with distinct offsets.
- `Hades/Schedule` models executions with fixed additions; `Hades/Bounds` proves activity contributed by full outer rounds under invertibility and branch hypotheses.
- `Differential`: exact differential-count identities, independent-round-key trail bounds, and small examples separating fixed-key from key-averaged behaviour.
- `Poseidon2/BN254`: bijectivity, external MDS mixing and an outer-round activity bound for the pinned width-three instance.

Cryptificate adds fresh-input certificates (canonical minors, checked counterexamples, offsets, activity instantiation), a universal circuit-equivalence checker, S-box and exponent certificates, an optimizer, a native measurement harness, the Rust refinement chain, and replayable bundles.

## 1. Audit diffusion changes and implementation substitutions

*Implemented.* Two equivalent circuits implement the same matrix and therefore have the same diffusion; a changed matrix needs fresh evidence. Cryptificate checks circuit equivalence, matrix properties and round-template prerequisites separately. A failing branch-bound claim comes with a checked nonzero `v` whose combined weight in `v` and `Mv` is too small; a circuit mismatch comes with a checked distinguishing input. Fewer operations or faster execution is not evidence of stronger security.

## 2. Partial rounds that miss a subspace (proposed)

Can a nonzero difference pass through a sequence of partial rounds without reaching an active S-box? Linear-layer choices affect middle-round behaviour even when every matrix is MDS ([Keller and Rosemarin, *Mind the Middle Layer*](https://eprint.iacr.org/2020/179)).

A concrete example over the pinned prime field: use

```text
M = [2 1 1]      v = [0, 1, -1]
    [1 2 1]
    [1 1 2]
```

as the repeated internal matrix of a partial round whose S-box touches only coordinate 0. Then `Mv = v` and `v₀ = 0`, so two states differing by `v` feed equal values to the only S-box, and the difference stays `v` forever. This matrix is the pinned *external* matrix; using it as the internal matrix is a deliberately different construction. The pinned internal matrix is `[[2,1,1],[1,2,1],[1,1,3]]`.

Mechanism to build: constrain every active S-box coordinate to zero difference at its round input; along such a path differences propagate linearly, so the constraints are products of round matrices. An external analyzer proposes a kernel vector or basis; Lean checks nonzeroness, the constraints and the propagation theorem. A zero kernel only rules out this particular bypass under the modeled constraints.

### A stronger-bound target (proposed, not proved)

With only coordinate 0 nonlinear and a repeated matrix `M`, stack `O_L = [e₀; e₀M; …; e₀M^(L-1)]`. If `O_L` has full column rank, no nonzero difference keeps the active coordinate zero for `L` consecutive partial rounds. For the pinned internal matrix,

```text
O_3 = [1 0 0]
      [2 1 1]      det(O_3) = 1
      [6 5 6]
```

which suggests at least one charged S-box per three consecutive partial rounds: 18 disjoint blocks in 56 partial rounds, plus the 16 outer-round applications already proved, for a total lower bound of **34** on actual distinct execution pairs. This is a target: the inactivity lemma, rank implication, schedule indices, disjoint block sum and the combination with the outer bound are not yet proved in Lean. It is neither a tightness result nor a security level. Related subspace-trail criteria exist ([Grassi, Rechberger and Schofnegger](https://eprint.iacr.org/2020/500)); the contribution would be a scoped formalization with reusable checked certificates.

## 3. Tighter activity bounds from checked search (proposed)

A search tool proposes low-activity trails; each is checked independently. A support-compatible trail, a realizable differential trail and a concrete fixed-key pair are different objects. A candidate bounds the minimum from above only in the model where its feasibility is checked; a stronger lower bound needs a proof or a checked completeness certificate. Not finding a trail proves nothing. The implementation optimizer in Cryptificate and a cryptanalytic trail search are different search problems.

## 4. S-box quality and probability under an explicit model (proposed)

Bijectivity does not imply good differential behaviour. For byte S-boxes, a checked difference-distribution table gives exact local evidence; for large prime fields, structural proofs replace tables. Edited S-boxes inherit nothing from AES or fifth-power bounds. A future report can combine charged activity, a local bound and the exact probability space into an individual-trail inequality. That is not a fixed-key bound, a hull bound or a security level.

## 5. Trails, hulls and real key schedules (proposed)

`Differential/Counts.diffCount_comp` writes a composition count as a sum over intermediate differences; its terms are joint counts, not products of local table entries. WideTrail's toy checks exhibit a differential with two contributing trails and the failure of the independent-key product formula at a fixed key. Next steps: interactive versions of these examples, exact reduced-size hull sums, aggregation bounds, and a specified key schedule with its induced distribution. Every probability statement must keep the distribution used in its proof.

## 6. Linear and algebraic cryptanalysis (proposed)

Linear cryptanalysis needs masks, correlations and dual linear-layer semantics; none of that exists yet, and circuit equivalence is not resistance to linear cryptanalysis. Algebraic analysis needs a model of polynomial relations and of the property bounded; a symbolic degree estimate is not an attack cost. Candidates: checked mask propagation, exact small-model correlations, invariant-subspace certificates, checked polynomial identities for reduced constructions ([Ashur, Buschman and Mahzoun, *Algebraic Cryptanalysis of HADES*](https://eprint.iacr.org/2023/537) is relevant background and does not imply the pinned instance is broken).

## 7. From the formal circuit to deployed code

The refinement chain above connects Rust source to the model. Strengthening it means verified code generation for searched circuits (today each generated variant is checked by tests, not refined), verification of the arkworks Montgomery arithmetic used for BN254, and adapters for other implementation languages through the batch interface, for example OxCaml implementations studied by [FP Launchpad](https://fplaunchpad.org). Constant-time behaviour, fault resistance and leakage need their own models; memory safety and a good benchmark establish none of them.

## Reporting rules

Each report names the exact construction, field, operation order, property, assumptions, theorem or witness, input binding and the conclusions it does not support. Statuses stay separate: a proved property, a checked refutation, a property not established, an unsupported model. A timeout is an execution outcome, not a counterexample. Passing component checks establishes the named properties, never blanket resistance to attacks, a round-count recommendation or a number of security bits.

The adoption goal: another researcher submits a supported change, understands the evidence without writing Lean, and replays the exact claims independently.
