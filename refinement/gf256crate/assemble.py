"""Assemble the expanded gf256 configuration into one self-contained crate.

Usage: python3 -I assemble.py CRATE_EXPANDED USER_EXPANDED OUT

CRATE_EXPANDED is `rustc -Zunpretty=expanded` of the gf256 crate (version 0.3.1,
features `no-tables` and `no-xmul`); USER_EXPANDED is the same for `src/lib.rs`,
which declares the type `gf256_aes`. The output is the gf256 crate expansion with
the type appended, so that every path the type uses (`::gf256::p::p8`, ...)
resolves inside one crate. The edits, all listed here, change no executable code:

1. crate attributes: enable the internal features that derive and `panic!`
   expansions refer to, and allow the two lints (`unconditional_panic`,
   `overflowing_literals`) that rustc suppresses inside macro expansions but
   reports on expanded source;
2. `extern crate self as gf256;`, so that the type's `::gf256::...` paths name
   this crate;
3. the crate's own field types (module `gf`: 0x11D and wider fields) are
   dropped; nothing in the type refers to them;
4. imports of macros (`gf256_macros::p`, `cfg_if`) are dropped: after expansion
   they are unused, and they name crates the expansion does not depend on;
5. documentation is dropped (`#[doc = "..."]` and `#![doc = "..."]` attributes, `///` and
   `//!` comments): it does not reach the compiled code, and it is the crate's prose.
"""

import sys

HEADER = [
    '// Expansion of the gf256 crate, version 0.3.1, with features `no-tables` and',
    '// `no-xmul`, and of the type `gf256_aes` declared in',
    '// `refinement/gf256crate/src/lib.rs` with `#[gf(polynomial = 0x11b, generator = 0x3)]`.',
    '// Produced by `refinement/gf256crate/expand.sh`; do not edit.',
]
FEATURES = ('#![feature(prelude_import, coverage_attribute, derive_clone_copy_internals, '
            'derive_eq_internals, panic_internals, structural_match, trivial_clone)]')
ALLOW = '#![allow(unconditional_panic, overflowing_literals)]'
MACRO_IMPORTS = {
    'pub use gf256_macros::p;',
    'use cfg_if::cfg_if;',
    'pub use cfg_if;',
    'use crate::internal::cfg_if::cfg_if;',
    'use ::gf256::internal::cfg_if::cfg_if;',
}


def strip_docs(lines):
    out = []
    i = 0
    while i < len(lines):
        s = lines[i].strip()
        if s.startswith('///') or s.startswith('//!'):
            i += 1
        elif s.startswith('#[doc =') or s.startswith('#![doc ='):
            if s.endswith('"]'):
                i += 1
            elif s in ('#[doc =', '#![doc =') and lines[i + 1].strip().endswith('"]'):
                i += 2
            else:
                sys.exit('assemble.py: unexpected documentation attribute at line %d' % (i + 1))
        else:
            out.append(lines[i])
            i += 1
    return out


def main(crate_path, user_path, out_path):
    crate = open(crate_path, encoding='utf-8').read().split('\n')
    user = open(user_path, encoding='utf-8').read().split('\n')

    if crate[0] != '#![feature(prelude_import)]':
        sys.exit('assemble.py: unexpected first line of the crate expansion')
    body = [FEATURES, ALLOW] + crate[1:]

    start = body.index('pub mod gf {')
    end = body.index('pub use gf::*;')
    body = body[:start] + body[end + 1:]

    body.insert(body.index('extern crate core;') + 1, 'extern crate self as gf256;')

    first = user.index('pub use __gf256_aes_gen::gf256_aes;')
    lines = [l for l in strip_docs(body + user[first:]) if l.strip() not in MACRO_IMPORTS]
    while lines and lines[-1] == '':
        lines.pop()
    with open(out_path, 'w', encoding='utf-8', newline='\n') as out:
        out.write('\n'.join(HEADER + lines) + '\n')


if __name__ == '__main__':
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(*sys.argv[1:])
