# HTTP API

`cryptificate serve` runs a local HTTP service. The web workbench and the
[Python client](../python) use it, and other tools can too. (The `cryptificate check` and
`experiment` commands run the same pipelines in-process, without the service.)

- The machine-readable description is [`schemas/openapi.json`](../schemas/openapi.json)
  (OpenAPI 3.1). It refers to the JSON Schemas next to it by `$ref`.
- A running service serves the same description at `GET /api/openapi.json`, as one
  self-contained document: the schemas are embedded under `components/schemas` and every
  reference is local, so code generators and API browsers can load it from the URL.
- Every example in the description is a response recorded from a live service (version 0.1.0,
  release engine, Lean checker), except the fixed body of the 500 response.

The test `apps/server/test/openapi.test.ts` keeps the description and the service in step: the
routes the handler dispatches and the operations described are the same set, every example
validates against its schema, every error code the handler can produce is documented, and live
responses of an in-process service validate against the description.

## Endpoints

| Method and path | Operation | Success |
|---|---|---|
| `GET /api/capabilities` | models, experiment profiles and budgets, limits, toolchain availability | 200 |
| `GET /api/openapi.json` | this description | 200 |
| `POST /api/analyses` | submit an analysis (design, optional circuit) | 202 |
| `POST /api/experiments` | submit an experiment (search, check and time circuits) | 202 |
| `GET /api/jobs/{id}` | poll a job: state, steps, partial or final report | 200 |
| `POST /api/jobs/{id}/stop` | stop a queued or running job | 200 |
| `GET /api/jobs/{id}/bundle` | download the evidence bundle of a finished job | 200 |
| `GET /` and other non-API paths | the built web workbench (static files) | 200 |

There is no endpoint that lists jobs and no streaming endpoint: keep the ids you submit and poll.

Request bodies are [`AnalysisRequest`](../schemas/analysis-request.schema.json) and
[`ExperimentRequest`](../schemas/experiment-request.schema.json). The job is
[`Job`](../schemas/job.schema.json), its report an
[`AnalysisReport`](../schemas/analysis-report.schema.json) or
[`ExperimentReport`](../schemas/experiment-report.schema.json), and every error an
[`ErrorResponse`](../schemas/error.schema.json). Field elements are strings: two hex digits for
GF(2⁸) (`"1B"`), canonical decimals below the modulus for BN254. Requests are checked strictly
(unknown members are rejected); responses may gain new optional members, which clients should
ignore.

## Security model

The service is a single-user local tool. It has **no authentication**: whoever can send it a
request can run jobs on the machine.

- **Binding.** It listens on `127.0.0.1:4173` by default (`--port`, `PORT`, `--host`). Binding
  to another address prints a warning, because anyone who can reach it can then run jobs.
- **Host check (every request).** The `Host` header must name a loopback address (`127.0.0.1`,
  `localhost`, `::1`) or the address the service is bound to; otherwise the answer is 403
  `forbidden`. This defeats DNS rebinding, where a web page on another name reaches the local
  port. When the service is bound to `0.0.0.0` or `::`, only loopback names are accepted.
- **Same-origin writes.** For every method other than GET, HEAD and OPTIONS: an `Origin`
  header, when present, must be `http://<allowed host>:<this port>` or one of the origins given
  with `--allow-origin URL` (repeatable) or `CRYPTIFICATE_ALLOWED_ORIGINS` (comma-separated);
  without `Origin`, a `Sec-Fetch-Site` header other than `same-origin` or `none` is rejected.
  A web page on another site therefore cannot submit or stop jobs.
- **Non-browser clients** (curl, Python, scripts) send neither `Origin` nor `Sec-Fetch-Site` and
  are accepted.
- **No CORS.** The service sends no `Access-Control-*` headers, so pages on other origins cannot
  read its responses either. `--allow-origin` exists for a development UI server that proxies
  to the service.
- **Response headers.** Every response carries `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` and
  `Cross-Origin-Resource-Policy: same-origin`. JSON responses are `Cache-Control: no-store`
  (the description itself is `no-cache`).

```sh
curl -sS -H 'Host: evil.example:4173' http://127.0.0.1:4173/api/capabilities
# {"error":{"code":"forbidden","message":"Host header is not a loopback address"}}
curl -sS -X POST -H 'Origin: http://evil.example' -H 'Content-Type: application/json' \
  -d '{}' http://127.0.0.1:4173/api/analyses
# {"error":{"code":"forbidden","message":"cross-origin request rejected"}}
```

## Submitting a job

```sh
B=http://127.0.0.1:4173
printf '{"design":%s,"program":%s}' \
  "$(cat examples/designs/aes.json)" "$(cat examples/programs/aes-wrong-wire.json)" > request.json
curl -sS -i -X POST "$B/api/analyses" -H 'Content-Type: application/json' -d @request.json
```

```http
HTTP/1.1 202 Accepted
location: /api/jobs/9d4777dbeae6b987f0e2ce28b7993cfe

{"job":{"id":"9d4777dbeae6b987f0e2ce28b7993cfe","kind":"analysis","state":"queued","origin":"live"}}
```

An experiment takes a `profile` (`quick` or `research`, budgets in
`GET /api/capabilities`) and an optional hex `seed`:

```sh
printf '{"design":%s,"profile":"quick","seed":"c0ffee"}' "$(cat examples/designs/aes.json)" \
  | curl -sS -X POST "$B/api/experiments" -H 'Content-Type: application/json' -d @-
```

The body must be `Content-Type: application/json`, at most 256 KiB, and of the documented shape.
The service checks the shape before it creates a job and answers 400 `invalid-request` with
every problem found (up to 50), each with a JSON Pointer into the request:

```json
{"error":{"code":"invalid-request","message":"/design/matrix/0/1: field elements are strings, not numbers"},
 "errors":[{"path":"/design/matrix/0/1","code":"type","message":"field elements are strings, not numbers"},
           {"path":"/design/rounds","code":"range","message":"expected an integer in 4..32"}]}
```

The engine then validates the request in depth as the job's first step (matrix and circuit
semantics), so a request that passes the shape check can still end in state `invalid`, with the
reason in the job's `error`.

## Job lifecycle

```text
queued ──► running ──► completed | failed | timeout | cancelled | invalid
   └──────────────────► cancelled (stopped while queued)
```

| State | Meaning |
|---|---|
| `queued` | waiting; `queuePosition` is 1 for the next job to run |
| `running` | executing; `steps` and a partial `report` are visible |
| `completed` | the run finished; the claims say what was proved, refuted or not established |
| `failed` | a step failed (`error` says which); completed checkpoints are kept |
| `timeout` | the job's time budget ran out; unchecked claims are `not_established`, never refuted |
| `cancelled` | stopped; completed checkpoints are kept |
| `invalid` | the engine rejected the request; no bundle |

The steps of an analysis are `validate`, `diagnose`, `emit-lean`, `lean`, `native` and
`report`; those of an experiment are `validate`, `search`, `equivalence`,
`native-correctness`, `benchmark-1`, `benchmark-2`, `benchmark-3` and `report`. Each step has
a state (`pending`, `running`, `completed`, `failed`, `timeout`, `cancelled`, `skipped`,
`not_run`, ...), and once it ends, its duration in `ms` and sometimes a `detail`.

`origin` is `live` for a fresh run and `cached` when an identical analysis (same inputs, toolchain pins,
checker version and certificate sources) was answered from the proof cache.

Finished jobs survive a restart of the service: the 200 most recently updated jobs in the state
directory (`CRYPTIFICATE_HOME`, by default `.cryptificate/` in the checkout) are loaded at
start. Jobs that were queued or running when the service stopped are not resumed: they read
`cancelled`, or `failed` with error code `interrupted`.

## Polling

Poll `GET /api/jobs/{id}` until the state is terminal. The workbench polls every 800 ms; once a
second is enough for scripts. The response is the whole job each time.

```sh
ID=9d4777dbeae6b987f0e2ce28b7993cfe
while :; do
  STATE=$(curl -fsS "$B/api/jobs/$ID" | python3 -c 'import json,sys; print(json.load(sys.stdin)["state"])')
  case $STATE in queued|running) sleep 1 ;; *) break ;; esac
done
curl -fsS "$B/api/jobs/$ID" | python3 -c '
import json, sys
for c in json.load(sys.stdin)["report"]["claims"]:
    print(c["id"], c["status"], c["evidence"]["label"])'
```

```text
matrix.mds proved Lean-checked proof
offsets.dispersion proved Lean-checked proof
sbox.bijective proved Lean-checked proof
activity.bound proved Lean-checked proof
circuit.equivalence refuted Lean-checked counterexample
...
```

`POST /api/jobs/{id}/stop` (no body needed) removes a queued job at once and signals a running
one, whose whole process group is killed; the job then becomes `cancelled`. The response is the
summary at the time of the call, so poll to see the final state. Stopping a finished job
changes nothing.

## Limits and the queue

| Limit | Value | Where to read it |
|---|---|---|
| Request body | 256 KiB; beyond, 413 `body-too-large` and the connection is closed | `limits.maxBodyBytes` |
| Circuit length | 256 instructions | `limits.maxInstructions` |
| Concurrency | one job runs at a time | |
| Queue | two jobs wait behind it; a further submission gets 429 `queue-full` with `Retry-After: 30` | `limits.maxQueued` |
| Analysis budget | 300 s per analysis | `limits.analysisBudgetSeconds` |
| Experiment budget | per profile (`quick` 180 s, `research` 900 s) | `profiles[].budget.totalSeconds` |
| One Lean run | 180 s, and never beyond the remaining budget | `limits.leanTimeoutSeconds` |

The queue is the only rate limit: there is no per-client accounting. On 429, wait for the
`Retry-After` delay (or for one of your jobs to finish) and submit again.

```sh
curl -sS -i -X POST "$B/api/analyses" -H 'Content-Type: application/json' -d @request.json
# HTTP/1.1 429 Too Many Requests
# retry-after: 30
# {"error":{"code":"queue-full","message":"one job is running and the queue is full; try again later"}}
```

## Downloading the bundle

When a job is terminal, not `invalid` and has a report, its `bundle` member is `true` and
`GET /api/jobs/{id}/bundle` returns a gzip-compressed tar archive:

```sh
curl -fsS -OJ "$B/api/jobs/$ID/bundle"   # saves cryptificate-<id>.tar.gz
npx cryptificate verify "cryptificate-$ID.tar.gz"
```

The bundle holds the normalized inputs, the report, the generated Lean certificates and the
checker's output, the toolchain pins, native sources and measurements when those steps ran, and
`VERIFY.md` ([contents](../examples/bundles/README.md)). It is deterministic: the same job
always yields the same bytes. Before the job is terminal, or when it ended without a report,
the answer is 409 `not-ready`:

```json
{"error":{"code":"not-ready","message":"the job has not finished"}}
```

## Errors

Every error is JSON, `{"error": {"code", "message"}}`, plus `errors` for 400
`invalid-request`. `code` is stable; `message` is for people and may change.

| Status | `code` | When |
|---|---|---|
| 400 | `bad-json` | the body is not JSON |
| 400 | `invalid-request` | the body is not a request of the documented shape (`errors` lists each issue) |
| 403 | `forbidden` | the request failed the Host or Origin check |
| 404 | `not-found` | no such job; a GET or POST under `/api/` that matches no route, including a documented path with the other method (`GET /api/analyses`, `POST /api/capabilities`); or no `schemas/openapi.json` in this installation |
| 405 | `method-not-allowed` | any method other than GET and POST under `/api/` (PUT, DELETE, PATCH, OPTIONS, and HEAD even on a GET endpoint), or a method other than GET and HEAD outside `/api/`; no `Allow` header is sent |
| 409 | `not-ready` | bundle requested before the job finished, or for a job without a report or with an invalid request |
| 413 | `body-too-large` | the body exceeds 256 KiB (a client still uploading may see the connection reset instead) |
| 415 | `unsupported-media-type` | the body is not `Content-Type: application/json` |
| 429 | `queue-full` | one job runs and two are queued |
| 500 | `internal` | an unexpected failure in the service |

A job that fails does not produce an HTTP error: it is a job in state `failed`, `timeout` or
`invalid` with an `error` member.

## Checking documents against the schemas

`@cryptificate/schema` exports `SchemaRegistry`, a dependency-free validator for the JSON
Schemas in `schemas/` (see [its README](../packages/schema/README.md)). The Python client
documents its methods, one per operation, in [`python/README.md`](../python/README.md).
