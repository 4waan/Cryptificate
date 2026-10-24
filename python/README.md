# cryptificate (Python client)

Standard-library client for the local Cryptificate service (`cryptificate serve`).

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
python -m cryptificate check examples/designs/aes.json --program examples/programs/aes-shared-sum.json
python -m cryptificate experiment examples/designs/aes.json --profile quick
python -m cryptificate capabilities
```

`--url` (or `CRYPTIFICATE_URL`) selects another service address.

Helpers build requests in the wire format, where field elements are strings: `gf(0x1b) == "1B"`,
`bn(-1)` is the canonical decimal of `p - 1`. `ProgramBuilder` assembles linear programs
register by register (`add`, `mul`, `xtime`, `sum`).

Tests: `python -m unittest discover -s tests` from this directory.
