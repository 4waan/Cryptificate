# @cryptificate/server

The local Cryptificate service and the `cryptificate` command. It drives the engine
(`cryptificate-engine`) and the Lean checker, decides which claims a certificate establishes,
keeps jobs on disk and packs evidence bundles.

```sh
npm run build -w apps/server
npx cryptificate doctor                      # what is missing, and how to fix it
npx cryptificate init ../my-repo             # cryptificate.json, a starting design, a GitHub workflow
npx cryptificate serve                       # http://127.0.0.1:4173/
npx cryptificate check examples/designs/aes.json --program examples/programs/aes-known-shared-sum.json
npx cryptificate experiment examples/designs/aes.json --profile quick
npx cryptificate verify bundle.tar.gz
npx cryptificate check 'designs/*.json' --fail-on refuted --format sarif --output cryptificate.sarif
npx cryptificate report result.json --format junit
npx cryptificate report bundle.tar.gz --format html --output report.html
npx cryptificate import RC.rs --base examples/designs/poseidon2-bn254.json -o design.json
npm test -w apps/server
```

## CI gate

`check`, `verify` and `report` accept several files or patterns and share `--format
text|json|sarif|junit|markdown|html`, `--output FILE`, `--fail-on none|refuted|not-established|any`,
`--claims ID,...`, `--uri-base DIR` (SARIF locations relative to DIR) and `--no-step-summary`; with
`GITHUB_STEP_SUMMARY` set they append a Markdown report to it. Exit status: 0 passed, 1 the policy failed (or `verify` found a difference), 2 usage
error, unusable input, a run that did not complete, or, under a policy, an in-scope claim left
unchecked because a tool was missing. The renderings are in `src/report-formats.ts`, the policy in
`src/policy.ts`; [docs/ci.md](../../docs/ci.md) describes them and the GitHub Action. Without
input arguments `check` reads the nearest `cryptificate.json` (`src/project.ts`, schema
`schemas/project-config.schema.json`), which `init` (`src/init.ts`, `src/presets.ts`) writes;
`doctor` (`src/doctor.ts`) checks the toolchains, builds, state directory and service.

## HTTP API

The service binds `127.0.0.1` unless `--host` or `CRYPTIFICATE_HOST` names another address (it
then warns: there is no authentication). The container image keeps this default; see
[docs/docker.md](../../docs/docker.md). Every request must carry a loopback `Host` header; `POST` requests with an
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
| `GET /api/jobs/:id/report.html` | the bundle's `report.html` as a download, with a `Content-Security-Policy` header (`409` while the job runs) |

Errors are `{"error": {code, message, path?}}`; validation errors (400 `invalid-request`) add `errors: [{path, code, message}]` and set `error.path` to the first issue's path.
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
equals the value derived from the normalized request. An activity bound is attempted only after
its preconditions are proved (AES: `matrix.mds`, `offsets.dispersion`, `sbox.bijective`; HADES:
`external.mds`, `internal.invertible`, `sbox.bijective`, plus `field.prime` over prime fields and
`activity.partial` for `activity.total`). Completed, clean results are cached under a key of the input digest,
toolchain pins, checker version and the digests of the templates, the Lean library and the generated
source; a hit is reported with origin `cached` and the id of the run it came from. The
`rust.refinement` claim of a hit is not copied: it is recomputed from the current refinement
status, which belongs to this machine rather than to the cached certificate.

## Experiment

`validate` → `search` → Lean equivalence for every shortlisted candidate, baseline and the user
circuit (one at a time) → native correctness → three benchmark sessions (initial and two
confirmations with fresh seeds). The report is checkpointed after every step; when the profile
budget runs out the completed checkpoints stay and the remaining steps are marked `not_run`.
"locally confirmed" requires a 95% CI lower bound above 1.02 against the baseline in both
confirmation sessions, for a candidate whose equivalence Lean proved.

## Bundles and `verify`

A bundle holds `inputs.json`, `report.json`, `lean/`, `toolchain.json`, `native/`, `search/`,
`engine/diagnose.json`, `VERIFY.md` and `report.html` (a rendering of `report.json`), with sorted entries, zero mtimes and no timestamps. `native/` keeps the
generated variant crates, the kernels they link against (checked against the digest of the copy embedded in the
engine), the harness source and the raw correctness and timing records, described in `native/SOURCES.md`.
`cryptificate verify` extracts it to a fresh temporary directory, reads only `inputs.json` and
`report.json`, regenerates and checks the certificate with the installed engine and Lean, and prints
a per-claim table (`match`, `mismatch`, `not re-checked`, `historical`, `not recorded`). Three groups
of claims were added after the first bundles were recorded (`ADDED_LATER` in `src/verify.ts`), and
a bundle that records no claim of a group and is shown to predate it has no status to compare for
them; they are derived, shown as `not recorded` and not counted as a mismatch. For
`activity.partial` and `activity.total`, and separately for `constants.grain`, the evidence is the
checker revision (`report.provenance.checker`): a commit of the local checkout whose claim list
names no claim of that group. For `sbox.differential` and `sbox.linearity` it is the recorded Lean
certificate digest differing from the regenerated one. Any other bundle that lacks a claim of these
groups (a newer, dirty or unknown revision, no git history to look it up in, the current
certificate, or only one claim of the group) counts the omission as a mismatch, as for every other
re-checked claim. `external.m4_mds` and `external.invertible` form no group: they exist only above
width 4, which no earlier checker accepted. The S-box quality claims match only when their value
and pair of bytes match too. It never runs Lean, Rust or shell files from the bundle. Exit status 0
means every re-checked claim matched (and, with `--fail-on`, that no re-checked claim has a status
the policy rejects).

## Environment

| Variable | Meaning |
| --- | --- |
| `CRYPTIFICATE_HOME` | state directory (default `<repo>/.cryptificate`) |
| `CRYPTIFICATE_ENGINE` | engine binary (default `target/release/cryptificate-engine`, then `debug`, then `PATH`) |
| `CRYPTIFICATE_LAKE` | `lake` launcher (default `PATH`, then `~/.elan/bin/lake`) |
| `CRYPTIFICATE_ALLOWED_ORIGINS` | extra comma-separated origins allowed to `POST` |
| `CRYPTIFICATE_HOST` | `serve` bind address when `--host` is not given (default `127.0.0.1`) |
| `PORT` | `serve` port when `--port` is not given (default `4173`); in the container image, also the port its health check polls |
| `CRYPTIFICATE_ROOT` | the checkout whose `lean/`, templates and web UI are used (default: found from the service's own location) |
| `CRYPTIFICATE_CONTAINER` | set to `1` by the container image: `serve` explains how to publish the port, and `rust.refinement` is never `proved`: it says the image does not check the refinement proofs, and `<state>/refinement.json` is not read |
| `NO_COLOR` | plain terminal output (also automatic when stdout is not a TTY) |
| `GITHUB_STEP_SUMMARY` | file the Markdown report of `check`, `verify` and `report` is appended to |
