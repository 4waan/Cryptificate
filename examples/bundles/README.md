# Recorded evidence bundles

Each `.tar.gz` here is the evidence bundle of a genuine run, downloaded from
`GET /api/jobs/:id/bundle` (or written by `cryptificate check`/`experiment` and
packed by the service). Reports inside carry `"origin": "live"` as produced; the web UI
shows them with a **recorded** badge when it replays them without a running service.

A bundle contains:

| Path | Content |
| --- | --- |
| `inputs.json` | the normalized request |
| `report.json` | claims, witnesses, execution steps, provenance |
| `lean/Cert.lean`, `lean/audit.txt` | the generated certificate and the checker's output (experiments: one directory per circuit) |
| `toolchain.json` | `lean-toolchain`, Lake manifest pins, `Cargo.lock` sha256, `rustc -V` |
| `native/` | generated Rust sources, correctness results, raw measurements (when native steps ran) |
| `search/` | search history and seeds (experiments) |
| `engine/diagnose.json` | the engine's unchecked diagnostics |
| `VERIFY.md` | how to replay the bundle |

Bundles are deterministic: entries are sorted, every mtime is zero and no file holds a
timestamp, so the same job always yields the same bytes.

## Verifying a bundle

```sh
npx cryptificate verify examples/bundles/<name>.tar.gz
```

`verify` reads only `inputs.json` and `report.json`. It regenerates the Lean certificate with
the installed engine and templates, runs the installed Lean checker, recomputes each claim and
prints a table comparing it with the recorded status. Bundled Lean, Rust and shell files are
never executed. Native timings are historical: they describe the machine that recorded the
bundle and are reported as such, not re-measured.

Verification needs the toolchain set up by `scripts/setup.sh` (network access the first time,
for the Lean toolchain, the Lake packages and the Mathlib cache).
