# @cryptificate/server

The local Cryptificate service and the `cryptificate` command. It drives the engine
(`cryptificate-engine`) and the Lean checker, decides which claims a certificate establishes,
keeps jobs on disk and packs evidence bundles.

```sh
npm run build -w apps/server
npx cryptificate serve                       # http://127.0.0.1:4173/
npx cryptificate check examples/designs/aes.json --program examples/programs/aes-known-shared-sum.json
npx cryptificate experiment examples/designs/aes.json --profile quick
npx cryptificate verify bundle.tar.gz
npm test -w apps/server
```

## HTTP API

The service binds `127.0.0.1` unless `--host` says otherwise (it then warns: there is no
authentication). Every request must carry a loopback `Host` header; `POST` requests with an
`Origin` header must come from the service's own origin (or one given with `--allow-origin` /
`CRYPTIFICATE_ALLOWED_ORIGINS`), and `Sec-Fetch-Site: cross-site` is refused. JSON bodies must be
`application/json` and at most 256 KiB; they are shape-checked against the public schema before the
engine sees them.

| Method and path | Result |
| --- | --- |
| `GET /api/capabilities` | version, profiles and budgets, limits, Lean/Rust/engine availability, toolchain pins |
| `POST /api/analyses` | `AnalysisRequest` → `202 {"job": {id, kind, state, origin}}` |
| `POST /api/experiments` | `ExperimentRequest` → `202 {"job": …}` |
| `GET /api/jobs/:id` | `Job`: state, progress steps, partial or final report, `bundle` flag |
| `POST /api/jobs/:id/stop` | stops the job's whole process group; completed checkpoints are kept |
| `GET /api/jobs/:id/bundle` | deterministic `.tar.gz` evidence bundle (`409` while the job runs) |

Errors are `{"error": {code, message, path?}}`; validation errors add `errors: [{path, code, message}]`.
Status codes: `400` invalid JSON or shape, `403` Host/Origin policy, `404`, `405`, `409`, `413` body
too large, `415` wrong content type, `429` queue full (one running job plus two queued).

Job states: `queued`, `running`, `completed`, `failed`, `timeout`, `cancelled`, `invalid`. Job ids are
random 128-bit hex strings; each job lives in `.cryptificate/jobs/<id>` (or `$CRYPTIFICATE_HOME/jobs`).
Finished jobs are reloaded when the service restarts.

When `apps/web/dist` exists it is served at `/`, with unknown extension-less paths falling back to
`index.html`.

## Analysis

`validate` → `diagnose` → `emit-lean` → Lean → native correctness → report. Lean runs as
`lake env lean --threads=1 -M 3072 <job>/lean/Cert.lean` in `lean/` with a wall-clock limit of
min(180 s, remaining budget); on expiry the process group is killed and the claims are
`not_established` (never `refuted`). A certificate is accepted per theorem only if Lean exited 0,
the `CRYPTIFICATE_AUDIT` line for the theorem is present, its type equals the expected type, its
axioms are within `propext`, `Classical.choice`, `Quot.sound`, and every `CRYPTIFICATE_INPUT` echo
equals the value derived from the normalized request. Activity bounds are only proved together
with MDS and distinct offsets. Completed, clean results are cached under a key of the input digest,
toolchain pins, checker version and the digests of the templates, the Lean library and the generated
source; a hit is reported with origin `cached` and the id of the run it came from.

## Experiment

`validate` → `search` → Lean equivalence for every shortlisted candidate, baseline and the user
circuit (one at a time) → native correctness → three benchmark sessions (initial and two
confirmations with fresh seeds). The report is checkpointed after every step; when the profile
budget runs out the completed checkpoints stay and the remaining steps are marked `not_run`.
"locally confirmed" requires a 95% CI lower bound above 1.02 against the baseline in both
confirmation sessions, for a candidate whose equivalence Lean proved.

## Bundles and `verify`

A bundle holds `inputs.json`, `report.json`, `lean/`, `toolchain.json`, `native/`, `search/`,
`engine/diagnose.json` and `VERIFY.md`, with sorted entries, zero mtimes and no timestamps. `native/` keeps the
generated variant crates, the kernels they link against (checked against the digest of the copy embedded in the
engine), the harness source and the raw correctness and timing records, described in `native/SOURCES.md`.
`cryptificate verify` extracts it to a fresh temporary directory, reads only `inputs.json` and
`report.json`, regenerates and checks the certificate with the installed engine and Lean, and prints
a per-claim table (`match`, `mismatch`, `not re-checked`, `historical`). It never runs Lean, Rust or
shell files from the bundle. Exit status 0 means every re-checked claim matched.

## Environment

| Variable | Meaning |
| --- | --- |
| `CRYPTIFICATE_HOME` | state directory (default `<repo>/.cryptificate`) |
| `CRYPTIFICATE_ENGINE` | engine binary (default `target/release/cryptificate-engine`, then `debug`, then `PATH`) |
| `CRYPTIFICATE_LAKE` | `lake` launcher (default `PATH`, then `~/.elan/bin/lake`) |
| `CRYPTIFICATE_ALLOWED_ORIGINS` | extra comma-separated origins allowed to `POST` |
| `NO_COLOR` | plain terminal output (also automatic when stdout is not a TTY) |
