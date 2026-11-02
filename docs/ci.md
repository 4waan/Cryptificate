# Cryptificate in CI

`cryptificate check` can gate a pull request that changes a cipher's or a ZK hash's parameters or circuits: the job fails when a claim you care about is refuted (or, under a stricter policy, not established). Results come out as SARIF for GitHub code scanning, JUnit XML for test dashboards, Markdown for the job summary, and JSON that `cryptificate report` renders again later without running anything.

The checks are the ones described in the [README](../README.md#what-it-proves) and the [evidence model](evidence-model.md): a design claim is proved or refuted only by a Lean theorem the service accepted; everything else is not established. The CI options change what makes the job fail, never what a claim's status is.

## GitHub Action

The repository root holds a composite action. In the downstream repository, add `.github/workflows/cryptificate.yml`:

```yaml
name: cryptificate

on:
  pull_request:
    paths: ["designs/**", "circuits/**"]
  push:
    branches: [main]

permissions:
  contents: read
  security-events: write   # SARIF upload to code scanning
  actions: read            # needed by the SARIF upload in private repositories

jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v4
      - uses: 4waan/Cryptificate@main   # pin a commit SHA for reproducible gates
        with:
          inputs: |
            designs/*.json
            requests/**/*.json
          fail-on: refuted
```

What the action does, in order:

1. Restores its caches from the repository's Actions cache: `~/.elan` (keyed on `lean/lean-toolchain`), the Mathlib cache archives in `~/.cache/mathlib` (keyed on `lean/lake-manifest.json`), the Cryptificate and WideTrail Lean builds (keyed on the manifest and the Lean sources), the cargo registry and engine build (keyed on `Cargo.lock` and `rustc -V`) and the npm cache (keyed on `package-lock.json`).
2. Installs elan and the toolchain pinned in `lean/lean-toolchain`, runs `lake exe cache get` and `lake build Cryptificate` in `lean/`, builds `cryptificate-engine` with `cargo build --release --locked`, and builds the command with `npm ci` and `npm run build`.
3. Runs `cryptificate check <inputs> --fail-on <policy> --format json --output result.json --bundle-dir bundles` in `working-directory`. The text report goes to the job log and the Markdown report to the job summary. `cryptificate report` then renders the same result as SARIF and JUnit, with the same policy.
4. Uploads the SARIF log with `github/codeql-action/upload-sarif@v3` and the directory with `result.json`, `cryptificate.sarif`, `cryptificate.junit.xml` and one evidence bundle per input with `actions/upload-artifact@v4`, as artifact `cryptificate-evidence`.
5. Fails the job with the exit status of `check` (below).

A cold run downloads the Mathlib cache archives (about 0.9 GB for the pinned Mathlib) and builds the engine; later runs restore both from the Actions cache.

### Inputs

| Input | Default | Meaning |
| --- | --- | --- |
| `inputs` | required | Design or request files, or patterns, separated by spaces or new lines, relative to `working-directory`. Patterns support `*`, `?`, `[..]` and `**`, are expanded by `cryptificate` itself, and must each match at least one file. Paths with spaces are not supported. |
| `fail-on` | `refuted` | `none`, `refuted`, `not-established` or `any` (see [Policy](#policy)). |
| `claims` | all attempted | Comma-separated claim ids the policy is restricted to, for example `matrix.mds,offsets.dispersion,sbox.bijective`. An unknown id, or one an input's report does not carry, is an error (see [Policy](#policy)). |
| `target` | from each file | `matrix`, `external` or `internal`, applied to every input. |
| `working-directory` | `.` | Directory for `inputs` and for the relative paths in the SARIF log. Keep it at the repository root (or a path inside the checkout) so code scanning can place the annotations. |
| `upload-sarif` | `true` | Upload to code scanning. Needs `security-events: write`; code scanning must be available for the repository. |
| `sarif-category` | `cryptificate` | Category of the SARIF upload, to keep several gates apart. |
| `upload-artifacts` | `true` | Upload the bundles and result files. |
| `artifact-name` | `cryptificate-evidence` | Name of that artifact. Use distinct names when the action runs more than once in a workflow. |
| `step-summary` | `true` | Append the Markdown report to the job summary. |
| `proof-cache` | `false` | Keep Cryptificate's proof cache in the Actions cache. A hit skips Lean for an input whose digest, toolchain pins, checker version and template digests are unchanged, and the report says *cached exact result*. Off by default, so every certificate is checked by Lean in every run. |
| `node-version` | `22` | Node.js used to run the command. |

Outputs: `exit-code`, `outcome` (`pass`, `policy-failure` or `error`), `result-file`, `sarif-file` and `bundle-dir`.

The action does not build the Rust-source refinement proofs in `refinement/` (they use a different Lean toolchain), so `rust.refinement` is reported as not established for a GF(2⁸) circuit in CI. With `fail-on: not-established` or `any` and a circuit, restrict the policy with `claims` to the claims you need, or the job fails on that claim.

### Other CI systems

The action is a thin wrapper. On any Linux runner with the toolchains installed (`scripts/setup.sh --skip-web` does it), the same gate is:

```sh
npx cryptificate check 'designs/*.json' --fail-on refuted \
  --format junit --output cryptificate.junit.xml --bundle-dir evidence
```

GitLab, Jenkins and Buildkite read the JUnit file: each claim is a test case, a claim the policy rejects is a `<failure>` (with the counterexample when it is refuted), a claim left unchecked by a missing tool is an `<error>`, and other claims that are not proved are `<skipped>` with their reason.

## Command-line options

`check`, `verify` and `report` share these options:

| Option | Meaning |
| --- | --- |
| `--format text\|json\|sarif\|junit\|markdown` | Output format, `text` by default. |
| `--output FILE` | Write the formatted result to `FILE` (creating its directory); the text report then goes to stdout. Without it the formatted result goes to stdout. Progress always goes to stderr. |
| `--fail-on none\|refuted\|not-established\|any` | Policy, `none` by default. `report` keeps the policy recorded in a saved `check` or `verify` result unless `--fail-on` or `--claims` is given. |
| `--claims ID[,ID...]` | Restrict the policy to these claim ids (repeatable). An id that is not one of the claim ids listed under [SARIF](#sarif) (a typo, or the wrong case) is a usage error. |
| `--no-step-summary` | Do not append Markdown to `$GITHUB_STEP_SUMMARY`. When that variable is set (as it is in GitHub Actions), the Markdown report is appended to the file it names, whatever `--format` is. |

`check` takes one or more design or request files or patterns. `--program`, `--json` and `--bundle` need a single input; with several, put `program` (and `target`) in each request file, use `--format json --output FILE` for the results and `--bundle-dir DIR` for one bundle per input (named after the input file). `verify` takes one or more bundles or patterns. `report` takes saved results: `check --format json` or `verify --format json` output, a `report.json`, or a bundle.

## Policy

| `--fail-on` | Fails on |
| --- | --- |
| `none` | nothing; only errors fail |
| `refuted` | an in-scope claim that is refuted: a Lean-checked counterexample, or a native correctness failure |
| `not-established` | an in-scope claim that is refuted or not established |
| `any` | an in-scope claim that is not proved (refuted, not established or unsupported) |

**Scope.** With `--claims`, the policy applies to exactly those claim ids. Under a policy other than `none`, an input whose report (or bundle) does not carry one of them is an error (exit 2), not a vacuous pass: a gate on `matrix.mds` over a HADES design, whose report has `external.mds` instead, fails with exit 2. Use one gate per design family, or list the ids of both. Without `--claims`, `check` applies the policy to every claim of the report except those the run does not attempt by design, which carry the reason `not-run`: the circuit claims when no circuit was submitted, and native timing, which only experiments measure.

`verify` gates on recomputed statuses only, never on the status a bundle records about itself. By default it applies the policy to the claims it re-checked (again except `not-run` ones). With `--claims`, an id that `verify` does not re-check (`rust.refinement`, `native.timing`, and `native.correctness` without `--native`) is an error (exit 2) under a policy, because the only status available for it is the one the bundle records.

**A missing tool is never a pass.** Under a policy other than `none`, an in-scope claim that is not established because the engine, Lean or the native toolchain was unavailable makes the run an error (exit 2), not a pass. For `verify` this holds under any policy when the re-run did not complete, or when a missing tool turned a recorded status into a mismatch: that is reported as an error (exit 2), not as a bundle that does not reproduce (exit 1).

## Exit status

| Status | `check`, `verify`, `report` |
| --- | --- |
| 0 | Every input was checked to completion and no in-scope claim violates the policy (and, for `verify`, every re-checked claim matched). |
| 1 | The policy failed: an in-scope claim has a status the policy rejects; or `verify` re-checked a claim to a status that differs from the bundle, or recomputed a different input digest. |
| 2 | Usage error, including an unknown `--claims` id; an input that cannot be read, is not valid JSON or is rejected by the schema or the engine; a run (or `verify` re-run) that failed, timed out or was stopped; a `verify` that could re-check no claim, or whose mismatch came from a missing tool; or, under a policy, an in-scope claim left unchecked by a missing tool, a `--claims` id an input does not carry, or an in-scope claim `verify` does not re-check. When several inputs are checked, 2 takes precedence over 1. |

`experiment` keeps its own status: 0 completed, 1 failed, timed out or stopped, 2 invalid input or usage.

Before this interface, `check` returned 1 for a run that failed or timed out; it now returns 2, and 1 is reserved for a policy failure. Without `--fail-on`, a completed run still exits 0 whatever its claims say.

## SARIF

The log follows SARIF 2.1.0: one run, tool driver `Cryptificate` with one rule per claim id (`matrix.mds`, `offsets.dispersion`, `sbox.bijective`, `activity.bound`, `external.mds`, `internal.invertible`, `activity.outer`, `circuit.equivalence`, `native.correctness`, `rust.refinement`, `native.timing`), and one result per claim of each input.

| Claim | `kind` | `level` |
| --- | --- | --- |
| refuted | `fail` | `error` |
| rejected by the policy, not refuted | `fail` | `warning` |
| proved | `pass` | `none` |
| not established or unsupported, in scope | `open` | `none` |
| not run by design, outside the scope | `notApplicable` | `none` |

Each result's message gives the claim title, status, evidence label and note, and the counterexample when the claim is refuted. Its properties carry `claimId`, `chain`, `status`, `evidenceLabel`, `evidenceKind`, `policyViolation`, `inputDigest`, `reportId`, the `jsonPointer` it points at, and, when present, `theorem`, `axioms`, `reason` and (refuted claims only) `counterexample`, the witness object of the report.

Locations point into the file you wrote, with a line and column:

| Claim | Location |
| --- | --- |
| `matrix.mds`, `external.mds`, `internal.invertible` | the matrix |
| `offsets.dispersion` | the repeated offset when refuted, otherwise `offsets` |
| `sbox.bijective` | the colliding table entry or the exponent when refuted, otherwise `sbox` |
| `activity.bound`, `activity.outer` | `rounds`, `fullRounds` |
| `circuit.equivalence` | the first differing output of the circuit when refuted, otherwise the circuit |
| other implementation claims | the circuit, or the top of the file when there is none |

The design is found at the top of a bare design file or under `design` in a request file; the circuit under `program`, or in the `--program` file. Paths are relative to the working directory, which is what code scanning expects when it is the repository root. For `verify`, results point at the bundle file, without a line. A failed input, an input that lacks a requested claim, and a bundle that could not be re-checked (with the reason) are reported as tool execution notifications with level `error`.

GitHub code scanning shows `fail` results as alerts. How it presents `pass`, `open` and `notApplicable` results is up to GitHub; the job's pass or fail is decided by the exit status, not by the upload.

## Re-checking bundles in CI

The evidence bundles the action uploads can be replayed elsewhere with `cryptificate verify`, which runs no code from the bundle. For an analysis bundle it regenerates the design claims and `circuit.equivalence` from the bundle's inputs with the installed engine and Lean checker, and `native.correctness` too with `--native` (from regenerated Rust, never the bundled Rust); for an experiment bundle, the `circuit.equivalence` claim of each recorded candidate. It does not re-check `rust.refinement`, timings, or the native results of experiment candidates; they are shown with their recorded status, are outside the default policy scope, and are an error when named with `--claims` under a policy:

```sh
npx cryptificate verify 'evidence/bundles/*.tar.gz' --fail-on refuted --format markdown
```
