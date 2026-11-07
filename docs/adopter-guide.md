# Adopter guide

This guide is for a research group that wants to use Cryptificate on its own designs and implementations: submit a change, read the evidence without writing Lean, and hand a colleague a bundle they can replay.

## 1. Install

Linux with 8 GB of RAM is enough. You need git, curl, a C toolchain, Rust (stable), Node 20+ and Python 3.10+.

```sh
git clone https://github.com/4waan/Cryptificate
cd Cryptificate
scripts/setup.sh
```

`setup.sh` installs the pinned Lean toolchain with elan, downloads the prebuilt Mathlib cache, builds the trusted Lean core once, builds the Rust engine in release mode and builds the web workbench. It is idempotent; the first run downloads several gigabytes.

Then check the result:

```sh
npx cryptificate doctor
```

`doctor` checks, in order: Node.js 20 or later; elan; that the Lean toolchain pinned in `lean/lean-toolchain` is installed; `lake`; that the Mathlib build is present (`Mathlib.olean`); that `lake build Cryptificate` is up to date, asked with `lake build --no-build` so nothing is built; that the engine binary exists, reports `cryptificate-engine <version>` with the version of the Cargo workspace, has the `validate`, `diagnose` and `emit-lean` subcommands, has the native backend, and is not older than the sources in `crates/`; `rustc`; that the state directory (`CRYPTIFICATE_HOME`, default `.cryptificate` in the checkout) is writable; the free disk space there; and whether a Cryptificate service answers at `http://127.0.0.1:4173` (`--url` for another address). Each problem comes with the command that fixes it. A service that does not answer or runs another checker version, an engine without the native backend or older than its sources, a missing `rustc` and less than 2 GiB of free space are warnings; every other problem, and less than 0.5 GiB free, is a failure. `doctor` exits 0 when nothing failed and 1 otherwise; `--json` prints the checklist as JSON (`cryptificate-doctor/v1`). It changes nothing except a probe file it writes and removes in the state directory and lake's own configuration cache under `lean/.lake`.

## 2. Set up your repository

The command is `apps/server/dist/src/cli.js` in the checkout; `npx cryptificate` finds it inside the checkout. To use it from your own repository, make it a command first:

```sh
alias cryptificate="node /path/to/Cryptificate/apps/server/dist/src/cli.js"
cd /path/to/your-repo
cryptificate init
```

`init` asks on a terminal for the design model (`aes-like` or `hades`), a starting design, whether to add that design's reference circuit (when it has one), the policy (`--fail-on`) and whether to write a GitHub Actions workflow, then shows the files and asks before writing them. Flags answer them instead (`--model`, `--preset aes|aes-row-scaled|poseidon2-bn254`, `--circuit` or `--no-circuit`, `--fail-on`, `--ci github|none`); `--yes`, or a standard input that is not a terminal, takes the defaults: model `aes-like` with preset `aes` (`poseidon2-bn254` for `hades`), no circuit, `refuted` and a workflow. It writes:

| File | Contents |
| --- | --- |
| `cryptificate.json` | `inputs` (`cryptificate/designs/*.json`), `failOn`, `claims` and `bundleDir`; see [ci.md](ci.md#project-configuration) |
| `cryptificate/designs/<preset>.json` | the starting design, one of the example designs in [`examples/designs`](../examples/designs) (the AES-like ones have 4 rounds); with the circuit, a request file holding `design` and `program` |
| `cryptificate/README.md`, `cryptificate/.gitignore` | what the folder is; `evidence/` (local bundles) kept out of git |
| `.github/workflows/cryptificate.yml` | the [GitHub Action](ci.md#github-action) on pull requests that touch these files, with the SARIF upload to code scanning |

The claim scope written to `claims` is the design claims of the model and, with a circuit, `circuit.equivalence` and `native.correctness`. It leaves out `rust.refinement`, which the action reports as not established because it does not build the refinement proofs (see [ci.md](ci.md#github-action)), and `native.timing`, which only experiments measure. In a subdirectory of a git repository the workflow goes to the repository root with `working-directory` set to the subdirectory; the action still writes the SARIF locations relative to the repository root, so the annotations land on your files. The push trigger names the remote's default branch when git has recorded it (`refs/remotes/origin/HEAD`), otherwise `main` or `master` when the repository has one, otherwise the branch checked out; check it in the written workflow. The workflow uses `4waan/Cryptificate@main`; pin a commit SHA (`--action 4waan/Cryptificate@<sha>`) for a gate that does not change under you. `init` never overwrites an existing file unless `--force` is given, and writes nothing when one of its files exists.

Edit the design file, then run `cryptificate check` in the directory of `cryptificate.json` or below it: without arguments it reads the nearest `cryptificate.json` and exits 0 when the policy holds, 1 when a claim violates it and 2 when a design could not be checked.

## 3. Describe a design

Designs and circuits are JSON. Bytes are two hex digits; elements of a prime field (BN254, BabyBear, KoalaBear, Mersenne31, Goldilocks or a custom prime) are decimal strings.

```json
{
  "model": "aes-like/gf256/v1",
  "field": "gf256",
  "width": 4,
  "matrix": [["04","06","02","02"],["01","02","03","01"],["01","01","02","03"],["03","01","01","02"]],
  "offsets": [0, 1, 2, 3],
  "rounds": 10,
  "sbox": { "kind": "aes" }
}
```

A circuit lists instructions over registers. Registers `0..3` are the inputs; instruction `i` defines register `4 + i`.

```json
{
  "field": "gf256", "width": 4,
  "instructions": [
    { "op": "add", "a": 0, "b": 1 },
    { "op": "mul", "k": "02", "a": 4 }
  ],
  "outputs": [5, 1, 2, 3]
}
```

`mul` multiplies by a public constant; `mul` by `02` is the AES `xtime`. Circuits have at most 256 instructions and may only reference registers that already exist. More examples live in [`examples/`](../examples).

A HADES design may list its round constants (`"constants": {"kind": "explicit", "values": [...]}`, one row of `width` decimal strings per round, partial rounds as `[c, "0", …]`). Claim `constants.grain` then checks whether they are exactly the constants of the Poseidon2 reference procedure for the design's field, width and round numbers. To take them from an implementation instead of typing them:

```sh
npx cryptificate import poseidon2_instance_bn256.rs --base examples/designs/poseidon2-bn254.json -o mine.json
npx cryptificate import koala-bear/src/poseidon2.rs --name KOALABEAR_POSEIDON2_RC_16 --base wide.json -o mine.json
npx cryptificate import constants.csv --base examples/designs/koalabear-t4.json -o mine.json
```

The importer reads Plonky3's `…_EXTERNAL_INITIAL`, `…_INTERNAL` and `…_EXTERNAL_FINAL` arrays, HorizenLabs poseidon2 instance files (`RC3`, `RC16`, …) and the list `print_round_constants` prints, JSON (rows, a flat list or the split form `externalInitial`, `internal`, `externalFinal`) and CSV. It copies everything else from `--base`, sets the round numbers the layout gives (and says so), and rejects values that are not below the modulus. It does not judge the constants; `check` does, at every width the profiles accept (Plonky3's wide instances included).

## 4. Check it

From the terminal:

```sh
npx cryptificate check examples/designs/aes.json --program examples/programs/aes-known-shared-sum.json
```

From Python:

```python
import json
from cryptificate import Client

def load(path):
    with open(path) as f:
        return json.load(f)

client = Client("http://127.0.0.1:4173")
job = client.analyze(load("examples/designs/aes.json"),
                     program=load("examples/programs/aes-known-shared-sum.json"))
final = client.wait(job["id"])
for claim in final["report"]["claims"]:
    print(claim["id"], claim["status"], claim["evidence"]["label"])
client.bundle(job["id"], "aes-check.tar.gz")
```

Or open the workbench with `npx cryptificate serve` and edit the matrix and the circuit directly.

## 5. Read the report

Each claim has a status (`proved`, `refuted`, `not_established`, `unsupported`), an evidence label and, for refutations, a witness with concrete bytes. Read [evidence-model.md](evidence-model.md) once; it explains what every label covers and what it does not.

Two habits help:

- Read the design chain and the implementation chain separately. A correct circuit for a weak matrix and a strong matrix with a broken circuit are both common.
- Treat `not_established` as "this method did not decide it", never as "false".

## 6. Search and measure

```sh
npx cryptificate experiment examples/designs/aes.json --program examples/programs/aes-known-shared-sum.json --profile quick
```

The quick profile spends at most 180 seconds: at most eight generated candidates, ten seconds of synthesis, one shortlisted candidate. The research profile spends 900 seconds with up to 64 candidates and three shortlisted. Every shortlisted candidate is proved equivalent in Lean and passes the native correctness corpus before it is timed. The verdict is `locally confirmed`, `inconclusive` or `no improvement`; see [batch-interface.md](batch-interface.md) for the protocol.

## 7. Share and replay

Download the bundle from the workbench, with `client.bundle(...)`, or with `cryptificate check ... --bundle out.tar.gz`. A colleague runs

```sh
npx cryptificate verify aes-check.tar.gz
```

`verify` reads only the bundle's inputs and claims, regenerates the certificate with the installed generator, checks it with the installed Lean toolchain and prints a claim-by-claim comparison. It never runs Lean, Rust or shell code from the bundle. Recorded timings are shown as historical; measuring again creates a new experiment. For the S-box differential uniformity and linearity claims the comparison covers the value and the pair of bytes as well as the status, so a bundle that records another value does not verify. A bundle that lacks both of these claims and whose recorded Lean certificate digest differs from the regenerated one, as for a bundle recorded before they existed, lists them as *not recorded*: they are re-derived but there is nothing to compare them with, and `verify` adds a note saying so. Bundles are not signed, so this cannot rule out that the claims were removed by hand; a bundle whose certificate digest is the regenerated one and lacks them does not verify. The partial-round claims `activity.partial` and `activity.total` follow the same rule with another marker: a bundle that lacks both is *not recorded* for them only when its recorded checker revision is a commit of your checkout whose claim list does not name them; otherwise the omission is a mismatch.

To attach the evidence to an audit or a pull request, use the bundle's `report.html`, the workbench's **Export report** button, or `npx cryptificate report aes-check.tar.gz --format html --output report.html`: one HTML file with no scripts and no external requests that prints cleanly to PDF. It is a view of `report.json`, not evidence; the bundle is what `verify` re-checks.

## 8. Bring your own implementation language

Measured variants only need to export `mix_batch(input, output, column_count)` from a shared library. An OxCaml, C or assembly implementation can be compared against the Rust variants under the same harness and statistics. The ABI, layout and correctness corpus are in [batch-interface.md](batch-interface.md).

A verdict of `locally confirmed` covers one machine and the recorded workloads. A speedup worth reporting should hold on more than one machine and at more than one input size, the standard the [OxCaml cryptography study](https://github.com/fplaunchpad/oxcaml-crypto-study/blob/main/manifesto.md) sets for results that beat a baseline. To get there, replay the same experiment bundle on each machine: every run records its CPU, compiler and seeds, so the results can be compared side by side.

## Limits to keep in mind

- Checked profiles: GF(2⁸) width 4 (AES-like, 4 to 32 rounds), BN254 width 3 (HADES, up to 160 rounds), and HADES over BabyBear, KoalaBear, Mersenne31, Goldilocks or a custom prime below 2⁶⁴ at widths 2, 3, 4, 8, 12, 16 and 24 (design claims only: no circuits, search or native timing over these fields; above width 4 the full-round activity bounds are not established and the external matrix is checked for the Poseidon2 structure and invertibility instead of MDS). Other widths are experimental or rejected.
- Activity figures are conservative lower bounds on active S-boxes. They do not rank passing designs and they are not security levels.
- Native timings describe the recorded machine and workload only.
