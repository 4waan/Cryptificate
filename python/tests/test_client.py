import io
import json
import tempfile
import threading
import unittest
from contextlib import redirect_stderr, redirect_stdout
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from cryptificate import (
    AES_MIXCOLUMNS,
    Client,
    CryptificateError,
    ProgramBuilder,
    aes_like_design,
    aes_shared_sum_program,
    bn,
    bn_shared_sum_program,
    gf,
    hades_design,
    identity_program,
)
from cryptificate.__main__ import main


class FakeService(BaseHTTPRequestHandler):
    """In-memory stand-in for `cryptificate serve`."""

    jobs = {}
    requests = []

    def log_message(self, *args):  # silence
        pass

    def _send(self, status, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        parts = self.path.strip("/").split("/")
        if self.path == "/api/capabilities":
            return self._send(200, {"name": "cryptificate", "version": "0.1.0"})
        if len(parts) >= 3 and parts[1] == "jobs":
            job = self.jobs.get(parts[2])
            if not job:
                return self._send(404, {"error": {"code": "not-found", "message": "no such job"}})
            if len(parts) == 4 and parts[3] == "bundle":
                return self._send(200, b"\x1f\x8bfake", "application/gzip")
            job["polls"] += 1
            state = "completed" if job["polls"] >= 2 else "running"
            report = {
                "kind": "analysis",
                "claims": [
                    {"id": "matrix.mds", "chain": "design", "status": "proved", "evidence": {"label": "Lean-checked proof"}, "note": "checked"}
                ],
            }
            return self._send(200, {"id": parts[2], "kind": "analysis", "state": state, "origin": "live", "steps": [{"name": "lean", "state": state}], "report": report, "bundle": state == "completed"})
        return self._send(404, {"error": {"code": "not-found", "message": "no such endpoint"}})

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(length) or b"{}")
        FakeService.requests.append((self.path, body, self.headers.get("Content-Type"), self.headers.get("Origin")))
        if self.path in ("/api/analyses", "/api/experiments"):
            if body.get("design", {}).get("rounds") == 3:
                return self._send(400, {"error": {"code": "invalid-request", "message": "/design/rounds: expected an integer in 4..32"}, "errors": [{"path": "/design/rounds", "code": "range", "message": "expected an integer in 4..32"}]})
            if len(self.jobs) >= 3:
                return self._send(429, {"error": {"code": "queue-full", "message": "queue full"}})
            job_id = f"{len(self.jobs) + 1:032x}"
            self.jobs[job_id] = {"polls": 0}
            kind = "analysis" if self.path == "/api/analyses" else "experiment"
            return self._send(202, {"job": {"id": job_id, "kind": kind, "state": "queued", "origin": "live"}})
        return self._send(404, {"error": {"code": "not-found", "message": "no such endpoint"}})


class ClientTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), FakeService)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f"http://127.0.0.1:{cls.server.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        FakeService.jobs.clear()
        FakeService.requests.clear()
        self.client = Client(self.url, timeout=5)

    def test_analyze_wait_and_bundle(self):
        job = self.client.analyze(aes_like_design(), program=aes_shared_sum_program())
        self.assertEqual(job["kind"], "analysis")
        path, body, ctype, origin = FakeService.requests[-1]
        self.assertEqual(path, "/api/analyses")
        self.assertEqual(ctype, "application/json")
        self.assertIsNone(origin)
        self.assertEqual(body["design"]["matrix"], AES_MIXCOLUMNS)
        self.assertNotIn("target", body)
        final = self.client.wait(job["id"], poll=0.01)
        self.assertEqual(final["state"], "completed")
        with tempfile.TemporaryDirectory() as d:
            out = self.client.bundle(job["id"], Path(d) / "b.tar.gz")
            self.assertEqual(out.read_bytes()[:2], b"\x1f\x8b")

    def test_experiment_body(self):
        self.client.experiment(aes_like_design(), profile="research", seed="c0ffee")
        path, body, _, _ = FakeService.requests[-1]
        self.assertEqual(path, "/api/experiments")
        self.assertEqual(body["profile"], "research")
        self.assertEqual(body["seed"], "c0ffee")

    def test_errors_carry_status_code_and_paths(self):
        with self.assertRaises(CryptificateError) as cm:
            self.client.analyze(aes_like_design(rounds=3))
        self.assertEqual(cm.exception.status, 400)
        self.assertEqual(cm.exception.code, "invalid-request")
        self.assertEqual(cm.exception.errors[0]["path"], "/design/rounds")
        for _ in range(3):
            self.client.analyze(aes_like_design())
        with self.assertRaises(CryptificateError) as cm:
            self.client.analyze(aes_like_design())
        self.assertEqual(cm.exception.status, 429)
        with self.assertRaises(CryptificateError) as cm:
            self.client.job("f" * 32)
        self.assertEqual(cm.exception.status, 404)

    def test_unreachable_service(self):
        with self.assertRaises(CryptificateError) as cm:
            Client("http://127.0.0.1:9", timeout=1).capabilities()
        self.assertEqual(cm.exception.code, "unreachable")

    def test_command_line_check(self):
        with tempfile.TemporaryDirectory() as d:
            design = Path(d) / "aes.json"
            design.write_text(json.dumps(aes_like_design()))
            program = Path(d) / "p.json"
            program.write_text(json.dumps(aes_shared_sum_program()))
            out = Path(d) / "job.json"
            stdout, stderr = io.StringIO(), io.StringIO()
            with redirect_stdout(stdout), redirect_stderr(stderr):
                code = main(["--url", self.url, "check", str(design), "--program", str(program), "--json", str(out)])
            self.assertEqual(code, 0, stderr.getvalue())
            self.assertIn("matrix.mds", stdout.getvalue())
            self.assertIn("Lean-checked proof", stdout.getvalue())
            self.assertEqual(json.loads(out.read_text())["state"], "completed")


def gmul(k, a):
    r = 0
    while k:
        if k & 1:
            r ^= a
        a <<= 1
        if a & 0x100:
            a ^= 0x11B
        k >>= 1
    return r


def evaluate(program, x):
    regs = list(x)
    for ins in program["instructions"]:
        if ins["op"] == "add":
            regs.append(regs[ins["a"]] ^ regs[ins["b"]])
        else:
            regs.append(gmul(int(ins["k"], 16), regs[ins["a"]]))
    return [regs[o] for o in program["outputs"]]


class HelpersTest(unittest.TestCase):
    def test_encodings(self):
        self.assertEqual(gf(2), "02")
        self.assertEqual(gf("1b"), "1B")
        self.assertEqual(gf("0x80"), "80")
        self.assertRaises(ValueError, gf, 256)
        self.assertRaises(ValueError, gf, "xyz")
        self.assertEqual(bn(-1), "21888242871839275222246405745257275088548364400416034343698204186575808495616")
        self.assertEqual(bn("5"), "5")

    def test_aes_shared_sum_matches_mixcolumns(self):
        p = aes_shared_sum_program()
        ops = [i["op"] for i in p["instructions"]]
        self.assertEqual((ops.count("add"), ops.count("mul")), (15, 4))
        self.assertEqual(evaluate(p, [0x01, 0, 0, 0]), [0x02, 0x01, 0x01, 0x03])
        self.assertEqual(evaluate(p, [0x80, 0, 0, 0]), [0x1B, 0x80, 0x80, 0x9B])

    def test_builder_checks_registers(self):
        b = ProgramBuilder("gf256", 4)
        self.assertRaises(ValueError, b.add, 0, 4)
        r = b.add(0, 1)
        self.assertEqual(r, 4)
        self.assertRaises(ValueError, b.build, [0, 1, 2])
        self.assertEqual(identity_program()["outputs"], [0, 1, 2, 3])

    def test_designs(self):
        h = hades_design(exponent=3)
        self.assertEqual(h["sbox"], {"kind": "power", "exponent": 3})
        self.assertEqual(h["external"][0], ["2", "1", "1"])
        self.assertEqual(bn_shared_sum_program()["outputs"], [4 + 1, 4 + 2, 4 + 3])
        small = aes_like_design(matrix=[[3, 2], [2, 3]], offsets=[0, 1])
        self.assertTrue(small["experimental"])


if __name__ == "__main__":
    unittest.main()
