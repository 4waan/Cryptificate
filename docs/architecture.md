# Architecture

Cryptificate is a local application. A loopback Node service orchestrates three kinds of subprocess: the Rust engine, the Lean checker and native benchmark builds. There is no database and no account system.

```text
 browser (React workbench)          python / CLI
          │  same-origin HTTP            │
          ▼                              ▼
 ┌──────────────────────────────────────────────┐
 │ apps/server  (127.0.0.1, one heavy worker,   │
 │  ≤ 2 queued jobs, proof cache, bundles)      │
 └───────┬───────────────┬───────────────┬──────┘
         │ JSON stdin/out │ lake env lean │ cargo / dlopen
         ▼               ▼               ▼
  cryptificate-engine   lean/ (Cryptificate   crates/native
  validate, diagnose,   on WideTrail)        codegen, correctness,
  emit-lean, search                          benchmark protocol
```

## Components

| Path | Role | Trusted for soundness? |
|---|---|---|
| `lean/Cryptificate` | Generic theorems proved once: circuit interpretation, canonical-minor MDS certificates, counterexample lemmas, offsets, activity instantiation, S-box and exponent certificates, HADES bounds, audit commands. | Yes (checked by the Lean kernel) |
| `lean/templates` | Certificate fragments with placeholders. A certificate is a concatenation of fragments with the request's values substituted. | No: acceptance checks bind every theorem to the request. |
| `crates/core`, `crates/cli` | Validation, canonical encodings, unchecked diagnostics (minors, Gaussian-elimination witnesses, collisions), certificate emission. | No |
| `crates/search` | Bounded optimizer. Every candidate is an untrusted proposal. | No |
| `crates/native` | Rust code generation, native correctness corpus, measurement protocol and statistics. | Tests only |
| `crates/kernels` | Arithmetic and parametric round kernels used by every native variant; the subject of the refinement proofs. | Via `refinement/` |
| `refinement/` | Charon/Aeneas extraction and Lean proofs that the Rust source equals the model. | Yes, with Charon, Aeneas and rustc trusted |
| `apps/server` | HTTP API, job queue, Lean runner, proof acceptance, bundles, CLI. | Acceptance logic only |
| `apps/web` | Workbench and static replay viewer. | No |
| `python/` | Thin client for research scripts. | No |

## A job, step by step

1. **Validate.** The engine parses the request with strict rules (field encodings, dimensions, register references, instruction and round limits) and computes the canonical input digest.
2. **Diagnose.** The engine computes unchecked hints: minors, a branch-bound counterexample by Gaussian elimination when the matrix is not MDS, offset collisions, S-box inverses or collisions, exponent inverses or roots of unity, the program's coefficient matrix and a distinguishing basis input.
3. **Emit.** The engine substitutes the request's values and the chosen witnesses into fixed templates.
4. **Check.** Lean runs with one thread, a 3 GiB memory cap and an external wall-clock limit. The service accepts a theorem only if its name, printed type, echoed inputs and axiom set all match expectations.
5. **Native correctness.** Generated Rust variants run against an independent evaluation on a recorded corpus before any timing.
6. **Measure** (experiments only). Paired, calibrated, randomized timing with bootstrap intervals and two confirmation sessions.
7. **Bundle.** Inputs, Lean source, audit output, claims, witnesses, toolchain pins, generated Rust, search history and raw measurements, packed deterministically.

Search, proof checking, compilation and benchmarking are serialized: the target machine is a 4-core laptop-class CPU with 8 GB of RAM.
