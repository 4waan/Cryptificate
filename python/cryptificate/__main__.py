"""Command line: python -m cryptificate check|experiment|capabilities|bundle ..."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from .client import DEFAULT_URL, Client, CryptificateError


def _load(path: str) -> Any:
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except OSError as e:
        raise SystemExit(f"cryptificate: cannot read {path}: {e.strerror}")
    except ValueError:
        raise SystemExit(f"cryptificate: {path} is not valid JSON")


def _request_parts(design_path: str, program_path: Optional[str]) -> Dict[str, Any]:
    doc = _load(design_path)
    parts = dict(doc) if isinstance(doc, dict) and "design" in doc else {"design": doc}
    if program_path:
        parts["program"] = _load(program_path)
    return parts


def _table(headers: List[str], rows: List[List[str]]) -> str:
    widths = [max([len(h)] + [len(r[i]) for r in rows]) for i, h in enumerate(headers)]
    line = lambda cells: "  ".join(c.ljust(widths[i]) for i, c in enumerate(cells)).rstrip()  # noqa: E731
    return "\n".join([line(headers), line(["-" * w for w in widths])] + [line(r) for r in rows])


def _progress(enabled: bool):
    seen: Dict[str, str] = {}

    def show(job: Dict[str, Any]) -> None:
        if not enabled:
            return
        for step in job.get("steps", []):
            state = step.get("state")
            if state == "pending" or seen.get(step["name"]) == state:
                continue
            seen[step["name"]] = state
            ms = step.get("ms")
            extra = f" {ms / 1000:.1f} s" if isinstance(ms, (int, float)) else ""
            print(f"  {step['name']}: {state}{extra}", file=sys.stderr)

    return show


def _print_report(job: Dict[str, Any]) -> None:
    report = job.get("report") or {}
    print(f"job {job['id']}: {job['state']} (origin {job.get('origin', 'live')})")
    if job.get("error"):
        err = job["error"]
        print(f"error: {err.get('path', '')} {err.get('message', '')}".strip())
    if report.get("kind") == "analysis":
        rows = [[c["chain"], c["id"], c["status"], c["evidence"]["label"]] for c in report.get("claims", [])]
        print(_table(["chain", "claim", "status", "evidence"], rows))
        for c in report.get("claims", []):
            if c.get("note"):
                print(f"  {c['id']}: {c['note']}")
    elif report.get("kind") == "experiment":
        rows = []
        for c in report.get("candidates", []):
            native = c.get("native")
            rows.append([c["id"], c["origin"], c["equivalence"]["status"], ("passed" if native and native.get("passed") else "failed" if native else "not run")])
        print(_table(["candidate", "origin", "equivalence", "native"], rows))
        m = report.get("measurements")
        print(f"verdict: {m['verdict']}" if m else "no measurements")


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m cryptificate", description="Client for a running `cryptificate serve`.")
    parser.add_argument("--url", default=os.environ.get("CRYPTIFICATE_URL", DEFAULT_URL), help=f"service URL (default {DEFAULT_URL})")
    sub = parser.add_subparsers(dest="command", required=True)

    check = sub.add_parser("check", help="analyze a design and optional circuit")
    check.add_argument("design", help="CandidateDesign JSON (or a full AnalysisRequest)")
    check.add_argument("--program", help="Program JSON")
    check.add_argument("--target", choices=["matrix", "external", "internal"])
    check.add_argument("--json", help="write the final job (with report) to this file")
    check.add_argument("--bundle", help="download the evidence bundle to this file")
    check.add_argument("--quiet", "-q", action="store_true")

    exp = sub.add_parser("experiment", help="search, check and measure circuits")
    exp.add_argument("design")
    exp.add_argument("--program")
    exp.add_argument("--profile", choices=["quick", "research"], default="quick")
    exp.add_argument("--seed")
    exp.add_argument("--json")
    exp.add_argument("--bundle")
    exp.add_argument("--quiet", "-q", action="store_true")

    sub.add_parser("capabilities", help="print the service capabilities")

    bundle = sub.add_parser("bundle", help="download a job's evidence bundle")
    bundle.add_argument("job_id")
    bundle.add_argument("path")

    args = parser.parse_args(argv)
    client = Client(args.url)
    try:
        if args.command == "capabilities":
            print(json.dumps(client.capabilities(), indent=2))
            return 0
        if args.command == "bundle":
            print(client.bundle(args.job_id, args.path))
            return 0
        parts = _request_parts(args.design, args.program)
        if args.command == "check":
            target = args.target or parts.get("target")
            job = client.analyze(parts["design"], parts.get("program"), target)
        else:
            job = client.experiment(parts["design"], parts.get("program"), args.profile, args.seed or parts.get("seed"))
        if not args.quiet:
            print(f"submitted {job['kind']} {job['id']}", file=sys.stderr)
        final = client.wait(job["id"], on_progress=_progress(not args.quiet))
        _print_report(final)
        if args.json:
            Path(args.json).write_text(json.dumps(final, indent=2) + "\n", encoding="utf-8")
        if args.bundle and final.get("bundle"):
            client.bundle(final["id"], args.bundle)
        return 0 if final["state"] == "completed" else 1
    except CryptificateError as e:
        print(f"cryptificate: {e}", file=sys.stderr)
        for err in e.errors[:10]:
            print(f"  {err.get('path')}: {err.get('message')}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
