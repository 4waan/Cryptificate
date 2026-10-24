"""HTTP client for the local Cryptificate service (standard library only)."""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, Mapping, Optional, Union

DEFAULT_URL = "http://127.0.0.1:4173"
TERMINAL_STATES = ("completed", "failed", "timeout", "cancelled", "invalid")

JsonDict = Dict[str, Any]


class CryptificateError(Exception):
    """An error response from the service, or a transport failure."""

    def __init__(self, status: int, code: str, message: str, errors: Optional[list] = None):
        super().__init__(f"{status} {code}: {message}")
        self.status = status
        self.code = code
        self.message = message
        self.errors = errors or []


class Client:
    """Talks to `cryptificate serve` (by default on http://127.0.0.1:4173).

    >>> client = Client()
    >>> job = client.analyze(design, program=program)
    >>> final = client.wait(job["id"])
    >>> final["report"]["claims"]
    """

    def __init__(self, base_url: str = DEFAULT_URL, timeout: float = 30.0):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    # -- transport ---------------------------------------------------------

    def _request(self, method: str, path: str, body: Optional[Mapping[str, Any]] = None) -> urllib.request.addinfourl:
        data = None
        headers = {"Accept": "application/json"}
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(self.base_url + path, data=data, method=method, headers=headers)
        try:
            return urllib.request.urlopen(req, timeout=self.timeout)  # noqa: S310 (local service URL)
        except urllib.error.HTTPError as e:
            raw = e.read()
            code, message, errors = "http-error", e.reason or "request failed", []
            try:
                doc = json.loads(raw.decode("utf-8"))
                err = doc.get("error", {})
                code = err.get("code", code)
                message = err.get("message", message)
                errors = doc.get("errors", [])
            except (ValueError, AttributeError):
                pass
            raise CryptificateError(e.code, code, str(message), errors) from None
        except urllib.error.URLError as e:
            raise CryptificateError(0, "unreachable", f"cannot reach {self.base_url}: {e.reason}") from None

    def _json(self, method: str, path: str, body: Optional[Mapping[str, Any]] = None) -> JsonDict:
        with self._request(method, path, body) as res:
            return json.loads(res.read().decode("utf-8"))

    # -- API ---------------------------------------------------------------

    def capabilities(self) -> JsonDict:
        """Profiles, limits and toolchain availability of the service."""
        return self._json("GET", "/api/capabilities")

    def analyze(self, design: Mapping[str, Any], program: Optional[Mapping[str, Any]] = None, target: Optional[str] = None) -> JsonDict:
        """Submit an analysis; returns the job summary {id, kind, state, origin}."""
        body: JsonDict = {"design": dict(design)}
        if program is not None:
            body["program"] = dict(program)
        if target is not None:
            body["target"] = target
        return self._json("POST", "/api/analyses", body)["job"]

    def experiment(
        self,
        design: Mapping[str, Any],
        program: Optional[Mapping[str, Any]] = None,
        profile: str = "quick",
        seed: Optional[str] = None,
    ) -> JsonDict:
        """Submit an experiment; returns the job summary."""
        body: JsonDict = {"design": dict(design), "profile": profile}
        if program is not None:
            body["program"] = dict(program)
        if seed is not None:
            body["seed"] = seed
        return self._json("POST", "/api/experiments", body)["job"]

    def job(self, job_id: str) -> JsonDict:
        """Current state, progress steps and (partial) report of a job."""
        return self._json("GET", f"/api/jobs/{job_id}")

    def stop(self, job_id: str) -> JsonDict:
        """Stop a job; completed checkpoints are kept."""
        return self._json("POST", f"/api/jobs/{job_id}/stop", {})["job"]

    def wait(self, job_id: str, poll: float = 1.0, timeout: Optional[float] = None, on_progress=None) -> JsonDict:
        """Poll until the job reaches a terminal state and return the final job."""
        deadline = None if timeout is None else time.monotonic() + timeout
        while True:
            job = self.job(job_id)
            if on_progress is not None:
                on_progress(job)
            if job.get("state") in TERMINAL_STATES:
                return job
            if deadline is not None and time.monotonic() >= deadline:
                raise CryptificateError(0, "wait-timeout", f"job {job_id} still {job.get('state')} after {timeout} s")
            time.sleep(poll)

    def bundle(self, job_id: str, path: Union[str, Path]) -> Path:
        """Download the evidence bundle (.tar.gz) of a finished job to `path`."""
        target = Path(path)
        with self._request("GET", f"/api/jobs/{job_id}/bundle") as res:
            data = res.read()
        target.write_bytes(data)
        return target
