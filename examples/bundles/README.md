# Recorded evidence bundles

Each `.tar.gz` here is the evidence bundle of a genuine run, downloaded from
`GET /api/jobs/:id/bundle` (or written by `cryptificate check`/`experiment` and
packed by the service). Reports inside carry `"origin": "live"` as produced; the web UI
shows them with a **recorded** badge when it replays them without a running service.

Each recorded run has its own directory, `<name>/report.json` and `<name>/<name>.tar.gz`.
`scripts/record-runs.mjs` produces them: it submits a fixed list of inputs from
`examples/designs` and `examples/programs` to a running service, waits for each job, and saves
the report and the bundle here and in `apps/web/public/recorded/` for the replay site. Local
paths are replaced by placeholders (`<job>`, `<repo>`, `~`) and the script refuses files that
still hold a path or a date.

```sh
CRYPTIFICATE_HOME=$(mktemp -d) node apps/server/dist/src/cli.js serve --port 4175 &
node scripts/record-runs.mjs --url http://127.0.0.1:4175
```

An empty state directory makes every analysis run Lean afresh instead of answering from the
proof cache. Timing runs wait until the 1-minute load average drops below 1.

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
npx cryptificate verify examples/bundles/<name>/<name>.tar.gz
```

`verify` reads only `inputs.json` and `report.json`. It regenerates the Lean certificate with
the installed engine and templates, runs the installed Lean checker, recomputes each claim and
prints a table comparing it with the recorded status. Bundled Lean, Rust and shell files are
never executed. Native timings are historical: they describe the machine that recorded the
bundle and are reported as such, not re-measured.

Verification needs the toolchain set up by `scripts/setup.sh` (network access the first time,
for the Lean toolchain, the Lake packages and the Mathlib cache).
