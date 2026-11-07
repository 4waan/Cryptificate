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

`cryptificate init` writes a workflow of this shape with no `inputs`: the action then reads the inputs, the policy and the claim scope from `cryptificate.json` (see [Project configuration](#project-configuration)), so they are set in one place for the action and for a local `cryptificate check`.

What the action does, in order:

1. Restores its caches from the repository's Actions cache: `~/.elan` (keyed on `lean/lean-toolchain`), the Mathlib cache archives in `~/.cache/mathlib` (keyed on `lean/lake-manifest.json`), the Cryptificate and WideTrail Lean builds (keyed on the manifest and the Lean sources), the cargo registry and engine build (keyed on `Cargo.lock` and `rustc -V`) and the npm cache (keyed on `package-lock.json`).
2. Installs elan and the toolchain pinned in `lean/lean-toolchain`, runs `lake exe cache get` and `lake build Cryptificate` in `lean/`, builds `cryptificate-engine` with `cargo build --release --locked`, and builds the command with `npm ci` and `npm run build`.
3. Runs `cryptificate check <inputs> --fail-on <policy> --format json --output result.json --bundle-dir bundles` in `working-directory`. Without `inputs` it runs `cryptificate check --format json --output result.json --bundle-dir bundles`, which reads the nearest `cryptificate.json` (in `working-directory` or a parent); `--fail-on` is added only when `fail-on` is set, and the file's `format`, `output` and `bundleDir` are replaced by the action's result files. The text report goes to the job log and the Markdown report to the job summary, and a warning is logged when the policy in force is `none`. `cryptificate report` then renders the same result as SARIF, JUnit and the HTML evidence report, with the same policy, resolving the input paths against the directory recorded in `result.json` (see [Project configuration](#project-configuration)); the SARIF locations are made relative to the repository root with `--uri-base "$GITHUB_WORKSPACE"`, as code scanning reads them.
4. Uploads the SARIF log with `github/codeql-action/upload-sarif@v3` and the directory with `result.json`, `cryptificate.sarif`, `cryptificate.junit.xml`, the HTML evidence report `cryptificate.html` and one evidence bundle per input with `actions/upload-artifact@v4`, as artifact `cryptificate-evidence`.
5. Fails the job with the exit status of `check` (below).

A cold run downloads the Mathlib cache archives (about 0.9 GB for the pinned Mathlib) and builds the engine; later runs restore both from the Actions cache.

### Inputs

| Input | Default | Meaning |
| --- | --- | --- |
| `inputs` | empty | Design or request files, or patterns, separated by spaces or new lines, relative to `working-directory`. Patterns support `*`, `?`, `[..]` and `**`, are expanded by `cryptificate` itself, and must each match at least one file. Paths with spaces are not supported. Empty: the inputs of the nearest `cryptificate.json`; without such a file the job fails with exit status 2. |
| `fail-on` | empty | `none`, `refuted`, `not-established` or `any` (see [Policy](#policy)). Empty: `refuted`, or the `failOn` of `cryptificate.json` when `inputs` is empty and the file sets one. |
| `claims` | empty | Comma-separated claim ids the policy is restricted to, for example `matrix.mds,offsets.dispersion,sbox.bijective`. An unknown id, or one an input's report does not carry, is an error (see [Policy](#policy)). Empty: the `claims` of `cryptificate.json` when `inputs` is empty, otherwise every claim the run attempts. |
| `target` | from each file | `matrix`, `external` or `internal`, applied to every input (overrides the `target` of `cryptificate.json`). |
| `working-directory` | `.` | Directory the command runs in: `inputs` are relative to it, and without `inputs` the nearest `cryptificate.json` is looked up from it. It must be inside the checkout. The SARIF locations are relative to the repository root (`$GITHUB_WORKSPACE`) whatever it is, so code scanning places the annotations. |
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

## Project configuration

`cryptificate check` without input arguments reads `cryptificate.json` from the working directory or the nearest parent that has one; `--config FILE` names the file explicitly, and then its settings also apply to inputs given on the command line. When inputs are given without `--config`, no file is read. `cryptificate init` writes one; its JSON Schema is [`schemas/project-config.schema.json`](../schemas/project-config.schema.json).

```json
{
  "$schema": "https://raw.githubusercontent.com/4waan/Cryptificate/main/schemas/project-config.schema.json",
  "inputs": ["cryptificate/designs/*.json"],
  "failOn": "refuted",
  "claims": ["matrix.mds", "offsets.dispersion", "sbox.bijective", "activity.bound", "sbox.differential", "sbox.linearity"],
  "bundleDir": "cryptificate/evidence"
}
```

| Key | Command-line option | Meaning |
| --- | --- | --- |
| `inputs` | input arguments | Required. Design or request files, or patterns; each must match at least one file. |
| `failOn` | `--fail-on` | Policy, `refuted` when absent (without a `cryptificate.json` the command-line default is `none`). |
| `claims` | `--claims` | Claim ids the policy is restricted to; every id must be one of the claim ids listed under [SARIF](#sarif). |
| `target` | `--target` | Circuit target applied to every input. |
| `format` | `--format` | Output format, `text` when absent. |
| `output` | `--output` | File the formatted result is written to. |
| `bundleDir` | `--bundle-dir` | Directory for one evidence bundle per input. |
| `$schema` | | Ignored; lets editors validate the file. |

Relative paths in the file (`inputs`, `output`, `bundleDir`) are relative to the directory that holds it, and the input paths in the result, the SARIF locations included, are relative to that directory too (unless `--uri-base` is given). A `check --format json` result records as `base` (an absolute path) the directory its input paths are relative to (this one, or the working directory for inputs given on the command line), and `report` resolves the input paths of a saved result against it, so it finds the files, and places the SARIF locations, from any working directory; the results it writes name the inputs relative to its own working directory. An option given on the command line overrides the file, and a path given as an option stays relative to the working directory. The command names the file it uses on stderr (`config: ../cryptificate.json`) unless `-q` is given. A file that is not valid JSON, has an unknown key or a value of the wrong kind, or names an unknown claim id is a usage error (exit 2), and every problem is listed with its JSON Pointer:

```text
cryptificate: cryptificate.json is not a valid project configuration (2 problems; schema: schemas/project-config.schema.json):
  /failOn: must be one of none, refuted, not-established, any (got "sometimes")
  /claims/0: unknown claim id "matrix.mdss"; the claim ids are matrix.mds, ...
```

`verify` and `report` do not read the file.

## Command-line options

`check`, `verify` and `report` share these options:

| Option | Meaning |
| --- | --- |
| `--format text\|json\|sarif\|junit\|markdown\|html` | Output format, `text` by default. `html` is the [HTML evidence report](#html-evidence-report). |
| `--output FILE` | Write the formatted result to `FILE` (creating its directory); the text report then goes to stdout. Without it the formatted result goes to stdout. Progress always goes to stderr. |
| `--fail-on none\|refuted\|not-established\|any` | Policy, `none` by default (for `check` with a `cryptificate.json`, the file's `failOn`, else `refuted`). `report` keeps the policy recorded in a saved `check` or `verify` result unless `--fail-on` or `--claims` is given. |
| `--claims ID[,ID...]` | Restrict the policy to these claim ids (repeatable). An id that is not one of the claim ids listed under [SARIF](#sarif) (a typo, or the wrong case) is a usage error. |
| `--no-step-summary` | Do not append Markdown to `$GITHUB_STEP_SUMMARY`. When that variable is set (as it is in GitHub Actions), the Markdown report is appended to the file it names, whatever `--format` is. |
| `--uri-base DIR` | Make the file locations in a SARIF log relative to `DIR` (relative to the working directory), by default the working directory; a file outside it gets a `file://` URI. Code scanning reads relative locations from the repository root, so pass the root (`$GITHUB_WORKSPACE`) when the command runs elsewhere. |

`check` takes one or more design or request files or patterns, or none to read `cryptificate.json` ([Project configuration](#project-configuration)); `--config FILE` names that file. `--program`, `--json` and `--bundle` need a single input; with several, put `program` (and `target`) in each request file, use `--format json --output FILE` for the results and `--bundle-dir DIR` for one bundle per input (named after the input file). `verify` takes one or more bundles or patterns. `report` takes saved results: `check --format json` or `verify --format json` output, a `report.json`, or a bundle. With `--format html` (and no `--fail-on` or `--claims`) it also renders experiment reports and experiment bundles, alone or together with analysis reports and bundles on one page in input order, so `report evidence/bundles/*.tar.gz --format html` works on a directory that holds both; that page applies no policy and exits 2 when an input cannot be read or its run did not complete. The other formats, a policy, and saved `check` or `verify` results (which carry a policy) refuse experiments, because the policy and the gate formats describe analysis claims.

## Policy

| `--fail-on` | Fails on |
| --- | --- |
| `none` | nothing; only errors fail |
| `refuted` | an in-scope claim that is refuted: a Lean-checked counterexample, or a native correctness failure |
| `not-established` | an in-scope claim that is refuted or not established |
| `any` | an in-scope claim that is not proved (refuted, not established or unsupported) |

**Scope.** With `--claims`, the policy applies to exactly those claim ids. Under a policy other than `none`, an input whose report (or bundle) does not carry one of them is an error (exit 2), not a vacuous pass: a gate on `matrix.mds` over a HADES design, whose report has `external.mds` instead, fails with exit 2. Use one gate per design family, or list the ids of both. Without `--claims`, `check` applies the policy to every claim of the report except those the run does not attempt by design, which carry the reason `not-run`: the circuit claims when no circuit was submitted, and native timing, which only experiments measure.

`verify` gates on recomputed statuses only, never on the status a bundle records about itself. By default it applies the policy to the claims it re-checked (again except `not-run` ones). A claim added after the bundle was recorded and shown as `not recorded` (see the server README) was re-derived as well, so the policy applies to its recomputed status like any other re-checked claim. With `--claims`, an id that `verify` does not re-check (`rust.refinement`, `native.timing`, and `native.correctness` without `--native`) is an error (exit 2) under a policy, because the only status available for it is the one the bundle records.

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

The log follows SARIF 2.1.0: one run, tool driver `Cryptificate` with one rule per claim id (`matrix.mds`, `offsets.dispersion`, `sbox.bijective`, `activity.bound`, `sbox.differential`, `sbox.linearity`, `field.prime`, `external.mds`, `external.m4_mds`, `external.invertible`, `internal.invertible`, `activity.outer`, `activity.partial`, `activity.total`, `constants.grain`, `circuit.equivalence`, `native.correctness`, `rust.refinement`, `native.timing`), and one result per claim of each input.

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
| `matrix.mds`, `external.mds`, `external.m4_mds`, `external.invertible`, `internal.invertible` | the matrix |
| `offsets.dispersion` | the repeated offset when refuted, otherwise `offsets` |
| `sbox.bijective` | the colliding table entry or the exponent when refuted, otherwise `sbox` |
| `activity.bound`, `activity.outer` | `rounds`, `fullRounds` |
| `activity.partial` | `internal` when refuted by a bypass, otherwise `partialRounds` |
| `activity.total` | `partialRounds` |
| `field.prime` | `modulus` (the design when the modulus is omitted for a named field) |
| `sbox.differential`, `sbox.linearity` | `sbox` |
| `constants.grain` | the differing constant when refuted, otherwise `constants` (the design when it gives no constants) |
| `circuit.equivalence` | the first differing output of the circuit when refuted, otherwise the circuit |
| other implementation claims | the circuit, or the top of the file when there is none |

The design is found at the top of a bare design file or under `design` in a request file; the circuit under `program`, or in the `--program` file. Paths are relative to the working directory, or to the `--uri-base` directory when it is given; code scanning expects them relative to the repository root. For `verify`, results point at the bundle file, without a line. A failed input, an input that lacks a requested claim, and a bundle that could not be re-checked (with the reason) are reported as tool execution notifications with level `error`.

GitHub code scanning shows `fail` results as alerts. How it presents `pass`, `open` and `notApplicable` results is up to GitHub; the job's pass or fail is decided by the exit status, not by the upload.

## HTML evidence report

`--format html` writes one self-contained HTML file to attach to an audit or a pull request. It has inline CSS, no scripts and no external requests (the page declares a Content Security Policy that forbids them), and every value taken from a report is escaped. It shows, for each input:

- the inputs (design, circuit) and their digest, and the normalized inputs as JSON in an appendix;
- both claim chains, each claim with its status, evidence label, theorem name, the exact Lean statement and axioms as the audit printed them (axioms outside `propext`, `Classical.choice`, `Quot.sound` are pointed out), and the counterexample or witness values;
- native correctness and, for experiments, the timing tables: speed-up ratios with their 95% intervals, medians and interquartile ranges per workload, the per-session output checks and the verdict;
- provenance: origin, checker version, Lean, Mathlib and WideTrail pins, `rustc`, the Lean source digest, the proof cache key, the machine of an experiment, the execution steps, and, when the input is a bundle, its `toolchain.json`;
- how to re-check it with `cryptificate verify`.

Printing it from a browser (Save as PDF) gives a light A4 or Letter document. For `check` the policy outcome comes first when a policy applies or there are several inputs; for `verify` the page shows the recorded and recomputed status of every claim. The page renders what the report records and adds no claim of its own; the evidence is the bundle.

Every evidence bundle also carries the same page as `report.html`, rendered from its own (path-scrubbed) `report.json` and `toolchain.json`; the local service serves it on its own at `GET /api/jobs/:id/report.html`. The workbench's **Export report** button downloads that page for a live run. For a recorded run, which has no service behind it, the button renders the page in the browser with the same renderer from the recorded `report.json`; that page has no *Recorded toolchain (toolchain.json)* section. `verify` never reads `report.html`. Bundles recorded before `report.html` existed render with `cryptificate report <bundle> --format html`.

## Re-checking bundles in CI

The evidence bundles the action uploads can be replayed elsewhere with `cryptificate verify`, which runs no code from the bundle. For an analysis bundle it regenerates the design claims and `circuit.equivalence` from the bundle's inputs with the installed engine and Lean checker, and `native.correctness` too with `--native` (from regenerated Rust, never the bundled Rust); for an experiment bundle, the `circuit.equivalence` claim of each recorded candidate. It does not re-check `rust.refinement`, timings, or the native results of experiment candidates; they are shown with their recorded status, are outside the default policy scope, and are an error when named with `--claims` under a policy:

```sh
npx cryptificate verify 'evidence/bundles/*.tar.gz' --fail-on refuted --format markdown
```
