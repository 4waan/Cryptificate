## Cryptificate check

**Result: error** (policy `--fail-on refuted`, exit 2)

### `examples/bundles/aes-wrong-wire/report.json`

Run completed, live. Inputs `sha256:fb9a76f86cec3c4047858db76c1f6e3b2ea8ce785ddefc6480b1858609b0b698`. Checker `cryptificate 0.1.0 (58e2000)`, Lean `v4.33.1`.

| Claim | Status | Evidence | Note |
| --- | --- | --- | --- |
| `matrix.mds` Matrix is MDS (branch number 5) | proved | Lean-checked proof | Lean checked CryptificateJob.matrix_mds using only the standard axioms. |
| `offsets.dispersion` Row offsets are pairwise distinct | proved | Lean-checked proof | Lean checked CryptificateJob.offsets_optimal using only the standard axioms. |
| `sbox.bijective` S-box is a permutation | proved | Lean-checked proof | Lean checked CryptificateJob.sbox_bijective using only the standard axioms. |
| `activity.bound` At least 25 active S-boxes over 4 rounds | proved | Lean-checked proof | Lean checked CryptificateJob.activity_bound using only the standard axioms. |
| `circuit.equivalence` Circuit computes the design matrix | **refuted** (fails policy) | Lean-checked counterexample | Lean checked a counterexample (CryptificateJob.circuit_mismatch). |
| `native.correctness` Generated Rust matches the reference | **refuted** (fails policy) | Generated Rust passed 549 correctness cases | 8666 of 9215 cases gave a wrong output. |
| `rust.refinement` Rust kernel refines the Lean model | proved | Rust-source refinement (Aeneas) | The GF(2^8) primitives add, xtime and mul of crates/kernels, extracted with Charon and Aeneas, refine the Lean field operations; Lean checked these proofs on this machine. They cover the arithmetic primitives the generated code calls, not the generated circuit code itself, which native correctness tests. |
| `native.timing` Native speed on this machine | not established (outside policy) | Unchecked diagnostic | Timing is measured by experiments, not by an analysis. |

- Counterexample for `circuit.equivalence`: `input [00,01,00,00]: expected [03,02,01,01], got [01,02,01,01]`
- Counterexample for `native.correctness`: `input [00,01,00,00]: expected [03,02,01,01], got [01,02,01,01]`

### `examples/bundles/repeated-offsets/report.json`

Run completed, live. Inputs `sha256:bebdfa5462bb404ea88ecaba48d6b5d1dfc10bdc052f259a6055f49db9b9668f`. Checker `cryptificate 0.1.0 (e74b8e6)`, Lean `v4.33.1`.

| Claim | Status | Evidence | Note |
| --- | --- | --- | --- |
| `matrix.mds` Matrix is MDS (branch number 5) | proved | Lean-checked proof | Lean checked CryptificateJob.matrix_mds using only the standard axioms. |
| `offsets.dispersion` Row offsets are pairwise distinct | **refuted** (fails policy) | Lean-checked counterexample | Lean checked a counterexample (CryptificateJob.offsets_not_optimal). |
| `sbox.bijective` S-box is a permutation | proved | Lean-checked proof | Lean checked CryptificateJob.sbox_bijective using only the standard axioms. |
| `activity.bound` At least 25 active S-boxes over 4 rounds | not established | Unchecked diagnostic | Not established by this method: the bound needs distinct row offsets to be proved first. This is not a refutation. |
| `circuit.equivalence` Circuit computes the design matrix | not established (outside policy) | Unchecked diagnostic | No circuit was submitted. |
| `native.correctness` Generated Rust matches the reference | not established (outside policy) | Unchecked diagnostic | No circuit was submitted. |
| `rust.refinement` Rust kernel refines the Lean model | not established (outside policy) | Unchecked diagnostic | No circuit was submitted. |
| `native.timing` Native speed on this machine | not established (outside policy) | Unchecked diagnostic | Timing is measured by experiments, not by an analysis. |

- Counterexample for `offsets.dispersion`: `rows 1,2 share offset 1`

### `examples/bundles/poseidon2-exponent3/report.json`

Run completed, live. Inputs `sha256:2d4b9dbd85162913aa429ae62cf899ec6e718064afd6af79e07db40af81aa7f4`. Checker `cryptificate 0.1.0 (e74b8e6)`, Lean `v4.33.1`.

| Claim | Status | Evidence | Note |
| --- | --- | --- | --- |
| `external.mds` External matrix is MDS (branch number 4) | proved | Lean-checked proof | Lean checked CryptificateJob.external_mds using only the standard axioms. |
| `internal.invertible` Internal matrix is invertible | proved | Lean-checked proof | Lean checked CryptificateJob.internal_invertible using only the standard axioms. |
| `sbox.bijective` Power S-box is a permutation | **refuted** (fails policy) | Lean-checked counterexample | Lean checked a counterexample (CryptificateJob.power_not_injective). |
| `activity.outer` Active S-box bound for the full rounds | not established | Unchecked diagnostic | Not established by this method: the bound needs a bijective S-box to be proved first. This is not a refutation. |
| `circuit.equivalence` Circuit computes the design matrix | proved | Lean-checked circuit equivalence | Lean checked CryptificateJob.circuit_equivalence using only the standard axioms. |
| `native.correctness` Generated Rust matches the reference | proved | Generated Rust passed 8278 correctness cases | Generated Rust matched the independently computed matrix product on all 8278 test vectors. This is testing, not a proof. |
| `rust.refinement` Rust kernel refines the Lean model | unsupported | Unchecked diagnostic | Refinement proofs exist for the GF(2^8) kernels only; BN254 arithmetic is not covered. |
| `native.timing` Native speed on this machine | not established (outside policy) | Unchecked diagnostic | Timing is measured by experiments, not by an analysis. |

- Counterexample for `sbox.bijective`: `1^3 = 4407920970296243842393367215006156084916469457145843978461^3 (omega^3 = 1 = 1^3, where omega = 3^((p-1)/3) is not 1)`

### `examples/designs/missing.json`

Error: cannot read examples/designs/missing.json: ENOENT

A claim that is not established is not a refutation. Statuses and evidence labels are defined in the [evidence model](https://github.com/4waan/Cryptificate/blob/main/docs/evidence-model.md).
