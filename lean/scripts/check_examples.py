#!/usr/bin/env python3
"""Run every instantiated certificate example and report its outcome and wall time.

The examples in ``lean/Cryptificate/Examples`` are not imported by the library,
so ``lake build`` does not check them. This script runs each one the way the
service runs a certificate (``lake env lean --threads=1 -M 3072``) and fails
when a file does not check, when an audit line reports an axiom outside
propext, Classical.choice and Quot.sound, or when a file takes longer than the
time budget.

Usage:

    check_examples.py                     every example
    check_examples.py FILE.lean ...       only these files
    check_examples.py --budget 60         seconds allowed per file (default 60)

Only the Python standard library is used.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from instantiate import ALLOWED_AXIOMS, LEAN_DIR, SpecError, parse_output, run_lean

EXAMPLES_DIR = LEAN_DIR / "Cryptificate" / "Examples"


def check(path: Path, budget: float) -> tuple[bool, str]:
    code, stdout, stderr, seconds = run_lean(path, timeout=budget)
    audits, inputs, malformed, other = parse_output(stdout)
    summary = f"{seconds:6.1f} s  {len(audits):2d} audit  {len(inputs):2d} input"
    if code is None:
        return False, f"{summary}  timeout"
    problems = []
    if code != 0:
        problems.append(f"exit {code}")
    if malformed:
        problems.append(f"{len(malformed)} malformed report line(s)")
    for a in audits:
        bad = sorted(set(a["axioms"]) - ALLOWED_AXIOMS)
        if bad:
            problems.append(f"{a['theorem']} uses {', '.join(bad)}")
    if problems:
        detail = "\n".join(other + ([stderr.rstrip()] if stderr.strip() else []))
        return False, f"{summary}  " + "; ".join(problems) + (f"\n{detail}" if detail else "")
    return True, summary


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("files", nargs="*", help="example files (default: all)")
    ap.add_argument("--budget", type=float, default=60.0, help="seconds allowed per file")
    args = ap.parse_args(argv)
    files = [Path(f) for f in args.files] or sorted(EXAMPLES_DIR.glob("*.lean"))
    failed = 0
    for path in files:
        try:
            ok, line = check(path, args.budget)
        except SpecError as e:
            print(f"error: {e}", file=sys.stderr)
            return 2
        failed += not ok
        print(f"{'ok  ' if ok else 'FAIL'}  {path.name:32s} {line}", flush=True)
    print(f"{len(files) - failed} of {len(files)} example(s) passed", file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
