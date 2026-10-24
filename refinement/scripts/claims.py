"""Write or check refinement/claims.json, the machine-readable list of refinement theorems.

Usage (from the repository root):

    python3 -I refinement/scripts/claims.py --write   # regenerate claims.json
    python3 -I refinement/scripts/claims.py --check   # compare claims.json with Lean and the sources

Both modes run `lake env lean scripts/PrintClaims.lean` in refinement/ (the package must be
built), which prints each theorem's statement and axioms as Lean sees them, and hash the Rust
sources each theorem covers. `--check` exits non-zero if anything in claims.json differs.
"""

import hashlib
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REFINEMENT = os.path.dirname(HERE)
ROOT = os.path.dirname(REFINEMENT)
CLAIMS = os.path.join(REFINEMENT, 'claims.json')

EVIDENCE_LABEL = 'Rust-source refinement (Aeneas)'
STANDARD_AXIOMS = ['propext', 'Classical.choice', 'Quot.sound']

# Charon and its Rust toolchain are recorded by extract.sh, which checks them before extracting.
CHARON = '0.1.294 (260ba2c82588291b1f9efaf4f42d7100adc9c6c2)'
RUST_FOR_CHARON = 'nightly-2026-09-17'

KERNELS = {
    'gf256': {
        'title': 'GF(2^8) arithmetic of crates/kernels (xtime, add, mul)',
        'appliesTo': {'field': 'gf256'},
        'rust': ['crates/kernels/src/gf256.rs', 'refinement/rust/kernels.rs'],
        'extracted': 'refinement/Extracted/CryptificateKernels.lean',
        'proof': 'refinement/Refinement/GF256.lean',
        'spec': 'WideTrail GF256.xtime and GF256.rawMul on BitVec 8, the multiplication of the field GF256',
    },
    'aes-like': {
        'title': 'Parametric AES-like round and multi-round encryption of crates/kernels',
        'appliesTo': {'model': 'aes-like/gf256/v1'},
        'rust': ['crates/kernels/src/aes_like.rs', 'crates/kernels/src/gf256.rs',
                 'refinement/rust/kernels.rs'],
        'extracted': 'refinement/Extracted/CryptificateKernels.lean',
        'proof': 'refinement/Refinement/AesLike.lean',
        'spec': ('Cryptificate.aesLikeRound and Cryptificate.aesLikeExec of the main Lean package '
                 '(lean/Cryptificate/Bridge.lean) over WideTrail GF256'),
    },
    'gf256-crate': {
        'title': ('Multiplication of the crates.io gf256 crate 0.3.1, polynomial 0x11B, features '
                  'no-tables and no-xmul (expanded source)'),
        'appliesTo': {'field': 'gf256', 'implementation': 'gf256 0.3.1 (barret mode, no-tables, no-xmul)'},
        'rust': ['refinement/rust/gf256_aes_expanded.rs'],
        'extracted': 'refinement/Extracted/Gf256Aes.lean',
        'proof': 'refinement/Refinement/Gf256Crate.lean',
        'spec': 'WideTrail GF256.rawMul on BitVec 8',
    },
}

# theorem -> (kernel, hypotheses beyond the statement's own premises)
THEOREMS = [
    ('Cryptificate.Refinement.gf256_xtime_refines', 'gf256', []),
    ('Cryptificate.Refinement.gf256_add_refines', 'gf256', []),
    ('Cryptificate.Refinement.gf256_mul_refines', 'gf256', []),
    ('Cryptificate.Refinement.gf256_mul_field', 'gf256', []),
    ('Cryptificate.Refinement.gf256_add_field', 'gf256', []),
    ('Cryptificate.Refinement.gf256_xtime_field', 'gf256', []),
    ('Cryptificate.Refinement.aes_like_round_refines', 'aes-like', []),
    ('Cryptificate.Refinement.aes_like_round_eq', 'aes-like', []),
    ('Cryptificate.Refinement.aes_like_encrypt_refines', 'aes-like', []),
    ('Cryptificate.Refinement.aes_like_encrypt_eq', 'aes-like', []),
    ('Cryptificate.Refinement.aes_like_encrypt_activity_bound', 'aes-like', []),
    ('Cryptificate.Refinement.Gf256Crate.gf256crate_mul_refines', 'gf256-crate',
     ['SizeOfU8: core::mem::size_of::<u8>() returns 1 (not modelled by the Aeneas library; '
      'the extraction declares gf256_aes.core.mem.size_of as an uninterpreted function)']),
    ('Cryptificate.Refinement.Gf256Crate.gf256crate_mul_field', 'gf256-crate',
     ['SizeOfU8 (as above)']),
    ('Cryptificate.Refinement.Gf256Crate.gf256crate_mul_eq_kernels', 'gf256-crate',
     ['SizeOfU8 (as above)']),
]

NOT_ESTABLISHED = [
    {
        'id': 'bn254',
        'title': 'BN254 scalar-field arithmetic (arkworks ark-bn254 / ark-ff 0.6 Fr) and HADES rounds over it',
        'status': 'not_established',
        'appliesTo': {'field': 'bn254'},
        'reason': ('No refinement theorem covers arkworks Fr arithmetic. Proving it requires a '
                   'machine-checked proof of the arkworks Montgomery multiplication and modular '
                   'reduction for the BN254 modulus, which has not been done; see '
                   'refinement/STATUS.md.'),
    },
]


def sha256(path):
    with open(os.path.join(ROOT, path), 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def read(path):
    with open(os.path.join(REFINEMENT, path), encoding='utf-8') as f:
        return f.read()


def pins():
    manifest = json.loads(read('lake-manifest.json'))
    revs = {p['name']: p['rev'] for p in manifest['packages']}
    lean = read('lean-toolchain').strip().split(':')[-1]
    return {
        'lean': lean,
        'mathlib': 'v4.35.0 (' + revs['mathlib'] + ')',
        'aeneas': revs['aeneas'],
        'charon': CHARON,
        'rustForCharon': RUST_FOR_CHARON,
        'widetrail': revs['WideTrail'],
    }


def lean_claims():
    env = dict(os.environ, CI='1')
    out = subprocess.run(['lake', 'env', 'lean', 'scripts/PrintClaims.lean'], cwd=REFINEMENT,
                         env=env, capture_output=True, text=True)
    if out.returncode != 0:
        sys.exit('claims.py: Lean failed:\n' + out.stdout + out.stderr)
    result = {}
    for line in out.stdout.splitlines():
        if line.startswith('CLAIM '):
            item = json.loads(line[len('CLAIM '):])
            result[item['theorem']] = item
    return result


def build():
    toolchain = pins()
    printed = lean_claims()
    claims = []
    for name, kernel, hypotheses in THEOREMS:
        if name not in printed:
            sys.exit('claims.py: Lean did not print ' + name)
        k = KERNELS[kernel]
        claims.append({
            'theorem': name,
            'status': 'proved',
            'kernel': kernel,
            'statement': printed[name]['type'],
            'axioms': printed[name]['axioms'],
            'extraAxioms': [a for a in printed[name]['axioms'] if a not in STANDARD_AXIOMS],
            'hypotheses': hypotheses,
            'rustSources': [{'path': p, 'sha256': sha256(p)} for p in k['rust']],
            'extractedLean': {'path': k['extracted'], 'sha256': sha256(k['extracted'])},
            'proofFile': k['proof'],
            'toolchain': toolchain,
        })
    kernels = []
    for kid, k in KERNELS.items():
        kernels.append({
            'id': kid,
            'title': k['title'],
            'appliesTo': k['appliesTo'],
            'specification': k['spec'],
            'rustSources': [{'path': p, 'sha256': sha256(p)} for p in k['rust']],
            'extractedLean': {'path': k['extracted'], 'sha256': sha256(k['extracted'])},
            'theorems': [n for n, kk, _ in THEOREMS if kk == kid],
        })
    return {
        'format': 'cryptificate-refinement-claims/1',
        'evidenceLabel': EVIDENCE_LABEL,
        'toolchain': toolchain,
        'trusted': [
            'Charon and Aeneas translate the Rust source faithfully into the Lean model',
            "the Aeneas library's models of Rust integers, arrays, slices and shifts",
            'the Lean kernel',
            'rustc, which compiles the Rust source to machine code (outside the chain)',
            'the hardware',
        ],
        'notClaimed': ['constant-time execution', 'absence of side channels'],
        'kernels': kernels,
        'claims': claims,
        'notEstablished': NOT_ESTABLISHED,
    }


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else ''
    if mode not in ('--write', '--check'):
        sys.exit(__doc__)
    data = build()
    text = json.dumps(data, indent=2, ensure_ascii=False) + '\n'
    if mode == '--write':
        with open(CLAIMS, 'w', encoding='utf-8', newline='\n') as f:
            f.write(text)
        print('wrote refinement/claims.json (%d theorems)' % len(data['claims']))
    else:
        with open(CLAIMS, encoding='utf-8') as f:
            current = f.read()
        if current != text:
            sys.exit('claims.py: refinement/claims.json is out of date (run with --write)')
        print('refinement/claims.json matches Lean and the recorded sources')


if __name__ == '__main__':
    main()
