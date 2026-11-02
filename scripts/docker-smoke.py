#!/usr/bin/env python3
"""Smoke tests for the Cryptificate container image.

    python3 scripts/docker-smoke.py IMAGE

Runs, inside containers of IMAGE, with the repository's examples/ mounted at
/work/examples (steps 1 to 4 without network access):

  1. `cryptificate --version`;
  2. `check examples/designs/aes.json`: the four design claims are proved;
  3. `check` with examples/programs/aes-wrong-wire.json: the circuit is refuted
     in Lean and by the native harness (cargo and the C linker, offline);
  4. `verify` of every bundle in examples/bundles/aes-wrong-wire/: every
     re-checked claim matches;
  5. `serve` with the default bind address: healthy inside the container,
     not reachable through the published port;
  6. `serve --host 0.0.0.0` published on 127.0.0.1: capabilities, the web UI,
     an analysis through the Python client, and a cross-origin POST refused.

Standard library only. Exit status 0 when every step passed.
"""
from __future__ import annotations

import http.client
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "python"))

from cryptificate import Client  # noqa: E402

DOCKER = os.environ.get("DOCKER", "docker")
PORT = 4173  # inside the container
HOST_PORT = int(os.environ.get("SMOKE_HOST_PORT", "4173"))
LOOPBACK_ONLY_HOST_PORT = int(os.environ.get("SMOKE_LOOPBACK_HOST_PORT", "4174"))

DESIGN_CLAIMS = {
    "matrix.mds": "proved",
    "offsets.dispersion": "proved",
    "sbox.bijective": "proved",
    "activity.bound": "proved",
}
WRONG_WIRE_CLAIMS = {
    **DESIGN_CLAIMS,
    "circuit.equivalence": "refuted",
    "native.correctness": "refuted",
    # The image does not check the refinement proofs (docs/docker.md).
    "rust.refinement": "not_established",
}


class SmokeFailure(Exception):
    pass


def expect(cond: bool, message: str) -> None:
    if not cond:
        raise SmokeFailure(message)


def claim_statuses(report: Mapping[str, Any]) -> Dict[str, str]:
    return {c["id"]: c["status"] for c in report.get("claims", [])}


def expect_claims(report: Mapping[str, Any], expected: Mapping[str, str], what: str) -> None:
    got = claim_statuses(report)
    for cid, status in expected.items():
        expect(got.get(cid) == status, f"{what}: {cid} is {got.get(cid)!r}, expected {status!r} (all: {got})")


def expect_verified(result: Mapping[str, Any], what: str) -> None:
    expect(result.get("ok") is True, f"{what}: verify reported ok={result.get('ok')!r}")
    digest = result.get("inputDigest", {})
    expect(digest.get("recorded") == digest.get("recomputed"), f"{what}: input digest changed: {digest}")
    rows = result.get("rows", [])
    expect(any(r.get("result") == "match" for r in rows), f"{what}: no claim was re-checked")
    bad = [r for r in rows if r.get("result") == "mismatch"]
    expect(not bad, f"{what}: mismatching claims {bad}")


def docker(*args: str, check: bool = True, capture: bool = False) -> subprocess.CompletedProcess:
    print("+ docker " + " ".join(args), flush=True)
    return subprocess.run(
        [DOCKER, *args],
        check=check,
        text=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.STDOUT if capture else None,
    )


def run_cli(image: str, out: Path, *args: str) -> None:
    docker(
        "run", "--rm", "--no-healthcheck", "--network", "none",
        "-v", f"{ROOT / 'examples'}:/work/examples:ro",
        "-v", f"{out}:/work/out",
        image, *args,
    )


def read_json(path: Path) -> Any:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def wait_healthy(name: str, timeout: float = 240.0) -> None:
    deadline = time.monotonic() + timeout
    status = ""
    while time.monotonic() < deadline:
        r = docker("inspect", "--format", "{{.State.Status}} {{.State.Health.Status}}", name, capture=True)
        status = r.stdout.strip()
        if status == "running healthy":
            return
        if not status.startswith("running") or status.endswith("unhealthy"):
            break
        time.sleep(2)
    raise SmokeFailure(f"{name}: container status {status!r}")


def wait_logs(name: str, needle: str, timeout: float = 20.0) -> str:
    deadline = time.monotonic() + timeout
    logs = ""
    while time.monotonic() < deadline:
        logs = docker("logs", name, capture=True).stdout
        if needle in logs:
            break
        time.sleep(1)
    return logs


def start_service(image: str, name: str, host_port: int, *args: str) -> None:
    docker(
        "run", "-d", "--name", name,
        "--health-interval", "2s", "--health-start-period", "120s",
        "-p", f"127.0.0.1:{host_port}:{PORT}",
        image, *args,
    )


def http_request(method: str, url: str, body: Optional[bytes] = None, headers: Optional[Dict[str, str]] = None) -> tuple:
    req = urllib.request.Request(url, data=body, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return res.status, {k.lower(): v for k, v in res.headers.items()}, res.read()
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in e.headers.items()}, e.read()


def step_cli(image: str, out: Path) -> None:
    run_cli(image, out, "--version")

    run_cli(image, out, "check", "examples/designs/aes.json", "--json", "out/aes.json")
    expect_claims(read_json(out / "aes.json"), DESIGN_CLAIMS, "check aes.json")

    run_cli(
        image, out, "check", "examples/designs/aes.json",
        "--program", "examples/programs/aes-wrong-wire.json", "--json", "out/aes-wrong-wire.json",
    )
    expect_claims(read_json(out / "aes-wrong-wire.json"), WRONG_WIRE_CLAIMS, "check aes.json with aes-wrong-wire.json")

    bundles = sorted((ROOT / "examples" / "bundles" / "aes-wrong-wire").glob("*.tar.gz"))
    expect(bool(bundles), "no bundle in examples/bundles/aes-wrong-wire")
    for bundle in bundles:
        rel = bundle.relative_to(ROOT).as_posix()
        out_json = f"out/verify-{bundle.stem}.json"
        run_cli(image, out, "verify", rel, "--json", out_json)
        expect_verified(read_json(out / Path(out_json).name), f"verify {rel}")


def step_loopback_default(image: str) -> None:
    name = "cryptificate-smoke-loopback"
    docker("rm", "-f", name, check=False, capture=True)
    try:
        start_service(image, name, LOOPBACK_ONLY_HOST_PORT)
        # The healthcheck runs inside the container, where loopback answers.
        wait_healthy(name)
        url = f"http://127.0.0.1:{LOOPBACK_ONLY_HOST_PORT}/api/capabilities"
        try:
            status, _, _ = http_request("GET", url)
        except (OSError, http.client.HTTPException) as e:
            print(f"   {url} is not reachable from the host, as expected ({e.__class__.__name__})")
        else:
            raise SmokeFailure(f"default serve answered {status} through the published port; it should bind loopback only")
        logs = wait_logs(name, "listening on")
        expect("listening on http://127.0.0.1:" in logs, f"default serve did not bind 127.0.0.1:\n{logs}")
        expect("does not reach" in logs, f"default serve printed no note about publishing the port:\n{logs}")
    except Exception:
        docker("logs", name, check=False)
        raise
    finally:
        docker("rm", "-f", name, check=False, capture=True)


def step_published(image: str) -> None:
    name = "cryptificate-smoke-serve"
    docker("rm", "-f", name, check=False, capture=True)
    base = f"http://127.0.0.1:{HOST_PORT}"
    try:
        start_service(image, name, HOST_PORT, "serve", "--host", "0.0.0.0")
        wait_healthy(name)
        client = Client(base)
        caps = client.capabilities()
        tc = caps["toolchain"]
        for part in ("lean", "rust", "engine"):
            expect(tc[part].get("available") is True, f"capabilities: {part} unavailable: {tc[part]}")
        expect("detail" not in tc["lean"], f"capabilities: {tc['lean']}")

        status, headers, body = http_request("GET", f"{base}/")
        expect(status == 200 and "text/html" in headers.get("content-type", ""), f"GET / gave {status} {headers}")
        expect(b"<html" in body.lower(), "GET / did not return the workbench")

        design = read_json(ROOT / "examples" / "designs" / "aes.json")
        job = client.analyze(design)
        final = client.wait(job["id"], poll=1.0, timeout=300)
        expect(final["state"] == "completed", f"analysis ended {final['state']}")
        expect_claims(final["report"], DESIGN_CLAIMS, "analysis through the service")

        status, _, _ = http_request(
            "POST", f"{base}/api/analyses",
            body=json.dumps({"design": design}).encode(),
            headers={"content-type": "application/json", "origin": "http://evil.example"},
        )
        expect(status == 403, f"cross-origin POST gave {status}, expected 403")
    except Exception:
        docker("logs", name, check=False)
        raise
    finally:
        docker("rm", "-f", name, check=False, capture=True)


def main(argv: List[str]) -> int:
    if len(argv) != 1 or argv[0].startswith("-"):
        print("usage: python3 scripts/docker-smoke.py IMAGE", file=sys.stderr)
        return 2
    image = argv[0]
    out = Path(tempfile.mkdtemp(prefix="cryptificate-smoke-"))
    # The container runs as uid 1000; let it write the JSON results.
    out.chmod(0o777)
    steps = [
        ("command line: check and verify", lambda: step_cli(image, out)),
        ("serve: loopback by default", lambda: step_loopback_default(image)),
        ("serve: published on 127.0.0.1", lambda: step_published(image)),
    ]
    try:
        for title, fn in steps:
            print(f"\n== {title}", flush=True)
            fn()
            print(f"== {title}: passed", flush=True)
    except (SmokeFailure, subprocess.CalledProcessError) as e:
        print(f"\nsmoke test failed: {e}", file=sys.stderr)
        return 1
    finally:
        shutil.rmtree(out, ignore_errors=True)
    print("\nAll smoke tests passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
