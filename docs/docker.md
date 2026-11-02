# Running Cryptificate in a container

The repository's [`Dockerfile`](../Dockerfile) builds one image with everything `cryptificate serve`, `check`, `experiment` and `verify` need:

| Part | Version | Where it comes from |
|---|---|---|
| Lean toolchain | `lean/lean-toolchain` (v4.33.1) | elan 4.2.4, release archive checked against a pinned SHA-256 |
| Lean packages and Mathlib's compiled library | `lean/lake-manifest.json` | `lake exe cache get`, as in `scripts/setup.sh` |
| Certificate library | this checkout's `lean/` | `lake build` |
| `cryptificate-engine` | this checkout's `crates/` | `cargo build --release --locked` |
| Rust toolchain, `gcc` linker, every crate in `Cargo.lock` | Rust 1.97.1 | `rust:1.97.1-slim-trixie`, used to compile the generated native variants without network access |
| Service, `cryptificate` command, workbench | this checkout's `apps/` and `packages/` | `npm ci` and `npm run build` |
| Node.js runtime | 22.23.4 | `node:22.23.4-trixie-slim` |
| Base | Debian 13 (trixie) slim | `debian:trixie-slim` |

Every base image is pinned by tag and by digest in the Dockerfile. The image is large, over 10 GB unpacked: the Lean toolchain takes about 3 GB and the Lean packages, with Mathlib's compiled library, about 7 GB.

## Get the image

Pushing a version tag `v*` publishes the image that passed the [smoke tests](#what-ci-checks) to `ghcr.io/4waan/cryptificate`, tagged with the version, `major.minor`, `latest` and the commit (`sha-…`). Only `linux/amd64` is built.

```sh
docker pull ghcr.io/4waan/cryptificate:latest
```

Or build it from a checkout. The build downloads the Lean toolchain, Mathlib's cache, the locked crates and the npm packages. Plan for roughly 25 GB of free disk: the Lean build stage and the finished image each hold a copy of the toolchain and Mathlib.

```sh
docker build -t cryptificate .
```

The examples below use `ghcr.io/4waan/cryptificate`; with a local build, write `cryptificate` instead.

## Serve the workbench

```sh
docker run --rm -p 127.0.0.1:4173:4173 ghcr.io/4waan/cryptificate serve --host 0.0.0.0
```

Then open `http://127.0.0.1:4173/`.

The service has no authentication, so it never leaves loopback on its own:

- **Inside the container it binds `127.0.0.1` by default**, as it does everywhere else. A port published with `-p` does not reach the container's loopback interface, so the workbench is reachable from the host only after you pass `--host 0.0.0.0`, or set `-e CRYPTIFICATE_HOST=0.0.0.0`. Without either, `serve` prints a note saying so.
- **Publish the port on the host's loopback**, as in `-p 127.0.0.1:4173:4173`. A bare `-p 4173:4173` publishes it on every interface of the host, so anyone on your network can run jobs.
- **Keep the same port number on both sides.** Every request must carry a loopback `Host` header (`127.0.0.1`, `localhost` or `[::1]`), and a `POST` with an `Origin` header is accepted only from the service's own origin, so the port in the browser's address bar must be the one the service listens on. For another port, change both: `-p 127.0.0.1:8080:8080 … serve --host 0.0.0.0 --port 8080`. Alternatively, keep the container on 4173 and allow the published origin: `-p 127.0.0.1:8080:4173 … serve --host 0.0.0.0 --allow-origin http://127.0.0.1:8080`.

Jobs and the proof cache live in `/var/lib/cryptificate` inside the container. To keep them across runs, mount a named volume there:

```sh
docker run --rm -p 127.0.0.1:4173:4173 -v cryptificate-state:/var/lib/cryptificate \
  ghcr.io/4waan/cryptificate serve --host 0.0.0.0
```

The Python client and the HTTP API work against the published port as they do against a local service: `Client("http://127.0.0.1:4173")`.

## Check a design file once

The image's working directory is `/work`; mount the directory that holds your files there.

```sh
docker run --rm -v "$PWD:/work" ghcr.io/4waan/cryptificate check my-design.json
docker run --rm -v "$PWD:/work" ghcr.io/4waan/cryptificate \
  check my-design.json --program my-circuit.json --json result.json --bundle evidence.tar.gz
```

The exit status is the one documented for the command: 0 when the run completed, whatever the claims say. The repository's examples are also in the image under `/opt/cryptificate/examples`:

```sh
docker run --rm ghcr.io/4waan/cryptificate check /opt/cryptificate/examples/designs/aes.json \
  --program /opt/cryptificate/examples/programs/aes-wrong-wire.json
```

The container runs as the user `cryptificate` (uid 1000, gid 1000). Files it writes into the mount, such as `--json` and `--bundle` outputs, belong to uid 1000, and the mounted directory must be writable by that uid. Running the image under another uid (`--user`) is not supported: the state directory and the Lean packages belong to uid 1000.

## Verify a bundle

```sh
docker run --rm -v "$PWD:/work:ro" ghcr.io/4waan/cryptificate \
  verify examples/bundles/aes-wrong-wire/aes-wrong-wire.tar.gz
```

`verify` reads the bundle's `inputs.json` and `report.json`, regenerates the certificate with the image's engine and templates, checks it with the image's Lean toolchain and prints the claim-by-claim comparison; it runs no code from the bundle. A read-only mount is enough unless you pass `--json`. The exit status is 0 when every re-checked claim matches.

## Experiments and timing

```sh
docker run --rm -v "$PWD:/work" ghcr.io/4waan/cryptificate \
  experiment examples/designs/aes.json --program examples/programs/aes-known-shared-sum.json --profile quick
```

Experiments compile each generated circuit with the image's Rust toolchain and the crates already in the image (`CARGO_NET_OFFLINE=true`), so they need no network access. The timings describe the container on your machine: they depend on the host CPU and on any CPU or memory limits you give Docker, and the bundle records the machine they were taken on.

## Scope and limits

- **Refinement proofs are not checked in the image.** Checking `refinement/` needs a second Lean toolchain (v4.35.0) and a second Mathlib build, which would double the image. In the image, `rust.refinement` therefore reads `not_established`, with a note saying so, also when the state directory mounted at `/var/lib/cryptificate` holds a `refinement.json` recorded by a source checkout: that file records a check made elsewhere, and the image does not read it. Check those proofs from a source checkout with `scripts/setup.sh --with-refinement`.
- **The image checks with its own files.** The engine, templates and `lean/` come from `/opt/cryptificate` (`CRYPTIFICATE_ROOT`, `CRYPTIFICATE_LEAN_DIR`), also when the directory mounted at `/work` is a Cryptificate checkout.
- **What Lean trusts is the same as in a local setup:** the toolchain named in `lean/lean-toolchain` and Mathlib's compiled library from its build cache, fetched by `lake exe cache get` exactly as `scripts/setup.sh` does. Certificates are accepted by the same rules as everywhere else; see the [evidence model](evidence-model.md#proof-acceptance).
- **Memory.** Each Lean check runs with `-M 3072`. Give Docker at least 8 GB.
- **Health check.** The image checks `GET /api/capabilities` on `127.0.0.1:$PORT` inside the container. It is meaningful for `serve`; for one-shot commands, pass `--no-healthcheck` or ignore it.
- **Version.** Reports name the checker as `cryptificate <version> (<revision>)`, where the revision is the `git describe` of the commit the image was built from (the `CRYPTIFICATE_REVISION` build argument; without it the revision is left out).
- **Platforms.** CI builds and tests `linux/amd64` only. The Dockerfile also pins elan for `arm64`, but no `arm64` image has been built or tested.

## What CI checks

The [docker workflow](../.github/workflows/docker.yml) builds the image with Docker Buildx and the GitHub Actions cache, then runs [`scripts/docker-smoke.py`](../scripts/docker-smoke.py) against it:

1. `cryptificate --version`;
2. `check examples/designs/aes.json`: the MDS, offsets, S-box and activity-bound claims are `proved`;
3. `check examples/designs/aes.json --program examples/programs/aes-wrong-wire.json`: the circuit is `refuted` in Lean and by the native harness, which compiles the generated Rust inside the container, and `rust.refinement` is `not_established`;
4. `verify examples/bundles/aes-wrong-wire/*.tar.gz`: the input digest is unchanged and every re-checked claim matches;
5. `serve` with no flags: healthy inside the container and not reachable through the published port;
6. `serve --host 0.0.0.0` published on `127.0.0.1`: capabilities report Lean, Rust and the engine available, `/` serves the workbench, an analysis submitted through the Python client proves the four design claims, and a cross-origin `POST` is refused with `403`.

Steps 1 to 4 run with `--network none`. On a version tag the workflow then pushes the image those steps ran against. With Docker installed, `python3 scripts/docker-smoke.py <image>` runs the same checks locally.
