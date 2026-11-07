# cryptificate (Python client)

Standard-library client for the local Cryptificate service (`cryptificate serve`).

```sh
pip install ./python          # from the repository root; or: PYTHONPATH=python python -m cryptificate ...
```

```python
from cryptificate import Client, aes_like_design, aes_shared_sum_program

client = Client("http://127.0.0.1:4173")
job = client.analyze(aes_like_design(rounds=10), program=aes_shared_sum_program())
final = client.wait(job["id"])
for claim in final["report"]["claims"]:
    print(claim["id"], claim["status"], claim["evidence"]["label"])
client.bundle(job["id"], "evidence.tar.gz")
```

Command line (the service must be running):

```sh
python -m cryptificate check examples/designs/aes.json --program examples/programs/aes-known-shared-sum.json
python -m cryptificate experiment examples/designs/aes.json --profile quick
python -m cryptificate capabilities
```

`--url` (or `CRYPTIFICATE_URL`) selects another service address.

Helpers build requests in the wire format, where field elements are strings: `gf(0x1b) == "1B"`,
`bn(-1)` is the canonical decimal of `p - 1`. `ProgramBuilder` assembles linear programs
register by register (`add`, `mul`, `xtime`, `sum`).

`prime_design(field, external, internal, full_rounds, partial_rounds, exponent)` builds a HADES
design over BabyBear, KoalaBear, Mersenne31 or Goldilocks (`PRIME_FIELDS`), or over a custom prime
below `2^64` with `field="prime", modulus=p`, at width 2, 3, 4, 8, 12, 16 or 24 (above 4 the report
checks `external.m4_mds` and `external.invertible` instead of the external matrix's minors;
`poseidon2_external(t)` and `one_plus_diagonal(V)` build Poseidon2's matrices). Every report proves
the modulus prime in Lean (claim `field.prime`) before the other claims; circuits, experiments and
native timing are not offered over these fields.

```python
from cryptificate import prime_design

m4 = [[5, 7, 1, 3], [4, 6, 1, 1], [1, 3, 5, 7], [1, 1, 4, 6]]
internal = [[2, 1, 1, 1], [1, 3, 1, 1], [1, 1, 5, 1], [1, 1, 1, 9]]
job = client.analyze(prime_design("koalabear", m4, internal, 8, 20, 3))
```

Tests: `python -m unittest discover -s tests` from this directory.
