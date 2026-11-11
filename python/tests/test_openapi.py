"""The client against the OpenAPI description and its recorded responses.

A stand-in service answers every operation with the response recorded in
schemas/openapi.json, so these tests exercise the client on the real bodies,
status codes and headers of the service.
"""

import io
import json
import re
import tempfile
import threading
import unittest
from contextlib import redirect_stderr, redirect_stdout
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from cryptificate import OPERATIONS, Client, CryptificateError
from cryptificate.__main__ import main

ROOT = Path(__file__).resolve().parents[2]
SPEC = json.loads((ROOT / "schemas" / "openapi.json").read_text(encoding="utf-8"))
README = (ROOT / "python" / "README.md").read_text(encoding="utf-8")


def deref(node):
    while "$ref" in node:
        cur = SPEC
        for part in node["$ref"][2:].split("/"):
            cur = cur[part.replace("~1", "/").replace("~0", "~")]
        node = cur
    return node


def example(path, method, status, name):
    response = deref(SPEC["paths"][path][method]["responses"][str(status)])
    return response["content"]["application/json"]["examples"][name]["value"]


COMPLETED = example("/api/jobs/{id}", "get", 200, "completed")
JOB_ID = COMPLETED["id"]
GZIP = b"\x1f\x8b\x08\x00recorded"


class RecordedService(BaseHTTPRequestHandler):
    """Answers with the responses recorded in the OpenAPI description."""

    mode = "normal"
    seen = []

    def log_message(self, *args):
        pass

    def _send(self, status, body, ctype="application/json; charset=utf-8", headers=None):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        RecordedService.seen.append(("GET", self.path))
        if self.path == "/api/capabilities":
            return self._send(200, example("/api/capabilities", "get", 200, "live"))
        if self.path == "/api/openapi.json":
            return self._send(200, SPEC)
        m = re.fullmatch(r"/api/jobs/([0-9a-f]{32})(/bundle)?", self.path)
        if m and m.group(1) == JOB_ID:
            if m.group(2):
                if self.mode == "running":
                    return self._send(409, example("/api/jobs/{id}/bundle", "get", 409, "running"))
                return self._send(200, GZIP, "application/gzip", {"Content-Disposition": f'attachment; filename="cryptificate-{JOB_ID}.tar.gz"'})
            return self._send(200, example("/api/jobs/{id}", "get", 200, "running" if self.mode == "running" else "completed"))
        return self._send(404, example("/api/jobs/{id}", "get", 404, "not-found"))

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length)
        RecordedService.seen.append(("POST", self.path))
        if self.path in ("/api/analyses", "/api/experiments"):
            if self.mode == "full":
                return self._send(429, example("/api/analyses", "post", 429, "queue-full"), headers={"Retry-After": "30"})
            if json.loads(body or b"{}").get("design", {}).get("rounds") == 3:
                return self._send(400, example("/api/analyses", "post", 400, "invalid-request"))
            name = "analysis" if self.path == "/api/analyses" else "experiment"
            accepted = example("/api/analyses", "post", 202, name)
            return self._send(202, accepted, headers={"Location": f"/api/jobs/{accepted['job']['id']}"})
        if self.path == f"/api/jobs/{JOB_ID}/stop":
            return self._send(200, {"job": {k: COMPLETED[k] for k in ("id", "kind", "state", "origin")}})
        return self._send(404, example("/api/jobs/{id}", "get", 404, "not-found"))


class OpenApiCoverageTest(unittest.TestCase):
    def test_every_operation_has_a_client_method(self):
        ops = {
            op["operationId"]
            for path, item in SPEC["paths"].items()
            for method, op in item.items()
            if method in ("get", "post", "put", "delete", "patch") and path.startswith("/api/")
        }
        self.assertEqual(ops, set(OPERATIONS))
        for operation_id, method in OPERATIONS.items():
            self.assertTrue(callable(getattr(Client, method, None)), f"{operation_id}: Client.{method}")

    def test_readme_documents_every_method_and_command(self):
        for method in list(OPERATIONS.values()) + ["wait"]:
            self.assertRegex(README, rf"`(client\.)?{method}\(", f"README does not document {method}()")
        for command in ("check", "experiment", "job", "stop", "bundle", "capabilities", "openapi"):
            self.assertIn(f"python -m cryptificate {command}", README)


class RecordedResponsesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), RecordedService)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f"http://127.0.0.1:{cls.server.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        RecordedService.mode = "normal"
        RecordedService.seen.clear()
        self.client = Client(self.url, timeout=5)

    def test_capabilities_and_openapi(self):
        caps = self.client.capabilities()
        self.assertEqual(caps["limits"]["maxQueued"], 2)
        doc = self.client.openapi()
        self.assertEqual(doc["openapi"], "3.1.0")
        self.assertIn("/api/jobs/{id}/bundle", doc["paths"])

    def test_submit_poll_stop_and_bundle(self):
        job = self.client.analyze({"model": "aes-like/gf256/v1", "rounds": 4})
        self.assertEqual((job["kind"], job["state"]), ("analysis", "queued"))
        exp = self.client.experiment({"model": "aes-like/gf256/v1"}, profile="quick")
        self.assertEqual(exp["kind"], "experiment")
        final = self.client.wait(JOB_ID, poll=0.01)
        self.assertEqual(final["state"], "completed")
        statuses = {c["id"]: c["status"] for c in final["report"]["claims"]}
        self.assertEqual(statuses["circuit.equivalence"], "refuted")
        self.assertEqual(self.client.stop(JOB_ID)["id"], JOB_ID)
        with tempfile.TemporaryDirectory() as d:
            out = self.client.bundle(JOB_ID, Path(d) / "b.tar.gz")
            self.assertEqual(out.read_bytes(), GZIP)
        self.assertIn(("POST", f"/api/jobs/{JOB_ID}/stop"), RecordedService.seen)

    def test_recorded_errors(self):
        with self.assertRaises(CryptificateError) as cm:
            self.client.analyze({"rounds": 3})
        self.assertEqual((cm.exception.status, cm.exception.code), (400, "invalid-request"))
        self.assertEqual([e["path"] for e in cm.exception.errors], ["/design/matrix/0/1", "/design/rounds"])
        RecordedService.mode = "full"
        with self.assertRaises(CryptificateError) as cm:
            self.client.experiment({"model": "aes-like/gf256/v1"})
        self.assertEqual((cm.exception.status, cm.exception.code, cm.exception.retry_after), (429, "queue-full", 30))
        RecordedService.mode = "running"
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(CryptificateError) as cm:
                self.client.bundle(JOB_ID, Path(d) / "b.tar.gz")
            self.assertEqual((cm.exception.status, cm.exception.code), (409, "not-ready"))
            self.assertFalse((Path(d) / "b.tar.gz").exists())
        with self.assertRaises(CryptificateError) as cm:
            self.client.job("0" * 32)
        self.assertEqual((cm.exception.status, cm.exception.code, cm.exception.retry_after), (404, "not-found", None))

    def test_command_line_job_stop_and_openapi(self):
        for argv, expect in (
            (["job", JOB_ID], '"state": "completed"'),
            (["stop", JOB_ID], f"job {JOB_ID}: completed"),
            (["openapi"], '"openapi": "3.1.0"'),
        ):
            stdout, stderr = io.StringIO(), io.StringIO()
            with redirect_stdout(stdout), redirect_stderr(stderr):
                code = main(["--url", self.url] + argv)
            self.assertEqual(code, 0, stderr.getvalue())
            self.assertIn(expect, stdout.getvalue())
        stdout, stderr = io.StringIO(), io.StringIO()
        with redirect_stdout(stdout), redirect_stderr(stderr):
            code = main(["--url", self.url, "job", "0" * 32])
        self.assertEqual(code, 2)
        self.assertIn("404 not-found", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
