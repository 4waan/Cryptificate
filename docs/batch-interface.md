# Native batch interface and measurement protocol

Every implementation that Cryptificate times exposes one C-ABI function:

```c
void mix_batch(const uint8_t *input, uint8_t *output, size_t column_count);
```

Any language that can export this symbol from a shared library can be measured with the same harness, the same inputs and the same statistics: Rust today, and for example an OxCaml implementation through its C stubs.

## Layout

| Profile | One column | Bytes per column | Encoding |
|---|---|---|---|
| AES-like, GF(2⁸) | `x₀ x₁ x₂ x₃` | 4 | row order: byte `r` is row `r`, polynomial `0x11B` |
| HADES, BN254 | `x₀ x₁ x₂` | 96 | three arkworks `Fr` values in their in-memory (Montgomery) form |

`input` and `output` never alias. Both are 64-byte aligned and hold exactly `column_count` columns. The function computes `y = M·x` for every column, where `M` is the row-major matrix of the design.

## Rules for compared variants

- Same arithmetic primitives (`crates/kernels`), same compiler, same flags for every variant: `opt-level=3`, `codegen-units=1`, no LTO, no `target-cpu`, `panic=abort`.
- Each variant is compiled separately as a shared library and loaded by one harness process, so no variant can be inlined into the timing loop.
- Inputs are generated at runtime from a recorded seed; outputs are reduced to a checksum outside the timed region.

## Correctness before timing

A variant is timed only after it matches an independent evaluation of the design matrix on:

- all 1,021 GF(2⁸) columns with at most one nonzero byte (`1 + 4·255`);
- 8,192 distinct seeded columns with several nonzero bytes;
- the guided wiring witness `[00,01,00,00]` and any other recorded extra cases.

The report records the exact number of cases. The correctness corpus and the timing inputs come from different seeds. A variant that fails any case is excluded from the leaderboard, however fast it is.

## Measurement protocol

| Setting | Value |
|---|---|
| Workloads | 4 KiB, **64 KiB (primary)**, 1 MiB, rounded down to whole columns |
| Sample length | calibrated to at least 50 ms |
| Warmups | 3 |
| Paired rounds | 15 per workload, order randomized by a recorded seed |
| Reported | raw samples, ns per column, input MiB/s, median, IQR, speedup ratio |
| Interval | 95% paired bootstrap, 10,000 resamples |
| Confirmation | candidate frozen, then two fresh sessions with new input and order seeds |

A result is **locally confirmed** only when the lower bound of the 95% interval exceeds 1.02 in both confirmation sessions against every relevant baseline. Overlapping intervals or too few samples give **inconclusive**; no faster candidate gives **no improvement**. Both are valid outcomes.

The harness records the CPU model, operating system, RAM, `rustc -V`, flags, source and binary hashes, seeds, calibration counts and checksums. Historical timings stay historical: measuring again creates a new experiment.
