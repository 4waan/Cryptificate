<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/logo-dark.png">
  <img src="assets/brand/logo.png" alt="Cryptificate" width="340">
</picture>

### Prove what still holds. Measure what changed.

Cryptificate checks a change to a cipher component three ways. Lean proves whether your circuit still computes the intended matrix on every input. Lean proves which diffusion guarantees the changed design keeps, or shows a concrete input that breaks them. Native Rust measurements show whether the change is actually faster. Every result downloads as a bundle that someone else can replay.

**[Demo](#demo)** · **[Try it](#try-it)** · **[What it checks](#what-it-checks)** · **[How a claim is accepted](#how-a-claim-is-accepted)** · **[Rust source to model](#from-rust-source-to-the-model)** · **[Measurements](#search-and-measurement)** · **[Replay](#replay-a-bundle)** · **[Where it stands](#where-it-stands)**

[![Lean 4](https://img.shields.io/badge/Lean-v4.33.1-0f4c81?style=flat-square)](lean/lean-toolchain)
[![Mathlib](https://img.shields.io/badge/Mathlib-v4.33.1-3d6ba8?style=flat-square)](lean/lakefile.toml)
[![Axioms](https://img.shields.io/badge/axioms-propext_·_choice_·_Quot.sound-13213a?style=flat-square)](docs/evidence-model.md#proof-acceptance)
[![Aeneas](https://img.shields.io/badge/Rust_→_Lean-Charon_+_Aeneas-e4572e?style=flat-square)](refinement/STATUS.md)
[![Rust](https://img.shields.io/badge/native-Rust-b7410e?style=flat-square)](crates)
[![Checks](https://github.com/4waan/Cryptificate/actions/workflows/checks.yml/badge.svg)](https://github.com/4waan/Cryptificate/actions/workflows/checks.yml)
[![MIT](https://img.shields.io/badge/License-MIT-64748b?style=flat-square)](LICENSE)

<img src="assets/brand/banner.svg" width="900" alt="Your change goes to Lean-checked claims and native Rust measurements, and comes back as a replayable bundle">

</div>

## Passing tests is the wrong question

Someone edits AES MixColumns: a cheaper circuit, a different matrix, new row offsets, another S-box. Three questions follow, and each one needs its own kind of evidence.

1. **Does the circuit still compute the matrix?** A test samples inputs. A proof covers all 2³² columns.
2. **Does the matrix still diffuse?** A correct implementation of a weak matrix is still weak. The identity matrix has a perfect implementation and branch number 2.
3. **Is it faster?** Fewer XORs on paper often compile to the same machine code. Only a paired measurement can tell, and "no improvement" is a legitimate answer.

Cryptificate answers each question separately and never lets one answer stand in for another.

<details>
<summary><strong>New to these words? Read this first</strong></summary>

| Word | What it means here |
|---|---|
| **MixColumns** | The AES step that multiplies each 4-byte column by a fixed 4×4 matrix over GF(2⁸). |
| **GF(2⁸)** | Bytes with XOR as addition and polynomial multiplication modulo `x⁸ + x⁴ + x³ + x + 1` (`0x11B`). |
| **xtime** | Multiplication by the byte `02`: shift left, then XOR `1B` if the top bit fell off. |
| **Branch number** | The fewest nonzero bytes, counted across input and output together, of any nonzero input. AES MixColumns reaches the maximum, 5. |
| **MDS** | A matrix whose every square submatrix is invertible. MDS is exactly what gives the maximum branch number. |
| **Row offsets** | How far each row of the state rotates (AES: 0, 1, 2, 3). Distinct offsets spread each column over all four columns. |
| **Active S-box** | An S-box whose input differs between two executions. More active S-boxes over a few rounds is what the wide-trail strategy aims for. |
| **BN254, HADES, Poseidon2** | A 254-bit prime field used in zero-knowledge systems, and the round structure (full and partial rounds) of the Poseidon2 hash over it. |
| **Lean** | A proof assistant. Its kernel checks every proof step; Cryptificate trusts only that kernel plus a few named definitions. |
| **Aeneas, Charon** | Tools that translate Rust source into Lean functions so properties of the Rust code can be proved. |

</details>

## Demo

<!-- demo-video -->

The guided story in the workbench is called **Save operations. Keep the promise.** Each button loads real inputs, and the results come from Lean and the native harness, not from scripted screens.

| Step | You do | Cryptificate shows |
|---|---|---|
| **1. Beat the reference** | Start from AES MixColumns and its textbook circuit (4 xtime, 15 XOR); run a quick search. | A 12-XOR circuit, proved equivalent in Lean, passing 9,214 native cases. Timing against the textbook circuit: inconclusive, because the compiler already vectorizes all of them. |
| **2. One wire goes wrong** | Change the first output's `xtime(a ⊕ b)` to `xtime(a ⊕ c)`, after guessing which output breaks. | A Lean-checked witness: input `[00,01,00,00]` should give `[03,02,01,01]`; the changed circuit gives `[01,02,01,01]`. |
| **3. Perfect implementation, weak diffusion** | Replace both the matrix and the circuit with the identity. | Equivalence is proved. MDS is refuted: `[01,00,00,00]` has 1 + 1 = 2 nonzero bytes, below 5. The activity bound is *not established*, not refuted. |
| **4. Prime field** | Poseidon2's width-3 matrix over BN254 with a shared-sum circuit; S-box exponent 5, then 3. | Equivalence and MDS proved. `x⁵` is a bijection (inverse-exponent certificate). `x³` is not: `1` and a cube root of unity collide. |

Then **Download this experiment** gives the full evidence bundle.

## Try it

Linux with 8 GB of RAM is enough. You need git, curl, a C toolchain, Rust stable, Node 20+ and Python 3.10+.

```sh
git clone https://github.com/4waan/Cryptificate && cd Cryptificate
scripts/setup.sh            # pinned Lean toolchain, Mathlib cache, engine, workbench (idempotent)
npx cryptificate serve      # http://127.0.0.1:4173
```

The first `setup.sh` run downloads several gigabytes (the Mathlib build cache). After that, a fresh 4×4 MDS certificate checks in about three seconds on a laptop-class CPU.

Without the browser:

```sh
npx cryptificate check examples/designs/aes-row-scaled.json
npx cryptificate check examples/designs/aes.json --program examples/programs/aes-wrong-wire.json
npx cryptificate experiment examples/designs/aes.json --program examples/programs/aes-known-shared-sum.json --profile quick
```

## What it checks

| Claim | Established by | Example |
|---|---|---|
| The circuit computes `M` | Lean: an interpretation theorem proved once, then 16 coefficient comparisons per circuit | the crossed wire above, refuted on `[00,01,00,00]` |
| `M` is MDS (branch number 5) | Lean: 69 canonical minors written as explicit determinant formulas, against a coverage theorem proved once | identity refuted by `[01,00,00,00]` |
| Row offsets disperse columns | Lean: WideTrail's characterization, offsets distinct | `[0,1,1,3]` refuted: rows 1 and 2 share offset 1 |
| Active S-boxes over `r` rounds | Lean: for any injective S-box and any round keys, two distinct inputs activate at least `⌊r/4⌋·25 + (5 if r mod 4 ≥ 2)` S-boxes | 4 rounds: 25, 10 rounds: 55, 32 rounds: 200 |
| The S-box is a bijection | Lean: an inverse table (bytes) or an inverse exponent (BN254) | `x³` over BN254 refuted by a collision |
| HADES outer rounds | Lean: WideTrail's outer-round bound for your external and internal matrices | 8 full rounds: 16 active S-boxes |
| Rust source equals the model | Charon + Aeneas translation, then a Lean proof | GF(2⁸) arithmetic and the AES-like round, for every design |
| Generated Rust is correct | 9,214 recorded cases (8,278 for BN254) before any timing | a faster wrong circuit never reaches the leaderboard |
| Faster on this machine | paired bootstrap intervals, two confirmation sessions | `locally confirmed`, `inconclusive` or `no improvement` |

Two chains stay separate in every report: **design guarantees** (MDS, offsets, S-box, activity) and **implementation correspondence** (equivalence, Rust refinement, native correctness, timing). A failed MDS check makes the activity bound *not established by this method*; it never turns into a refutation of the bound. Statuses, labels and origins are defined in [docs/evidence-model.md](docs/evidence-model.md).

## How a claim is accepted

A certificate is a Lean file built from fixed [templates](lean/templates) with the request's numbers substituted in. Lean exiting with status 0 is not enough. The service accepts a theorem only when

1. it exists under its expected name, and its printed type equals the expected type, which names the exact candidate constants;
2. Lean's own evaluation of those constants equals the normalized request, so nothing changed between the request and the proof;
3. the audit command re-checks the theorem and its local dependencies in the kernel, and its transitive axioms are a subset of `propext`, `Classical.choice` and `Quot.sound`.

Certificates evaluate small concrete computations in the Lean kernel with `decide`. They never use `native_decide` or `bv_decide`, which add `Lean.ofReduceBool` and trust the whole compiler ([Lean reference: axioms](https://lean-lang.org/doc/reference/latest/Axioms/)). They never enumerate 4-byte inputs and never reduce the general determinant definition: the hard facts are proved once, generically, and each certificate only evaluates bytes.

| Certificate (single thread, whole file) | Wall time |
|---|---|
| AES shared-sum circuit, equivalence | 3.2 s |
| Wrong-wire circuit, checked witness | 3.1 s |
| 256-instruction circuit with heavy sharing | 4.4–8.5 s |
| Diffusion: MDS, offsets, activity | 3.3–8.5 s |
| HADES: external MDS, internal invertibility, exponent, activity | 3.9–4.4 s |

## From Rust source to the model

The native code that Cryptificate measures is built on [`crates/kernels`](crates/kernels). Its Rust source is translated to Lean by [Charon and Aeneas](https://github.com/AeneasVerif/aeneas) and proved equal to the mathematical model:

| Rust | Lean theorem (all inputs, no panic) | Ends at |
|---|---|---|
| `gf256::mul` | `gf256.mul a b = ok ⟨GF256.rawMul a.bv b.bv⟩` | WideTrail's field `GF256` |
| `gf256::xtime`, `gf256::add` | equal to `GF256.xtime` and XOR | WideTrail's field `GF256` |
| `aes_like::round`, `aes_like::encrypt` | equal to `aesLikeRound` / `aesLikeExec` of [`Bridge.lean`](lean/Cryptificate/Bridge.lean), for every matrix, offsets, S-box table and key schedule | the active-S-box bound, for MDS matrices and distinct offsets |
| gf256 crate 0.3.1 (`0x11B`, no tables, no carry-less instructions), expanded source | its `mul` equals WideTrail's multiplier, given `size_of::<u8>() = 1`, which Aeneas leaves unmodelled | WideTrail's field `GF256` |
| arkworks BN254 `Fr` | not established: Aeneas does not translate it at the pinned revision | |

Charon, Aeneas and `rustc` stay trusted. The theorems are about Rust source, not machine code, and say nothing about constant time. The pins, the extraction script that reproduces the Lean byte for byte, and the full status table are in [refinement/](refinement/STATUS.md). WideTrail builds unchanged on the refinement package's Lean and Mathlib v4.35.0.

## Search and measurement

The optimizer is an untrusted candidate generator. It builds a primitive circuit from polynomial-basis multiples, extracts shared pairs, factors `xtime(a) ⊕ xtime(b) = xtime(a ⊕ b)`, cancels repeated XORs, hash-conses and removes dead code, varying ties by recorded seeds. A candidate counts only after Lean proves it equivalent and the compiled variant passes the correctness corpus.

Every compared variant uses the same arithmetic, compiler and flags, is built as its own shared library, and is timed by one harness: workloads of 4 KiB, 64 KiB and 1 MiB, samples of at least 50 ms, 3 warmups, 15 paired rounds in randomized order, 95% paired bootstrap intervals with 10,000 resamples, then two confirmation sessions with fresh seeds. A change is **locally confirmed** only if the interval's lower bound exceeds 1.02 in both sessions against every baseline. The full protocol and the C ABI that other languages can implement are in [docs/batch-interface.md](docs/batch-interface.md).

<!-- recorded-measurements -->

## Replay a bundle

```sh
npx cryptificate verify aes-wrong-wire.tar.gz
```

`verify` reads only the bundle's inputs and claims, regenerates the certificate with the installed generator, checks it with the installed Lean toolchain and prints a claim-by-claim comparison. It never runs Lean, Rust or shell code from the bundle. Recorded timings are reported as historical; measuring again creates a new experiment. Recorded bundles from the demo live in [examples/bundles](examples/bundles).

## Use it from Python or the terminal

```python
from cryptificate import Client, aes_like_design, aes_shared_sum_program

client = Client("http://127.0.0.1:4173")
job = client.analyze(aes_like_design(rounds=10), program=aes_shared_sum_program())
final = client.wait(job["id"])
for claim in final["report"]["claims"]:
    print(claim["id"], claim["status"], claim["evidence"]["label"])
client.bundle(job["id"], "evidence.tar.gz")
```

The Python client uses only the standard library; see [python/](python/README.md). The HTTP API (`/api/capabilities`, `/api/analyses`, `/api/experiments`, `/api/jobs/:id`, `/stop`, `/bundle`) is described in [apps/server](apps/server/README.md). The [adopter guide](docs/adopter-guide.md) walks through a first design end to end.

## Repository layout

| Path | What it holds |
|---|---|
| [`lean/`](lean) | The Lean package: circuit semantics, canonical-minor MDS certificates, counterexamples, offsets, the execution bridge, S-box and exponent certificates, HADES bounds, audit commands and certificate templates |
| [`refinement/`](refinement) | Charon/Aeneas extraction of `crates/kernels` and the gf256 crate, with Lean proofs on v4.35.0 |
| [`crates/`](crates) | `core` (validation, diagnostics, certificate emission), `cli` (`cryptificate-engine`), `search`, `native` (codegen and benchmark harness), `kernels` |
| [`apps/server`](apps/server) | Loopback service, job queue, proof acceptance, bundles, the `cryptificate` CLI |
| [`apps/web`](apps/web) | The workbench and the static replay site |
| [`python/`](python) | Python client |
| [`examples/`](examples) | Designs, circuits and recorded bundles |
| [`docs/`](docs) | [Evidence model](docs/evidence-model.md), [architecture](docs/architecture.md), [batch interface](docs/batch-interface.md), [adopter guide](docs/adopter-guide.md), [research directions](docs/research-directions.md) |

## Built on WideTrail

Cryptificate depends on [WideTrail](https://github.com/4waan/Wide-Trail-formal-verification), an earlier Lean library by the same author that formalizes the wide-trail strategy: `GF(2⁸)` built from scratch, the MDS branch theorem, AES MixColumns, diffusion-optimal row offsets, trail activity bounds, HADES outer-round bounds and the pinned Poseidon2 BN254 instance. WideTrail is pinned as a Lake dependency and is not modified here.

New in Cryptificate: fresh-input certificates for any supported matrix (canonical minors, checked counterexamples, offsets, activity instantiation), the execution bridge from real AES-like executions to WideTrail's trail model, the universal circuit-equivalence checker, S-box and exponent certificates, proof acceptance with input binding and axiom audit, the optimizer, the native harness, Rust-source refinement, the service, the workbench and replayable bundles.

## Where it stands

- **Checked profiles:** GF(2⁸) width 4 (AES-like, 4 to 32 rounds) and BN254 width 3 (HADES, up to 160 rounds). Widths 2 and 3 over GF(2⁸) are accepted as experimental and get no certificates yet.
- **Refinement:** GF(2⁸) arithmetic and the complete AES-like round are proved from Rust source. BN254 arithmetic in arkworks is not established, and searched circuits are checked by tests, not refined.
- **Not claimed:** security levels, round-count recommendations, constant-time behaviour, or global optimality of a searched circuit. Activity figures are conservative lower bounds shared by every passing design; they do not rank one MDS matrix above another.
- **Next:** partial-round subspace certificates for HADES, checked trail search for tighter bounds, and adapters for other implementation languages through the batch ABI. See [docs/research-directions.md](docs/research-directions.md).

## License

MIT. See [LICENSE](LICENSE).
