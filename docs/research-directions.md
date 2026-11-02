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

The release includes a formal connection from Rust source to the mathematical model:

`recorded Rust source → Aeneas model → executable mathematical model → named properties`

For the GF(2⁸) kernels and the AES-like round it covers field arithmetic, S-box table lookup, state layout, round keys, linear layers and complete bounded round execution, with successful execution and equality to the specification for every input (for multi-round execution, given enough round keys). BN254 arithmetic and HADES rounds are not covered. Charon, Aeneas and the Rust compiler remain trusted. This does not establish machine-code correctness or constant-time execution. [refinement/STATUS.md](../refinement/STATUS.md) records which links are proved today.

## What the underlying library establishes

Cryptificate builds on the [WideTrail](https://github.com/4waan/Wide-Trail-formal-verification) Lean library:

- `Algebra/MDS`: an MDS matrix gives the optimal branch bound. `Algebra/AESMix` discharges the AES MixColumns case.
- `Propagation/Cipher`: activity lower bounds for supported support trails. `Propagation/Grid`: diffusion-optimal row rotations are exactly those with distinct offsets.
- `Hades/Schedule` models executions with fixed additions; `Hades/Bounds` proves activity contributed by full outer rounds under invertibility and branch hypotheses.
- `Differential`: exact differential-count identities, independent-round-key trail bounds, and small examples separating fixed-key from key-averaged behaviour.
- `Poseidon2/BN254`: bijectivity, external MDS mixing and an outer-round activity bound for the pinned width-three instance.

Cryptificate adds fresh-input certificates (canonical minors, checked counterexamples, offsets, activity instantiation, partial-round windows and bypasses), a universal circuit-equivalence checker, S-box and exponent certificates, an optimizer, a native measurement harness, the Rust refinement chain, and replayable bundles.

## 1. Audit diffusion changes and implementation substitutions

*Implemented.* Two equivalent circuits implement the same matrix and therefore have the same diffusion; a changed matrix needs fresh evidence. Cryptificate checks circuit equivalence, matrix properties and round-template prerequisites separately. A failing branch-bound claim comes with a checked nonzero `v` whose combined weight in `v` and `Mv` is too small; a circuit mismatch comes with a checked distinguishing input. Fewer operations or faster execution is not evidence of stronger security.

## 2. Partial rounds that miss a subspace

*Implemented for width-three HADES designs over BN254, as the claims `activity.partial` and `activity.total`.* Can a nonzero difference pass through a sequence of partial rounds without reaching an active S-box? Linear-layer choices affect middle-round behaviour even when every matrix is MDS ([Keller and Rosemarin, *Mind the Middle Layer*](https://eprint.iacr.org/2020/179)).

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

The engine finds the window length `L` by scanning the rows `eᵢ Mʲ` in order and keeping those that raise the rank, and finds a bypass as the null space of the stacked rows for `j` below the width, which is the largest subspace that every power of `M` keeps at zero on the mask. Neither computation is trusted: Lean checks the determinant, or the invariance and vanishing of the subspace, for the submitted matrix and mask.

### Scope and limits

The bound counts S-boxes with a nonzero input difference in two executions with the same round constants. It is neither a tightness result nor a security level, it says nothing about probabilities, and one charged S-box per window is all it extracts from the partial rounds; a sharper count of the partial rounds, or bounds across the boundary between full and partial rounds, would need a further argument. The certificates are written for width three over BN254, the only HADES width the tool accepts; the library lemmas other than `observable_of_rows3` hold at every width. Related subspace-trail criteria exist ([Grassi, Rechberger and Schofnegger](https://eprint.iacr.org/2020/500)); the contribution is a scoped formalization with reusable checked certificates.

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
