# Changelog

All notable changes to Cryptificate are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-11-07

Every package carries version 0.2.0: the Rust workspace crates, `@cryptificate/schema`, the server,
the web workbench, the Python client, both Lean packages (`lean/`, `refinement/`) and the OpenAPI
description. `cryptificate --version` prints `cryptificate 0.2.0 (<revision>)`, and the engine
`cryptificate-engine 0.2.0`.

Every new Lean theorem below has its axioms pinned with `#guard_msgs` to a subset of `propext`,
`Classical.choice` and `Quot.sound`. Nothing uses `sorry`, a new axiom, `native_decide` or
`bv_decide`.

### Added

#### Proofs from the Rust source (refinement package, Lean v4.35.0, Charon 0.1.294, Aeneas 74aabd5)

- **End-to-end AES theorem from the Rust kernel.** `aes_rust_activity_bound` (with `_exists`,
  `_10` and `_4`): for the AES MixColumns matrix, ShiftRows offsets `[0, 1, 2, 3]` and the FIPS 197
  S-box table, given as byte arrays, any two different input states and any round keys (at least
  `r`), both executions of the Aeneas model of `aes_like::encrypt` return normally and have at
  least `activityBound r` active S-boxes: at least 55 over 10 rounds and 25 over 4. There is no
  design hypothesis; the design checks are evaluated by the Lean kernel (`decide +kernel`).
- **Conditional theorem for any design.** `aes_like_encrypt_activity_bound_of_checks`: for any byte
  arrays `m`, `o`, `t`, the same bound holds whenever three Boolean checks on the bytes pass
  (`minors4Ok (matrixOf m)`, `offsetsDistinct o`, `tableCovers t`), each closable by
  `decide +kernel` for fixed bytes. `sboxOf_injective_iff` shows that an injective S-box is exactly
  a table without repeated entries.
- **AES final round, end to end.** Rust `aes_like::final_round` and
  `aes_like::encrypt_with_last_round` (no MixColumns in the last round, then a final key), with the
  FIPS 197 AES-128 known-answer vectors in the Rust tests. Lean model `aesLikeFinalRound` and
  `aesLikeCipher`, with `aesLikeCipherActiveSboxes_bound`: the bound over `r` rounds of the cipher,
  final round included, equals the bound of the first `r` rounds of the original model.
  Refinement: `aes_like_final_round_refines`, `aes_like_encrypt_with_last_round_refines` (given
  more than `rounds` keys), the activity bound under the three design hypotheses and under the
  three byte checks, and `aes_rust_cipher_activity_bound_10`: at least 55 active S-boxes over the
  ten rounds of the AES-128 data path for the AES byte arrays and any eleven or more keys, with no
  design hypothesis. A main-package example evaluates the model on FIPS 197 Appendix B and proves
  that it yields the standard's ciphertext.
- **BN254 Montgomery kernel.** `crates/kernels/src/bn254_mont.rs` (`mul` by CIOS, `add`, `sub`,
  `to_mont`, `from_mont` on four 64-bit limbs) is extracted and proved against WideTrail's
  `Poseidon2.BN254.F = ZMod p`: on canonical inputs (for `mul`, the first operand) the functions do
  not panic and return the canonical result of `a·b·R⁻¹`, `a + b` and `a − b` mod `p`;
  `to_mont` and `from_mont` compute `x·R` and `x·R⁻¹` mod `p` for any input. Rust tests compare the
  kernel with `ark_bn254::Fr` limb for limb.
- `refinement/claims.json` records 40 theorems in six kernels (`gf256`, `aes-like`,
  `aes-like-checked`, `aes-like-aes`, `gf256-crate`, `bn254-mont`). Theorems about the AES bytes are
  recorded under a kernel whose `appliesTo` names the AES design, and `claims.py` refuses to record
  them elsewhere.

#### Design claims (Lean-checked certificates, main package, Lean v4.33.1)

- **Partial rounds of HADES designs**, claims `activity.partial` and `activity.total`.
  `activity.partial` is proved by an observability certificate (every `L` consecutive partial
  rounds activate an S-box, for any round constants, with `L` at most the number of partial rounds)
  or refuted by a `partial-bypass` witness: a nonzero difference that reaches no partial-round S-box
  in any partial round. `activity.total` adds one active S-box per disjoint window of `L` partial
  rounds to the full-round bound. For the pinned Poseidon2 BN254 instance (width 3, 8 full and 56
  partial rounds, `L = 3`) this proves at least 16 + ⌊56/3⌋ = 34 active S-boxes over all 64 rounds.
  The example `poseidon2-bypass.json` (the external matrix reused as internal matrix) is refuted
  with the bypass `[0, 1, -1]`.
- **Prime-field profile** `hades/prime/v1`: HADES/Poseidon2 designs over BabyBear, KoalaBear,
  Mersenne31, Goldilocks or a custom prime below 2⁶⁴. New claim `field.prime`: the engine computes a
  Pratt certificate for the modulus and Lean checks it by kernel evaluation
  (`Pratt.prime_of_checkFlat`); the activity bounds require it. The modulus is echoed in every
  certificate and bound to the request. The same checker proves the four named primes and, as a
  cross-check, the BN254 modulus.
- **Poseidon2 widths 2, 3, 4, 8, 12, 16 and 24** in the prime-field profile. Up to width 4 the
  design claims are those of BN254 (branch number width + 1; width 2 through
  `Mat2.isMDS_of_minorsOk`). Above width 4 the engine computes witnesses modulo `p` and the kernel
  checks them, each vector packed into one numeral so that a dot product is one big-number product
  (`Packed.kron_eq`): inverse matrices for `internal.invertible` and the new `external.invertible`,
  the inverse of the observability rows for `activity.partial` (window `L = t`), orthogonality to
  those rows for a bypass, a low-weight vector that refutes `external.mds`, and the new claim
  `external.m4_mds` (the external matrix is `circ(2 M₄, M₄, …, M₄)` with `M₄` MDS; this does not
  claim that the full matrix is MDS). A refuted invertibility claim now carries a nonzero kernel
  vector as its witness (kind `kernel`, at every width and in the BN254 profile).
- **Plonky3 Poseidon2 instances** as example designs, workbench presets and Lean regression
  examples: BabyBear, KoalaBear and Mersenne31 at widths 16 and 24, Goldilocks at widths 8 and 12
  (Plonky3 commit `0d803737`). Lean proves both matrices invertible and `M₄` MDS and refutes the MDS
  property of the full external matrix. KoalaBear-16 and Goldilocks-8/12 charge every window of
  `t` partial rounds. BabyBear-16/24, Mersenne31-16/24 and KoalaBear-24 have fewer partial rounds
  than their width, so `activity.partial` is refuted for them: a statement about differences
  through the partial rounds alone, which says nothing about the full rounds.
- **Round-constant conformance**, claim `constants.grain` (BN254 and prime-field profiles): the
  kernel runs a transcription of the Poseidon2 reference procedure (Grain LFSR,
  `poseidon2_rust_params.sage` of HorizenLabs/poseidon2 at commit `055bde3`) for the design's
  modulus, width and round numbers and compares the result with the submitted constants; otherwise
  it proves the generated value at one differing position (`constant-mismatch` witness, the first
  difference as located by the engine). WideTrail's pinned BN254 constants are proved to be the
  Grain constants for `t = 3`, `R_F = 8`, `R_P = 56`, and Plonky3's KoalaBear width-16 constants
  are proved to be Grain constants. The claim is about provenance, not the quality of the constants.
- `cryptificate import FILE --base DESIGN.json` reads round constants from Plonky3 split arrays,
  HorizenLabs poseidon2 instances or printed lists, JSON or CSV into a copy of a design, in the
  Poseidon2 layout.
- **S-box quality**, claims `sbox.differential` and `sbox.linearity`: the exact differential
  uniformity and the exact linearity (largest absolute Walsh coefficient) of a submitted byte S-box
  table, each with a pair of bytes attaining it, checked with `decide +kernel` only. The AES values,
  4 and 32 (nonlinearity 112), are proved once in the library. These are value claims: `proved` or
  `not_established`, never `refuted`.

#### Tooling

- **CI gate.** `check` and `verify` take several files or patterns, `--fail-on
  none|refuted|not-established|any`, `--claims ID,...`, `--format
  text|json|sarif|junit|markdown|html` and `--output`, and append a Markdown summary to
  `GITHUB_STEP_SUMMARY`; `check --bundle-dir` writes one bundle per input. Exit status 0 passes,
  1 is a policy failure or a `verify` mismatch, 2 is an error. A new `report` command renders saved
  results, reports and bundles without running the engine or Lean. A composite GitHub Action
  (`action.yml`) builds the toolchain with caching, gates the job, uploads SARIF to code scanning
  (each result points at the design file, at the offending element where possible) and uploads the
  results, JUnit, HTML and bundles. See [docs/ci.md](docs/ci.md).
- **HTML evidence report.** A self-contained page (inline CSS, no scripts, no external requests, a
  restrictive Content-Security-Policy, the same bytes for the same report) from one renderer:
  `--format html`, `report.html` in every new bundle, `GET /api/jobs/{id}/report.html`,
  `Client.report_html` in Python and the workbench's **Export report** button. It shows the inputs,
  every claim with its statement, axioms and witness, and the provenance.
- **`cryptificate init`** scaffolds `cryptificate.json`, a design (presets `aes`, `aes-row-scaled`,
  `poseidon2-bn254`, optionally with a circuit) and a GitHub workflow; **`cryptificate doctor`**
  checks Node.js, elan, the pinned toolchain, Mathlib, the Lean build, the engine, rustc, the state
  directory, disk space and the service, and prints a fix for each problem. `check` without
  arguments reads its inputs, policy and claim scope from the nearest `cryptificate.json`
  (`--config FILE` names one; schema `schemas/project-config.schema.json`), and so does the action
  when its `inputs` is empty. `--uri-base DIR` sets the base of SARIF locations.
- **OpenAPI.** `schemas/openapi.json` describes the HTTP API (OpenAPI 3.1, seven operations, every
  error response, examples recorded from a live service); the service serves it self-contained at
  `GET /api/openapi.json`, and [docs/api.md](docs/api.md) documents the API with curl examples. New
  `schemas/error.schema.json`. The Python client has one method per operation (`Client.openapi()`,
  `OPERATIONS`, `CryptificateError.retry_after`, `python -m cryptificate job|stop|openapi`).
  `@cryptificate/schema` gains a dependency-free JSON Schema validator that fails on keywords it
  does not implement.
- **Container image.** A multi-stage `Dockerfile` with the pinned Lean toolchain, the built Lean
  library and Mathlib, the release engine, the Rust toolchain for native experiments, the service
  and the workbench; it runs as uid 1000 under `tini` with a health check. The `docker` workflow
  builds it, runs `scripts/docker-smoke.py` inside it and publishes the tested image to
  `ghcr.io/4waan/cryptificate` on `v*` tags. `serve` takes its bind address from `--host` or
  `CRYPTIFICATE_HOST` (loopback by default). See [docs/docker.md](docs/docker.md).
- **Workbench.**
  - A searchable presets library (designs, matrices, S-boxes and circuits, each with a scope
    note), including the prime-field and Plonky3 presets; a prime-field profile editor with a field
    picker, a custom modulus and a width picker.
  - Paste or import matrices in the notations of papers, C, Rust, Python, NumPy, Sage and LaTeX,
    and **Copy as** JSON, C, Rust, Sage or a plain grid.
  - Undo and redo, the workspace saved in the browser, story steps that keep the edits they
    replace, and share links that carry the design and circuit in the URL.
  - A term-by-term circuit generated from the matrix, and a live diff of the matrix the circuit
    computes against the target.
  - Instant browser previews, labelled *Preview (not yet checked by Lean)* and replaced by the Lean
    report for the same inputs; an opt-in auto-check 1.2 s after editing stops, which backs off
    when the service is busy; job progress with elapsed time, an estimate and the service budget,
    and optional notifications.
  - Keyboard shortcuts (Ctrl/Cmd+Enter, Esc, `?`) and a Ctrl/Cmd+K command palette.
  - A card for an offline service with `npm start` and automatic reconnection.
  - A width selector with experimental 3×3 and 2×2 AES-like designs.

### Changed

- `check` exits 2, not 1, when a run fails or times out, and on an uncaught internal error.
  Without a policy (`--fail-on`, or `failOn` in `cryptificate.json`, which defaults to `refuted`) a
  completed `check` still exits 0.
- New claims appear in fresh reports, and the claim and witness JSON Schemas gain their ids and
  witness kinds. `verify` lists a claim that a bundle recorded before the claim existed as
  `not recorded` instead of failing (see [docs/adopter-guide.md](docs/adopter-guide.md)); for the
  two S-box value claims it compares the value and the witness, not only the status.
- A proof-cache hit rebuilds `rust.refinement` from the current refinement status instead of
  copying it from the cached run. In the container (`CRYPTIFICATE_CONTAINER=1`) `rust.refinement`
  is never `proved`.
- The note on BN254 refinement names the reason there is no claim (the native BN254 variants call
  arkworks' `Fr`, which no proof covers); the status is still `unsupported`.
- HTTP API: requests are dispatched through one route table. A path that matches no operation
  answers 404 "no such endpoint" for GET and POST and 405 for other methods; a bundle request for a
  job that ended without a report answers 409 "the job ended before it produced a report"; a
  `400 invalid-request` response sets `error.path` to the first problem's JSON Pointer.
  `job.schema.json` gains the job summary and envelope definitions.

### Fixed

- A refuted `native.correctness` claim was labelled "Generated Rust passed N correctness cases"
  with N the passing cases, which reads like a pass. Fresh reports say "Generated Rust failed F of
  N correctness cases"; recorded bundles keep their label, and the schema accepts both.
- A refinement check recorded after a cached run did not show on later cache hits (see the
  proof-cache change above).
- `docs/batch-interface.md` describes the `inconclusive` timing verdict by the harness's rule, not
  as overlapping intervals or too few samples.
- The CLI test `command_line_handling` no longer fails at random when the engine exits before
  reading its input.
- The accessible title of the circuit wire diagram is rendered as one string.

### Known limitations

- **arkworks is not covered.** The native BN254 variants call `ark_bn254::Fr`, which the pinned
  Aeneas cannot translate, so the timed BN254 arithmetic is not the proved `bn254_mont` kernel and
  `rust.refinement` reads `unsupported` for BN254 circuits. Equality of the kernel's limbs with
  arkworks' is tested, not proved, and no Rust HADES or Poseidon2 round over BN254 is extracted
  (`notEstablished` in `refinement/claims.json`).
- The refinement theorems are about the Aeneas model of the Rust source (Charon, Aeneas and its
  library, rustc and the hardware are trusted), not about compiled code. The AES key expansion is
  not modelled; the theorems hold for every key sequence. The analysis service does not yet run the
  `_of_checks` theorems for submitted designs, and `rust.refinement` covers GF(2⁸) circuits only.
- All activity figures are lower bounds on active S-boxes for any round constants or keys, not
  trail probabilities, tightness results or security levels. S-box differential uniformity and
  linearity are properties of one byte table, for AES-like designs only; algebraic degree and
  boomerang uniformity are not checked.
- Above width 4, `activity.outer` and `activity.total` are not established (they need an MDS
  external matrix, and `circ(2 M₄, M₄, …, M₄)` is not MDS), and `external.mds` is only ever
  refuted. Plonky3's width-20 and width-32 instances are not offered. `activity.total` is not
  established for a design with no partial rounds.
- The prime-field profile has no circuits, circuit search, native timing or Rust refinement, and
  custom moduli must be below 2⁶⁴.
- `constants.grain` trusts the transcription of the reference script (tested against published
  constants, a second transcription and the engine, not derived from a semantics of Sage). Poseidon
  version 1, the inverse S-box and binary fields are not covered; reference constants with round
  numbers other than 8 and 56, and designs without constants, are not established; a refutation
  proves one differing position, not that every earlier constant agrees. The Plonky3 example
  designs ship without round constants.
- AES-like widths 3 and 2 are experimental: no certificate template covers them, so they get no
  Lean claim.
- The container image has not been built outside CI: the `docker` workflow is its first build.
  Only `linux/amd64` is built, the image is expected to exceed 10 GB, and it does not check the
  refinement proofs. The GitHub Action and the image workflow had not run on GitHub when 0.2.0 was
  tagged.
- The recorded bundles (`examples/bundles`, `apps/web/public/recorded`) and the OpenAPI examples
  were recorded before the version change and read `cryptificate 0.1.0`; the bundles predate the
  new claims (shown as `not recorded`) and `report.html` (render it with
  `cryptificate report <bundle> --format html`). `not recorded` depends on the recording revision
  being in the local git history or, for the S-box value claims, on the recorded certificate
  digest; bundles are not signed.
- Browser previews in the workbench are never evidence; only a Lean report for the same inputs
  replaces them.

[0.2.0]: https://github.com/4waan/Cryptificate/releases/tag/v0.2.0
