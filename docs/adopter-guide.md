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

## 2. Describe a design

Designs and circuits are JSON. Bytes are two hex digits; BN254 values are decimal strings.

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

## 3. Check it

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

## 4. Read the report

Each claim has a status (`proved`, `refuted`, `not_established`, `unsupported`), an evidence label and, for refutations, a witness with concrete bytes. Read [evidence-model.md](evidence-model.md) once; it explains what every label covers and what it does not.

Two habits help:

- Read the design chain and the implementation chain separately. A correct circuit for a weak matrix and a strong matrix with a broken circuit are both common.
- Treat `not_established` as "this method did not decide it", never as "false".

## 5. Search and measure

```sh
npx cryptificate experiment examples/designs/aes.json --program examples/programs/aes-known-shared-sum.json --profile quick
```

The quick profile spends at most 180 seconds: at most eight generated candidates, ten seconds of synthesis, one shortlisted candidate. The research profile spends 900 seconds with up to 64 candidates and three shortlisted. Every shortlisted candidate is proved equivalent in Lean and passes the native correctness corpus before it is timed. The verdict is `locally confirmed`, `inconclusive` or `no improvement`; see [batch-interface.md](batch-interface.md) for the protocol.

## 6. Share and replay

Download the bundle from the workbench, with `client.bundle(...)`, or with `cryptificate check ... --bundle out.tar.gz`. A colleague runs

```sh
npx cryptificate verify aes-check.tar.gz
```

`verify` reads only the bundle's inputs and claims, regenerates the certificate with the installed generator, checks it with the installed Lean toolchain and prints a claim-by-claim comparison. It never runs Lean, Rust or shell code from the bundle. Recorded timings are shown as historical; measuring again creates a new experiment.

## 7. Bring your own implementation language

Measured variants only need to export `mix_batch(input, output, column_count)` from a shared library. An OxCaml, C or assembly implementation can be compared against the Rust variants under the same harness and statistics. The ABI, layout and correctness corpus are in [batch-interface.md](batch-interface.md).

A verdict of `locally confirmed` covers one machine and the recorded workloads. A speedup worth reporting should hold on more than one machine and at more than one input size, the standard the [OxCaml cryptography study](https://github.com/fplaunchpad/oxcaml-crypto-study/blob/main/manifesto.md) sets for results that beat a baseline. To get there, replay the same experiment bundle on each machine: every run records its CPU, compiler and seeds, so the results can be compared side by side.

## Limits to keep in mind

- Checked profiles: GF(2⁸) width 4 (AES-like, 4 to 32 rounds) and BN254 width 3 (HADES, up to 160 rounds). Other widths are experimental.
- Activity figures are conservative lower bounds on active S-boxes. They do not rank passing designs and they are not security levels.
- Native timings describe the recorded machine and workload only.
