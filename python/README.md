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
client.report_html(job["id"], "report.html")  # the bundle's printable HTML evidence report
```

## Methods

`Client(base_url="http://127.0.0.1:4173", timeout=30.0)` has one method per operation of the
HTTP API ([`docs/api.md`](../docs/api.md), [`schemas/openapi.json`](../schemas/openapi.json)).
Every method returns the decoded JSON body.

| Method | Request | Returns |
| --- | --- | --- |
| `capabilities()` | `GET /api/capabilities` | models, profiles, limits, toolchain availability |
| `openapi()` | `GET /api/openapi.json` | the OpenAPI 3.1 description, schemas embedded |
| `analyze(design, program=None, target=None)` | `POST /api/analyses` | the job summary `{id, kind, state, origin}` |
| `experiment(design, program=None, profile="quick", seed=None)` | `POST /api/experiments` | the job summary |
| `job(job_id)` | `GET /api/jobs/{id}` | state, steps, queue position, error and the (partial) report |
| `stop(job_id)` | `POST /api/jobs/{id}/stop` | the job summary at the time of the call |
| `bundle(job_id, path)` | `GET /api/jobs/{id}/bundle` | the path the `.tar.gz` bundle was written to |
| `report_html(job_id, path)` | `GET /api/jobs/{id}/report.html` | the path the HTML evidence report was written to |
| `wait(job_id, poll=1.0, timeout=None, on_progress=None)` | polls `GET /api/jobs/{id}` | the job once its state is terminal |

`cryptificate.OPERATIONS` maps each `operationId` of the description to its method.

Error responses raise `CryptificateError` with `status` (the HTTP status, 0 when the service
cannot be reached), `code` (the stable error code: `invalid-request`, `queue-full`,
`not-found`, `not-ready`, ...), `message`, `errors` (the `{path, code, message}` issues of a
400 response) and `retry_after` (seconds, on 429). `wait` raises `wait-timeout` when its own
`timeout` passes; the job keeps running.

```python
from cryptificate import CryptificateError

try:
    job = client.analyze(design)
except CryptificateError as e:
    if e.code == "queue-full":
        time.sleep(e.retry_after or 30)   # one job runs and two wait; retry later
    elif e.code == "invalid-request":
        for issue in e.errors:
            print(issue["path"], issue["message"])
```

## Command line

The service must be running:

```sh
python -m cryptificate check examples/designs/aes.json --program examples/programs/aes-known-shared-sum.json
python -m cryptificate experiment examples/designs/aes.json --profile quick
python -m cryptificate job <id>            # print the job as JSON
python -m cryptificate stop <id>
python -m cryptificate bundle <id> evidence.tar.gz
python -m cryptificate capabilities
python -m cryptificate openapi
```

`check` and `experiment` submit, wait and print the claims (`--json` and `--bundle` save the
final job and its bundle). `--url` (or `CRYPTIFICATE_URL`) selects another service address.

Helpers build requests in the wire format, where field elements are strings: `gf(0x1b) == "1B"`,
`bn(-1)` is the canonical decimal of `p - 1`. `ProgramBuilder` assembles linear programs
register by register (`add`, `mul`, `xtime`, `sum`).

`prime_design(field, external, internal, full_rounds, partial_rounds, exponent)` builds a HADES
design over BabyBear, KoalaBear, Mersenne31 or Goldilocks (`PRIME_FIELDS`), or over a custom prime
below `2^64` with `field="prime", modulus=p`, at width 3 or 4. Every report on such a design proves
the modulus prime in Lean (claim `field.prime`) before the other claims; circuits, experiments and
native timing are not offered over these fields.

```python
from cryptificate import prime_design

m4 = [[5, 7, 1, 3], [4, 6, 1, 1], [1, 3, 5, 7], [1, 1, 4, 6]]
internal = [[2, 1, 1, 1], [1, 3, 1, 1], [1, 1, 5, 1], [1, 1, 1, 9]]
job = client.analyze(prime_design("koalabear", m4, internal, 8, 20, 3))
```

Tests: `python -m unittest discover -s tests` from this directory. `tests/test_openapi.py`
checks that every operation in `schemas/openapi.json` has a method and runs the client against
the responses recorded there.
