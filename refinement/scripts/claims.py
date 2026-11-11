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
        'spec': ('Cryptificate.aesLikeRound, Cryptificate.aesLikeExec, and the final-round '
                 'variant Cryptificate.aesLikeFinalRound and Cryptificate.aesLikeCipher, of the '
                 'main Lean package (lean/Cryptificate/Bridge.lean) over WideTrail GF256'),
        # Compiled by this package (Lean v4.35.0) from the main package's source files, which the
        # main package checks on Lean v4.33.1; the hashes say which text the theorems are about.
        'specSources': ['lean/Cryptificate/Bridge.lean',
                        'lean/Cryptificate/Diffusion/Activity.lean'],
    },
    'aes-like-checked': {
        'title': ('Active-S-box bound of the AES-like kernel of crates/kernels for any design, '
                  'conditionally on three kernel-evaluable checks on its bytes'),
        'appliesTo': {'model': 'aes-like/gf256/v1'},
        'rust': ['crates/kernels/src/aes_like.rs', 'crates/kernels/src/gf256.rs',
                 'refinement/rust/kernels.rs'],
        'extracted': 'refinement/Extracted/CryptificateKernels.lean',
        'proof': 'refinement/Refinement/AesConcrete.lean',
        'spec': ('Cryptificate.activityBound and the active-S-box count of the main Lean package, '
                 'with the design checks minors4Ok (canonical minors), distinct offsets and a '
                 'byte table covering every value as hypotheses'),
        # Compiled by this package (Lean v4.35.0) from the main package's source files.
        'specSources': ['lean/Cryptificate/Bridge.lean',
                        'lean/Cryptificate/Diffusion/Activity.lean',
                        'lean/Cryptificate/Encoding.lean',
                        'lean/Cryptificate/Sbox.lean',
                        'lean/Cryptificate/Diffusion/Minors4.lean',
                        'lean/Cryptificate/Diffusion/Offsets.lean'],
    },
    'aes-like-aes': {
        'title': ('Active-S-box bound of the AES-like kernel of crates/kernels for AES, with no '
                  'design hypothesis'),
        # These theorems are about the fixed AES byte arrays only: a consumer must match a
        # submitted design's matrix, offsets and S-box table against them before using them.
        'appliesTo': {'model': 'aes-like/gf256/v1',
                      'design': ('AES: MixColumns [02 03 01 01 / 01 02 03 01 / 01 01 02 03 / '
                                 '03 01 01 02] row-major, ShiftRows offsets [0 1 2 3], FIPS 197 '
                                 'S-box table')},
        'rust': ['crates/kernels/src/aes_like.rs', 'crates/kernels/src/gf256.rs',
                 'refinement/rust/kernels.rs'],
        'extracted': 'refinement/Extracted/CryptificateKernels.lean',
        'proof': 'refinement/Refinement/AesConcrete.lean',
        'spec': ('Cryptificate.activityBound and the active-S-box count of the main Lean package '
                 'for the byte arrays aesMatrixBytes, aesOffsetBytes and aesSboxBytes, identified '
                 'with the main package encodings gfMat4 2 3 1 1 1 2 3 1 1 1 2 3 3 1 1 2, '
                 'offsets4 0 1 2 3 and the FIPS 197 table aesSboxTable, equal to WideTrail '
                 'AES.sbox'),
        # Compiled by this package (Lean v4.35.0) from the main package's source files.
        'specSources': ['lean/Cryptificate/Bridge.lean',
                        'lean/Cryptificate/Diffusion/Activity.lean',
                        'lean/Cryptificate/Encoding.lean',
                        'lean/Cryptificate/Sbox.lean',
                        'lean/Cryptificate/Diffusion/Minors4.lean',
                        'lean/Cryptificate/Diffusion/Offsets.lean'],
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
    'bn254-mont': {
        'title': ('BN254 scalar-field Montgomery arithmetic of crates/kernels (add, sub, CIOS mul, '
                  'to_mont, from_mont on four 64-bit limbs)'),
        'appliesTo': {'field': 'bn254', 'implementation': 'crates/kernels bn254_mont'},
        'rust': ['crates/kernels/src/bn254_mont.rs', 'refinement/rust/kernels.rs'],
        'extracted': 'refinement/Extracted/CryptificateKernels.lean',
        'proof': 'refinement/Refinement/BN254Mont.lean',
        'spec': ('arithmetic modulo Poseidon2.BN254.modulus and, through the Montgomery decoding '
                 'toField x = val4 x * (2^256)^-1, the field operations of WideTrail '
                 'Poseidon2.BN254.F = ZMod modulus'),
    },
}

ENOUGH_KEYS = ('at least `rounds` round keys (rounds <= round_keys.len()); with fewer, the Rust '
               'code indexes past the slice and the theorem says nothing')
DESIGN_HYPOTHESES = ('IsMDS (matrixOf m), DiffusionOptimal offsets and an S-box table without '
                     'repeated entries are hypotheses of this theorem; '
                     'aes_like_encrypt_activity_bound_of_checks and '
                     'aes_like_encrypt_with_last_round_activity_bound_of_checks (kernel '
                     'aes-like-checked) derive them in this package from Boolean checks on the '
                     'bytes, and the AES instances (kernel aes-like-aes) have none; the main '
                     'package certificates (Lean v4.33.1) '
                     'are not combined with it in one Lean environment')

CHECKS = ('the design checks are hypotheses, each a Boolean the kernel evaluates for concrete '
          'bytes: minors4Ok (matrixOf m) = true, offsetsDistinct o = true, tableCovers t = true')
AES_ONLY = ('no design hypothesis: the AES matrix, offsets and FIPS 197 S-box table are fixed byte '
            'arrays, checked by the kernel; different input states (x != y); no special last round')
AES_CIPHER = ('no design hypothesis: the AES matrix, offsets and FIPS 197 S-box table are fixed '
              'byte arrays, checked by the kernel; different input states (x != y); the last '
              'round is the AES final round (no MixColumns, then the last key); the round keys '
              'are arbitrary data, the AES key expansion is not modelled')
ENOUGH_KEYS_FINAL = ('at least rounds + 1 round keys (rounds < round_keys.len()); with fewer, the '
                     'Rust code indexes past the slice (for rounds = 0 the code reads no key, but '
                     'the theorem still asks for one) and the theorem says nothing')
LAST_ROUND = 'the last of the r rounds is the final round: no column mixing, then the last key'

FIRST_BELOW_P = ('the first operand is canonical (its limbs hold a value below p); the second '
                 'may be any 256-bit value')
BOTH_BELOW_P = 'both operands are canonical (their limbs hold values below p)'

# theorem -> (kernel, hypotheses and preconditions in words; the statement has them formally)
THEOREMS = [
    ('Cryptificate.Refinement.gf256_xtime_refines', 'gf256', []),
    ('Cryptificate.Refinement.gf256_add_refines', 'gf256', []),
    ('Cryptificate.Refinement.gf256_mul_refines', 'gf256', []),
    ('Cryptificate.Refinement.gf256_mul_field', 'gf256', []),
    ('Cryptificate.Refinement.gf256_add_field', 'gf256', []),
    ('Cryptificate.Refinement.gf256_xtime_field', 'gf256', []),
    ('Cryptificate.Refinement.aes_like_round_refines', 'aes-like', []),
    ('Cryptificate.Refinement.aes_like_round_eq', 'aes-like', []),
    ('Cryptificate.Refinement.aes_like_encrypt_refines', 'aes-like', [ENOUGH_KEYS]),
    ('Cryptificate.Refinement.aes_like_encrypt_eq', 'aes-like', [ENOUGH_KEYS]),
    ('Cryptificate.Refinement.aes_like_encrypt_activity_bound', 'aes-like',
     [DESIGN_HYPOTHESES, 'at least r round keys (r <= round_keys.len())']),
    ('Cryptificate.Refinement.aes_like_final_round_refines', 'aes-like', []),
    ('Cryptificate.Refinement.aes_like_final_round_eq', 'aes-like', []),
    ('Cryptificate.Refinement.aes_like_encrypt_with_last_round_refines', 'aes-like',
     [ENOUGH_KEYS_FINAL]),
    ('Cryptificate.Refinement.aes_like_encrypt_with_last_round_eq', 'aes-like',
     [ENOUGH_KEYS_FINAL]),
    ('Cryptificate.Refinement.aes_like_encrypt_with_last_round_activity_bound', 'aes-like',
     [DESIGN_HYPOTHESES, LAST_ROUND, 'at least r + 1 round keys (r < round_keys.len())']),
    ('Cryptificate.Refinement.sboxOf_injective_iff', 'aes-like-checked', []),
    ('Cryptificate.Refinement.sboxOf_injective_of_tableCovers', 'aes-like-checked', []),
    ('Cryptificate.Refinement.aes_like_encrypt_activity_bound_of_checks', 'aes-like-checked',
     [CHECKS, 'at least r round keys (r <= round_keys.len())']),
    ('Cryptificate.Refinement.aes_like_encrypt_with_last_round_activity_bound_of_checks',
     'aes-like-checked', [CHECKS, LAST_ROUND, 'at least r + 1 round keys (r < round_keys.len())']),
    ('Cryptificate.Refinement.matrixOf_aesMatrixBytes', 'aes-like-aes', []),
    ('Cryptificate.Refinement.offsetsOf_aesOffsetBytes', 'aes-like-aes', []),
    ('Cryptificate.Refinement.sboxOf_aesSboxBytes', 'aes-like-aes', []),
    ('Cryptificate.Refinement.aes_rust_activity_bound', 'aes-like-aes',
     [AES_ONLY, 'at least r round keys (r <= round_keys.len())']),
    ('Cryptificate.Refinement.aes_rust_activity_bound_exists', 'aes-like-aes',
     [AES_ONLY, 'at least r round keys (r <= round_keys.len())']),
    ('Cryptificate.Refinement.aes_rust_activity_bound_10', 'aes-like-aes',
     [AES_ONLY, 'at least 10 round keys']),
    ('Cryptificate.Refinement.aes_rust_activity_bound_4', 'aes-like-aes',
     [AES_ONLY, 'at least 4 round keys']),
    ('Cryptificate.Refinement.aes_rust_cipher_activity_bound', 'aes-like-aes',
     [AES_CIPHER, 'at least r + 1 round keys (r < round_keys.len())']),
    ('Cryptificate.Refinement.aes_rust_cipher_activity_bound_10', 'aes-like-aes',
     [AES_CIPHER, 'at least 11 round keys']),
    ('Cryptificate.Refinement.Gf256Crate.gf256crate_mul_refines', 'gf256-crate',
     ['SizeOfU8: core::mem::size_of::<u8>() returns 1 (not modelled by the Aeneas library; '
      'the extraction declares gf256_aes.core.mem.size_of as an uninterpreted function)']),
    ('Cryptificate.Refinement.Gf256Crate.gf256crate_mul_field', 'gf256-crate',
     ['SizeOfU8 (as above)']),
    ('Cryptificate.Refinement.Gf256Crate.gf256crate_mul_eq_kernels', 'gf256-crate',
     ['SizeOfU8 (as above)']),
    ('Cryptificate.Refinement.BN254Mont.bn254_mont_mul_refines', 'bn254-mont', [FIRST_BELOW_P]),
    ('Cryptificate.Refinement.BN254Mont.bn254_mont_add_refines', 'bn254-mont', [BOTH_BELOW_P]),
    ('Cryptificate.Refinement.BN254Mont.bn254_mont_sub_refines', 'bn254-mont', [BOTH_BELOW_P]),
    ('Cryptificate.Refinement.BN254Mont.bn254_mont_to_mont_refines', 'bn254-mont', []),
    ('Cryptificate.Refinement.BN254Mont.bn254_mont_from_mont_refines', 'bn254-mont', []),
    ('Cryptificate.Refinement.BN254Mont.bn254_mont_mul_eq', 'bn254-mont', [FIRST_BELOW_P]),
    ('Cryptificate.Refinement.BN254Mont.bn254_mont_add_eq', 'bn254-mont', [BOTH_BELOW_P]),
    ('Cryptificate.Refinement.BN254Mont.bn254_mont_sub_eq', 'bn254-mont', [BOTH_BELOW_P]),
]

NOT_ESTABLISHED = [
    {
        'id': 'bn254-arkworks',
        'title': 'BN254 scalar-field arithmetic of arkworks (ark-bn254 / ark-ff 0.6 Fr)',
        'status': 'not_established',
        'appliesTo': {'field': 'bn254', 'implementation': 'arkworks ark-ff 0.6 Fr'},
        'reason': ('Aeneas cannot translate the arkworks field traits at the pinned version '
                   '(refinement/bn254-probe), so no theorem covers arkworks Fr. The '
                   'crates/kernels bn254_mont kernel is proved instead (kernel bn254-mont); see '
                   'refinement/STATUS.md.'),
    },
    {
        'id': 'bn254-hades',
        'title': 'HADES / Poseidon2 rounds over BN254 in Rust',
        'status': 'not_established',
        'appliesTo': {'field': 'bn254'},
        'reason': ('No Rust round function over BN254 is extracted or proved; the theorems of '
                   'kernel bn254-mont cover the field operations only.'),
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
            'specificationSources': [{'path': p, 'sha256': sha256(p)} for p in k.get('specSources', [])],
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
            'specificationSources': [{'path': p, 'sha256': sha256(p)} for p in k.get('specSources', [])],
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
            ('for the gf256 crate: that rustc -Zunpretty=expanded and assemble.py preserve the '
             "crate's behaviour (tested on all 65,536 products, not proved), and the renaming of "
             'module paths that extract.sh applies to Gf256Aes.lean'),
            'the Lean kernel',
            'rustc, which compiles the Rust source to machine code (outside the chain)',
            'the hardware',
        ],
        'notClaimed': [
            'constant-time execution',
            'absence of side channels',
            'correctness of the compiled machine code',
            ('the generated circuit code of the native variants, beyond its calls to the kernel '
             'functions (checked by tests, not refined)'),
            'BN254 arithmetic of arkworks Fr, and HADES rounds over BN254 (see notEstablished)',
        ],
        'kernels': kernels,
        'claims': claims,
        'notEstablished': NOT_ESTABLISHED,
    }


def check_design_bindings():
    """A theorem about the fixed AES bytes must sit in a kernel whose appliesTo names that design,
    so that a consumer selecting claims by appliesTo cannot attach it to another design."""
    for name, kid, hypotheses in THEOREMS:
        aes_only = AES_ONLY in hypotheses or AES_CIPHER in hypotheses
        if aes_only and 'design' not in KERNELS[kid]['appliesTo']:
            sys.exit('claims.py: %s is about the AES bytes only, but kernel %s names no design in '
                     'appliesTo' % (name, kid))


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else ''
    if mode not in ('--write', '--check'):
        sys.exit(__doc__)
    check_design_bindings()
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
