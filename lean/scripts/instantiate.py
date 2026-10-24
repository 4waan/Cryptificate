#!/usr/bin/env python3
"""Instantiate Cryptificate certificate templates and check them with Lean.

A certificate is the concatenation of template fragments from ``lean/templates``
(``header``, constant fragments, claim fragments, ``footer``) with every
``{{PLACEHOLDER}}`` replaced by a value, followed by one
``#cryptificate_audit CryptificateJob.<theorem>`` line per claim. This script
does exactly that from a JSON spec, so templates can be exercised without the
engine:

    {
      "fragments": ["header", "const_program_gf256", "const_matrix_gf256",
                    "circuit_equivalence_gf256", "footer"],
      "values": {"INSTRS": ".add 0 1, .mul 0x02 4", "OUTPUTS": "5 1 2 3",
                 "MATRIX": "0x02 0x03 0x01 0x01 ..."},
      "audit": ["circuit_equivalence"]
    }

Audit names without a dot are taken in the ``CryptificateJob`` namespace. An
optional ``"doc"`` string becomes the module docstring of the generated file,
placed after its imports; the committed examples use it to say what they show.

Usage:

    instantiate.py SPEC.json -o Cert.lean            write the certificate
    instantiate.py SPEC.json -o Cert.lean --run      ... and run Lean on it
    instantiate.py SPEC.json -o Cert.lean --check    ... and compare every audit
                                                     line with the sidecars
    instantiate.py --lint                            check every fragment against
                                                     its sidecar

With ``--run`` or ``--check`` the ``CRYPTIFICATE_AUDIT`` and
``CRYPTIFICATE_INPUT`` lines Lean prints are copied to standard output, and the
wall time is reported on standard error. ``--check`` also fails when a claim
is missing, when its statement differs from the sidecar's ``expectedType``, or
when it depends on an axiom outside propext, Classical.choice and Quot.sound.

Placeholder values are pasted into Lean source, so they are restricted to
letters, digits, ``_``, spaces, commas and dots: enough for numerals, ``0xHH``
bytes, instruction lists such as ``.add 0 1, .mul 0x02 4`` and constant names,
and not enough to end a term or start a comment.

Only the Python standard library is used.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
LEAN_DIR = SCRIPT_DIR.parent
TEMPLATE_DIR = LEAN_DIR / "templates"

NAMESPACE = "CryptificateJob"
ALLOWED_AXIOMS = {"propext", "Classical.choice", "Quot.sound"}
PLACEHOLDER = re.compile(r"\{\{([A-Z][A-Z0-9_]*)\}\}")
SAFE_VALUE = re.compile(r"[A-Za-z0-9_ ,.]*")
AUDIT_PREFIX = "CRYPTIFICATE_AUDIT "
INPUT_PREFIX = "CRYPTIFICATE_INPUT "
SIDECAR_KEYS = {
    "name", "kind", "claim", "status", "theorem", "expectedType",
    "placeholders", "requires", "field",
}


class SpecError(Exception):
    """An invalid spec, fragment or sidecar."""


def find_fragment(dirs: list[Path], name: str) -> Path:
    if not re.fullmatch(r"[a-z0-9_]+", name):
        raise SpecError(f"invalid fragment name {name!r}")
    for d in dirs:
        path = d / f"{name}.lean"
        if path.is_file():
            return path
    raise SpecError(f"fragment {name!r} not found in {', '.join(map(str, dirs))}")


def load_sidecar(fragment: Path) -> dict | None:
    sidecar = fragment.with_suffix(".json")
    if not sidecar.is_file():
        return None
    with sidecar.open(encoding="utf-8") as f:
        return json.load(f)


def full_name(theorem: str) -> str:
    return theorem if "." in theorem else f"{NAMESPACE}.{theorem}"


def substitute(text: str, values: dict[str, str], used: set[str], where: str) -> str:
    def repl(m: re.Match[str]) -> str:
        key = m.group(1)
        if key not in values:
            raise SpecError(f"{where}: no value for placeholder {{{{{key}}}}}")
        used.add(key)
        return values[key]

    return PLACEHOLDER.sub(repl, text)


def insert_doc(source: str, doc: str) -> str:
    """Insert `doc` as a module docstring after the leading `import` lines."""
    if not isinstance(doc, str) or "-/" in doc or "/-" in doc:
        raise SpecError("spec.doc must be a string without comment delimiters")
    lines = source.split("\n")
    i = 0
    while i < len(lines) and lines[i].startswith("import "):
        i += 1
    block = ["", "/-!", *doc.strip("\n").split("\n"), "-/"]
    return "\n".join(lines[:i] + block + lines[i:])


def build(spec: dict, dirs: list[Path]) -> tuple[str, list[dict]]:
    """Return the certificate source and the sidecars of the fragments used."""
    fragments = spec.get("fragments")
    if not isinstance(fragments, list) or not fragments:
        raise SpecError("spec.fragments must be a non-empty list of fragment names")
    values = spec.get("values", {})
    if not isinstance(values, dict):
        raise SpecError("spec.values must be an object")
    for key, value in values.items():
        if not isinstance(value, str) or not SAFE_VALUE.fullmatch(value):
            raise SpecError(f"value for {key} must be a string of [A-Za-z0-9_ ,.]")
    audit = spec.get("audit", [])
    if not isinstance(audit, list) or not all(isinstance(a, str) for a in audit):
        raise SpecError("spec.audit must be a list of theorem names")
    for a in audit:
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_.']*", a):
            raise SpecError(f"invalid theorem name {a!r}")

    parts: list[str] = []
    sidecars: list[dict] = []
    used: set[str] = set()
    for name in fragments:
        path = find_fragment(dirs, name)
        parts.append(substitute(path.read_text(encoding="utf-8"), values, used, name))
        meta = load_sidecar(path)
        if meta is not None:
            sidecars.append(meta)
    unused = sorted(set(values) - used)
    if unused:
        print(f"note: unused values: {', '.join(unused)}", file=sys.stderr)

    source = "".join(p if p.endswith("\n") else p + "\n" for p in parts)
    doc = spec.get("doc")
    if doc is not None:
        source = insert_doc(source, doc)
    source += "".join(f"#cryptificate_audit {full_name(a)}\n" for a in audit)
    return source, sidecars


def find_lake() -> str:
    """`$LAKE`, else `lake` on the path, else the default elan location."""
    found = os.environ.get("LAKE") or shutil.which("lake")
    if found:
        return found
    fallback = Path.home() / ".elan" / "bin" / "lake"
    if fallback.is_file():
        return str(fallback)
    raise SpecError("lake not found: set LAKE or put lake on the PATH")


def run_lean(path: Path, timeout: float) -> tuple[int | None, str, str, float]:
    """Run Lean on a certificate the way the service does; `None` exit code on timeout."""
    cmd = [find_lake(), "env", "lean", "--threads=1", "-M", "3072", str(path.resolve())]
    start = time.monotonic()
    try:
        proc = subprocess.run(cmd, cwd=LEAN_DIR, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired as e:
        out = e.stdout.decode() if isinstance(e.stdout, bytes) else (e.stdout or "")
        err = e.stderr.decode() if isinstance(e.stderr, bytes) else (e.stderr or "")
        return None, out, err, time.monotonic() - start
    return proc.returncode, proc.stdout, proc.stderr, time.monotonic() - start


def parse_output(stdout: str) -> tuple[list[dict], list[tuple[str, object]], list[str]]:
    """Split Lean's output into audit records, echoed inputs and other lines."""
    audits: list[dict] = []
    inputs: list[tuple[str, object]] = []
    other: list[str] = []
    for line in stdout.splitlines():
        if line.startswith(AUDIT_PREFIX):
            audits.append(json.loads(line[len(AUDIT_PREFIX):]))
        elif line.startswith(INPUT_PREFIX):
            key, _, payload = line[len(INPUT_PREFIX):].partition(" ")
            inputs.append((key, json.loads(payload)))
        elif line.strip():
            other.append(line)
    return audits, inputs, other


def check_audits(audits: list[dict], sidecars: list[dict], requested: list[str]) -> list[str]:
    problems: list[str] = []
    expected = {s["theorem"]: s for s in sidecars if s.get("theorem")}
    seen: dict[str, dict] = {}
    for a in audits:
        if a["theorem"] in seen:
            problems.append(f"{a['theorem']}: audited twice")
        seen[a["theorem"]] = a
    for name in map(full_name, requested):
        a = seen.get(name)
        if a is None:
            problems.append(f"{name}: no audit line")
            continue
        bad = sorted(set(a["axioms"]) - ALLOWED_AXIOMS)
        if bad:
            problems.append(f"{name}: disallowed axioms {bad}")
        meta = expected.get(name)
        if meta is None:
            problems.append(f"{name}: no sidecar declares this theorem")
        elif meta.get("expectedType") is not None and meta["expectedType"] != a["type"]:
            problems.append(
                f"{name}: statement differs from sidecar {meta['name']}\n"
                f"  expected: {meta['expectedType']}\n  printed:  {a['type']}")
    return problems


def lint(dirs: list[Path]) -> list[str]:
    """Check every fragment against its sidecar."""
    problems: list[str] = []
    available = {p.stem for d in dirs for p in d.glob("*.lean")}
    for d in dirs:
        for path in sorted(d.glob("*.lean")):
            name = path.stem
            meta = load_sidecar(path)
            if meta is None:
                problems.append(f"{name}: missing sidecar {name}.json")
                continue
            missing_keys = SIDECAR_KEYS - set(meta)
            if missing_keys:
                problems.append(f"{name}: sidecar lacks {sorted(missing_keys)}")
            if meta.get("name") != name:
                problems.append(f"{name}: sidecar name is {meta.get('name')!r}")
            found = sorted(set(PLACEHOLDER.findall(path.read_text(encoding="utf-8"))))
            if sorted(meta.get("placeholders", [])) != found:
                problems.append(f"{name}: placeholders {found} but sidecar lists "
                                f"{sorted(meta.get('placeholders', []))}")
            for req in meta.get("requires", []):
                if req not in available:
                    print(f"note: {name} requires {req}, not present", file=sys.stderr)
            if meta.get("kind") == "claim":
                thm = meta.get("theorem") or ""
                short = thm.removeprefix(NAMESPACE + ".")
                if not re.search(rf"^theorem {re.escape(short)}\b", path.read_text(encoding="utf-8"),
                                 re.MULTILINE):
                    problems.append(f"{name}: does not declare theorem {short}")
    return problems


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("spec", nargs="?", help="JSON spec file ('-' for standard input)")
    ap.add_argument("-o", "--output", help="where to write the certificate (default: standard output)")
    ap.add_argument("--templates", action="append", default=[],
                    help="extra fragment directory, searched before lean/templates")
    ap.add_argument("--run", action="store_true", help="run Lean on the certificate")
    ap.add_argument("--check", action="store_true", help="run Lean and check every audit line")
    ap.add_argument("--timeout", type=float, default=180.0, help="Lean wall-clock limit in seconds")
    ap.add_argument("--lint", action="store_true", help="check fragments against their sidecars")
    args = ap.parse_args(argv)

    dirs = [Path(d) for d in args.templates] + [TEMPLATE_DIR]

    if args.lint:
        problems = lint(dirs)
        for p in problems:
            print(f"error: {p}", file=sys.stderr)
        return 1 if problems else 0

    if args.spec is None:
        ap.error("a spec is required unless --lint is given")
    try:
        if args.spec == "-":
            spec = json.load(sys.stdin)
        else:
            with open(args.spec, encoding="utf-8") as f:
                spec = json.load(f)
        source, sidecars = build(spec, dirs)
    except (SpecError, json.JSONDecodeError, OSError) as e:
        print(f"error: {e}", file=sys.stderr)
        return 2

    if not (args.run or args.check):
        if args.output:
            Path(args.output).write_text(source, encoding="utf-8")
        else:
            sys.stdout.write(source)
        return 0

    if not args.output:
        print("error: --run and --check need --output", file=sys.stderr)
        return 2
    out = Path(args.output)
    out.write_text(source, encoding="utf-8")
    try:
        code, stdout, stderr, seconds = run_lean(out, args.timeout)
    except SpecError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    audits, inputs, other = parse_output(stdout)
    for line in stdout.splitlines():
        if line.startswith(AUDIT_PREFIX) or line.startswith(INPUT_PREFIX):
            print(line)
    if code is None:
        print(f"lean: timeout after {seconds:.1f} s", file=sys.stderr)
        return 3
    print(f"lean: exit {code} in {seconds:.1f} s", file=sys.stderr)
    if code != 0:
        for line in other:
            print(line, file=sys.stderr)
        if stderr.strip():
            print(stderr.rstrip(), file=sys.stderr)
        return 1
    if args.check:
        problems = check_audits(audits, sidecars, spec.get("audit", []))
        for p in problems:
            print(f"error: {p}", file=sys.stderr)
        if problems:
            return 1
        print(f"check: {len(spec.get('audit', []))} claim(s) match their sidecars", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
