# Rust-source refinement: status

The chain is **recorded Rust source → Aeneas model → executable mathematical model → named
properties**. This file lists, for each Rust kernel, which links are proved by Lean, which are
trusted, and which are not established. `claims.json` is the machine-readable form of the
proved theorems; `scripts/claims.py --check` compares it with Lean and with the source hashes.

Statuses: **proved** (checked by Lean, axioms listed), **trusted** (assumed, not checked),
**not established** (no proof exists; this is not a refutation).

## Summary

| Link | GF(2⁸) arithmetic (`crates/kernels/src/gf256.rs`) | AES-like round (`crates/kernels/src/aes_like.rs`) | gf256 crate 0.3.1, `0x11B`, `no-tables`, `no-xmul` | BN254 `Fr` (arkworks) |
| --- | --- | --- | --- | --- |
| 1. Rust source identity | recorded: SHA-256 in `extract.sha256` | recorded: SHA-256 in `extract.sha256` | recorded: expanded source `rust/gf256_aes_expanded.rs`, SHA-256 in `gf256crate/expanded.sha256` and `extract.sha256` | not established: not extracted |
| 2. Rust → Aeneas model | trusted (Charon, Aeneas); reproduced byte for byte by `extract.sh` | trusted; reproduced by `extract.sh` | trusted; reproduced by `extract.sh`, with one documented renaming (below) | not established: Aeneas fails (below) |
| 3. Aeneas model compiles in Lean | yes | yes | yes | — |
| 4. Model = specification | **proved** | **proved** | **proved**, under the hypothesis `size_of::<u8>() = 1` | not established |
| 5. Specification → named properties | **proved**: WideTrail's field `GF256` (field laws carried to the Rust functions) | **proved** as a conditional theorem: the active-S-box bound for Rust executions, assuming MDS, diffusion-optimal offsets and an injective S-box table | **proved**: equal to WideTrail's multiplier, hence to the kernels' `mul` | not established |
| 5′. Same, for a concrete design | — | **proved** for AES with no design hypothesis (`aes_rust_activity_bound*`; with the AES final round, `aes_rust_cipher_activity_bound*`), and for any design as a theorem whose only design hypotheses are three Boolean checks on its bytes, each closable by `decide +kernel` (`aes_like_encrypt_activity_bound_of_checks`, `aes_like_encrypt_with_last_round_activity_bound_of_checks`): at least `activityBound r` active S-boxes (for AES, `55` over ten rounds, with or without the final round) for any two different inputs and at least `r` (with the final round, `r + 1`) round keys (sections 2.1, 2.2) | — | not established |

### Axioms and hypotheses of each theorem

What `#print axioms` reports, pinned by `Refinement/Axioms.lean` (the build fails if it changes);
`claims.json` records the same for every theorem below except the field laws and
`crateMul_eq_rawMul`. "Standard" is `propext`, `Classical.choice`, `Quot.sound`.

| Theorem | Axioms | Hypotheses |
| --- | --- | --- |
| `gf256_xtime_refines`, `gf256_mul_refines`, `gf256_xtime_field`, `gf256_mul_field` | standard | none |
| `gf256_add_refines`, `gf256_add_field` | `propext`, `Quot.sound` | none |
| `gf256_mul_comm`, `gf256_mul_assoc`, `gf256_mul_add`, `gf256_mul_two`, `gf256_mul_inv` | standard | `a ≠ 0` for `gf256_mul_inv` |
| `aes_like_round_refines`, `aes_like_round_eq` | standard | none |
| `aes_like_encrypt_refines`, `aes_like_encrypt_eq` | standard | at least `rounds` round keys |
| `aes_like_encrypt_activity_bound` | standard | MDS matrix, diffusion-optimal offsets, S-box table without repeated entries, different inputs, at least `r` round keys |
| `aes_like_final_round_refines`, `aes_like_final_round_eq` | standard | none |
| `aes_like_encrypt_with_last_round_refines`, `aes_like_encrypt_with_last_round_eq` | standard | at least `rounds + 1` round keys |
| `aes_like_encrypt_with_last_round_activity_bound` | standard | MDS matrix, diffusion-optimal offsets, S-box table without repeated entries, different inputs, at least `r + 1` round keys |
| `aes_like_encrypt_activity_bound_of_checks` | standard | `minors4Ok (matrixOf m)`, `offsetsDistinct o`, `tableCovers t` (Boolean checks on the bytes), different input arrays, at least `r` round keys |
| `aes_like_encrypt_with_last_round_activity_bound_of_checks` | standard | the same three checks, different input arrays, at least `r + 1` round keys |
| `sboxOf_injective_iff`, `sboxOf_injective_of_tableCovers` | standard | `tableCovers t` for the second |
| `matrixOf_aesMatrixBytes`, `offsetsOf_aesOffsetBytes`, `sboxOf_aesSboxBytes` | standard | none |
| `aes_rust_activity_bound`, `aes_rust_activity_bound_exists`, `aes_rust_activity_bound_10`, `aes_rust_activity_bound_4` | standard | different input arrays, at least `r` (resp. `10`, `4`) round keys; no design hypothesis |
| `aes_rust_cipher_activity_bound`, `aes_rust_cipher_activity_bound_10` | standard | different input arrays, at least `r + 1` (resp. `11`) round keys; no design hypothesis |
| `Gf256Crate.crateMul_eq_rawMul` | `propext`, `Quot.sound` | none (bit-level model, no Rust) |
| `Gf256Crate.gf256crate_mul_refines`, `gf256crate_mul_field`, `gf256crate_mul_eq_kernels` | standard and `gf256_aes.core.mem.size_of`, the uninterpreted function the extraction declares | `SizeOfU8`: `size_of::<u8>()` returns `1` |

## 1. GF(2⁸) arithmetic of `crates/kernels`

Proof file `Refinement/GF256.lean`, namespace `Cryptificate.Refinement`; `U8` is Aeneas's model of
`u8`, `toField a = GF256.mk a.bv`, `ofField x = ⟨x.val⟩`.

```lean
theorem gf256_xtime_refines (a : U8) : gf256.xtime a = ok ⟨GF256.xtime a.bv⟩
theorem gf256_add_refines (a b : U8) : gf256.add a b = ok ⟨a.bv ^^^ b.bv⟩
theorem gf256_mul_refines (a b : U8) : gf256.mul a b = ok ⟨GF256.rawMul a.bv b.bv⟩
theorem gf256_mul_field (a b : U8) : gf256.mul a b = ok (ofField (toField a * toField b))
theorem gf256_add_field (a b : U8) : gf256.add a b = ok (ofField (toField a + toField b))
theorem gf256_xtime_field (a : U8) : gf256.xtime a = ok (ofField (GF256.mk 0x02#8 * toField a))
```

and the field laws `gf256_mul_comm`, `gf256_mul_assoc`, `gf256_mul_add`, `gf256_mul_two`,
`gf256_mul_inv`. Axioms: `propext`, `Classical.choice`, `Quot.sound` (`gf256_add_refines` and
`gf256_add_field`: `propext`, `Quot.sound`).

## 2. Parametric AES-like round of `crates/kernels`

`aes_like::round(state, matrix, offsets, sbox, round_key)` and
`aes_like::encrypt(state, matrix, offsets, sbox, round_keys, rounds)` take the design as runtime
data, so these theorems cover every AES-like design at once. Proof file
`Refinement/AesLike.lean`. The specification is the execution model of the main Lean package,
`Cryptificate.aesLikeRound` and `Cryptificate.aesLikeExec` from `lean/Cryptificate/Bridge.lean`;
the refinement package compiles that file (and `lean/Cryptificate/Diffusion/Activity.lean`,
which it imports) from the same sources, under Lean and Mathlib `v4.35.0`, instead of copying
the definitions. The two packages share the source text of these definitions (`claims.json`
records the SHA-256 of both files), not a compiled environment: the main package checks the same
files on Lean `v4.33.1`, and nothing here imports the main package's build.

Reading the Rust data: `stateOf s p = toField s[p]` (byte `4·c + r` is row `r`, column `c`),
`matrixOf m r j = toField m[4·r + j]`, `offsetsOf o r = o[r] mod 4`, `sboxOf t x = toField t[x]`,
`keysOf ks n = stateOf ks[n]`. The Rust code reduces offsets modulo 4, so the theorems hold for
every offset byte; for offsets below 4, `offsetsOf o r = o[r]` (`offsetsOf_of_lt`).

```lean
theorem aes_like_round_refines (s m o t k) :
    aes_like.round s m o t k ⦃ out =>
      stateOf out = aesLikeRound (matrixOf m) (offsetsOf o) (sboxOf t) (stateOf k) (stateOf s) ⦄
theorem aes_like_round_eq (s m o t k) :
    ∃ out, aes_like.round s m o t k = ok out ∧
      stateOf out = aesLikeRound (matrixOf m) (offsetsOf o) (sboxOf t) (stateOf k) (stateOf s)
theorem aes_like_encrypt_refines (s m o t ks rounds) (hks : rounds.val ≤ ks.length) :
    aes_like.encrypt s m o t ks rounds ⦃ out =>
      stateOf out = aesLikeExec (matrixOf m) (offsetsOf o) (sboxOf t) (keysOf ks) (stateOf s) rounds.val ⦄
theorem aes_like_encrypt_eq (…) (hks : rounds.val ≤ ks.length) :
    ∃ out, aes_like.encrypt s m o t ks rounds = ok out ∧ stateOf out = aesLikeExec … rounds.val
```

`m ⦃ v => P v ⦄` is Aeneas's total-correctness predicate (`WP.spec`): `m` returns normally
(no panic, no divergence) with a value satisfying `P`; `spec_iff_exists_ok` turns it into the
`∃ out, … = ok out ∧ …` form. So `round` never panics, and `encrypt` never panics when there are
at least `rounds` round keys. With fewer keys the Rust code indexes past the slice; the theorems
say nothing about that case.

Connection to the wide-trail bound (`Cryptificate.activeSboxes_bound` of the main package, from
WideTrail's `IsTrail.bound_rounds`):

```lean
theorem aes_like_encrypt_activity_bound (m o t ks)
    (hM : IsMDS (matrixOf m))
    (hoff : DiffusionOptimal (gridCol 4 4) (shiftRowsPerm 4 4 (offsetsOf o)))
    (ht : ∀ a < 256, ∀ b < 256, t[a]! = t[b]! → a = b)
    (x y) (hxy : stateOf x ≠ stateOf y) (r) (hr : r ≤ ks.length) (outX outY : ℕ → Array U8 16)
    (hX : ∀ n : Usize, n.val < r → aes_like.encrypt x m o t ks n = ok (outX n.val))
    (hY : ∀ n : Usize, n.val < r → aes_like.encrypt y m o t ks n = ok (outY n.val)) :
    activityBound r ≤ ∑ n ∈ range r,
      #{p | stateOf (outX n) p + keysOf ks n p ≠ stateOf (outY n) p + keysOf ks n p}
```

The right-hand side counts S-boxes whose inputs differ between the two Rust executions, read
from what `aes_like.encrypt` returns. All five theorems of this section use `propext`,
`Classical.choice`, `Quot.sound` only.

**Scope.** The hypotheses `hM`, `hoff`, `ht` are stated in the main package's terms (WideTrail's
`IsMDS`, `DiffusionOptimal`). For a concrete design they are what the main package's per-design
certificates prove (`matrix.mds`, `offsets.dispersion`, `sbox.bijective`). Those generated
certificates are checked by the main package on Lean `v4.33.1` and are not imported here;
section 2.1 instead compiles the checks they are built on in this package and discharges the
hypotheses for concrete byte arrays. `round` and `encrypt` have no special last round: every
round mixes columns. The AES final round is the separate function `final_round`, and
`encrypt_with_last_round` ends with it (section 2.2).

## 2.1 Design checks on the bytes, and AES without design hypotheses

Proof file `Refinement/AesConcrete.lean`. The refinement package also compiles, from the main
package's source files and under Lean and Mathlib `v4.35.0`, `lean/Cryptificate/Encoding.lean`,
`Sbox.lean`, `Diffusion/Minors4.lean` and `Diffusion/Offsets.lean` (roots of
`CryptificateBridge`; `claims.json` records their SHA-256). Three Boolean checks on the Rust
byte arrays then replace the design hypotheses of `aes_like_encrypt_activity_bound`:

* `minors4Ok (matrixOf m)`: the `69` canonical minors of the matrix are nonzero, hence `IsMDS`
  (`isMDS_of_minors4Ok` of the main package);
* `offsetsDistinct o`: the four offsets are distinct modulo `4`, hence diffusion-optimal
  (`diffusionOptimal_of_injective`);
* `tableCovers t`: every byte value occurs among the `256` entries of the table (one pass that
  sets bit `t[x]` of a mask and compares it with `2 ^ 256 - 1`). Then `sboxOf t` is surjective,
  hence injective on the finite field, hence the table has no repeated entry
  (`sboxOf_injective_iff`: injectivity of `sboxOf t` is equivalent to the hypothesis `ht`).

```lean
theorem aes_like_encrypt_activity_bound_of_checks (m o t ks)
    (hM : minors4Ok (matrixOf m) = true) (hoff : offsetsDistinct o = true)
    (ht : tableCovers t = true)
    (x y) (hxy : x ≠ y) (r) (hr : r ≤ ks.length) (outX outY : ℕ → Array U8 16)
    (hX : ∀ n : Usize, n.val < r → aes_like.encrypt x m o t ks n = ok (outX n.val))
    (hY : ∀ n : Usize, n.val < r → aes_like.encrypt y m o t ks n = ok (outY n.val)) :
    activityBound r ≤ ∑ n ∈ range r,
      #{p | stateOf (outX n) p + keysOf ks n p ≠ stateOf (outY n) p + keysOf ks n p}
```

The inputs are now different byte arrays (`x ≠ y`; `stateOf_injective`). For concrete bytes
each check is closed by `decide +kernel`, an evaluation by the Lean kernel (not
`native_decide`), so instantiating the theorem for fixed bytes that pass the checks leaves no
design hypothesis. AES, below, is the only design instantiated in this package; for any other
design the checks remain hypotheses until someone instantiates it.

In `claims.json` the theorems for any design are kernel `aes-like-checked`, whose `appliesTo`
names only the model, and the AES theorems are kernel `aes-like-aes`, whose `appliesTo` also
names the AES design; a consumer must match a submitted design's bytes against it before using
those claims. `claims.py` refuses to record an AES-only theorem under a kernel that names no
design.

**AES.** `aesMatrixBytes`, `aesOffsetBytes` and `aesSboxBytes` are the AES `MixColumns` matrix
`[02 03 01 01 / 01 02 03 01 / 01 01 02 03 / 03 01 01 02]` (row-major), the offsets `[0, 1, 2, 3]`
and the FIPS 197 S-box table, written in `AesConcrete.lean` as values of Aeneas's types for
`[u8; 16]`, `[u8; 4]` and `[u8; 256]`, the argument types of `aes_like::encrypt`. They are not
extracted from a Rust constant (the Rust crate defines the AES constants only in its tests).
`matrixOf_aesMatrixBytes` (`= gfMat4 2 3 1 1 1 2 3 1 1 1 2 3 3 1 1 2`),
`offsetsOf_aesOffsetBytes` (`= offsets4 0 1 2 3`) and `sboxOf_aesSboxBytes` (`= AES.sbox`,
WideTrail's algebraic S-box, through the main package's `aes_sbox_eq_table`) identify them.

```lean
theorem aes_rust_activity_bound_exists (ks) (x y) (hxy : x ≠ y) (r) (hr : r ≤ ks.length) :
    ∃ outX outY,
      (∀ n : Usize, n.val < r → aes_like.encrypt x aesMatrixBytes aesOffsetBytes aesSboxBytes ks n = ok (outX n.val)) ∧
      (∀ n : Usize, n.val < r → aes_like.encrypt y aesMatrixBytes aesOffsetBytes aesSboxBytes ks n = ok (outY n.val)) ∧
      activityBound r ≤ ∑ n ∈ range r,
        #{p | stateOf (outX n) p + keysOf ks n p ≠ stateOf (outY n) p + keysOf ks n p}
theorem aes_rust_activity_bound_10 (ks) (x y) (hxy : x ≠ y) (hr : 10 ≤ ks.length) :
    ∃ outX outY, (… as above with r = 10 …) ∧ 55 ≤ ∑ n ∈ range 10, #{…}
theorem aes_rust_activity_bound_4 (ks) (x y) (hxy : x ≠ y) (hr : 4 ≤ ks.length) :
    ∃ outX outY, (… as above with r = 4 …) ∧ 25 ≤ ∑ n ∈ range 4, #{…}
```

`aes_rust_activity_bound` is the same bound in the form of section 2 (for given `outX`, `outY`
with `hX`, `hY`). The only hypotheses are different inputs and enough round keys: the
executions are shown to return normally, and the bound covers every key schedule, not only the
AES key expansion. All theorems of this section use `propext`, `Classical.choice`, `Quot.sound`
only.

**Scope.** These are statements about the Aeneas model of `aes_like::encrypt` (Charon and Aeneas
trusted, as above), counting S-boxes with different inputs in two executions under the same
keys, which is the wide-trail activity bound, not a bound on differential or linear trail
probabilities. AES here has no special last round: every round adds the key, substitutes,
shifts rows and mixes columns, as in `aes_like.rs`, so `aes_rust_activity_bound_10` is about
ten such rounds; section 2.2 covers the cipher with the final round. The analysis service
does not yet instantiate `aes_like_encrypt_activity_bound_of_checks` (or its final-round form)
for submitted designs.

## 2.2 The AES final round

AES ends with a different round: no `MixColumns`, and one more key is added after it.
`aes_like::final_round(state, offsets, sbox, round_key, final_key)` adds `round_key`,
substitutes bytes, shifts rows and adds `final_key`. `aes_like::encrypt_with_last_round(state,
matrix, offsets, sbox, round_keys, rounds)` applies `encrypt` with `rounds - 1` rounds, then
`final_round` with `round_keys[rounds - 1]` and `round_keys[rounds]` (with `rounds = 0` it
leaves the state unchanged); it panics if `rounds > 0` and fewer than `rounds + 1` keys are
given. With the AES matrix, offsets and S-box, `rounds = 10` and the eleven keys of the AES-128
key expansion it is AES-128 encryption: the Rust tests compute that expansion (in test code;
the kernel takes keys as data) and check the ciphertexts of FIPS 197 Appendices B and C.1.

**Model** (`lean/Cryptificate/Bridge.lean`, added next to the unchanged `aesLikeRound` and
`aesLikeExec`):

```lean
def aesLikeFinalRound off sbox key finalKey s :=
  addRoundKey finalKey (shiftRows off (subBytes sbox (addRoundKey key s)))
def aesLikeCipher M off sbox keys x : ℕ → Fin 16 → K
  | 0 => x
  | n + 1 => aesLikeFinalRound off sbox (keys n) (keys (n + 1)) (aesLikeExec M off sbox keys x n)
```

`aesLikeCipherExec M off sbox keys r x n` is the state at the input of round `n` of the
`r`-round cipher, round by round (`aesLikeCipherExec_self`: after `r` rounds it is
`aesLikeCipher … r`), and `aesLikeCipherActiveSboxes … r x y` counts, over its `r` rounds, the
S-boxes whose inputs differ. Since rounds `0, …, r - 2` are full rounds, the state at the input
of round `n < r` is that of `aesLikeExec` (`aesLikeCipherExec_of_lt`), so

```lean
theorem aesLikeCipherActiveSboxes_eq (M off sbox keys r x y) :
    aesLikeCipherActiveSboxes M off sbox keys r x y = activeSboxes M off sbox keys x y r
theorem aesLikeCipherActiveSboxes_bound (hM : IsMDS M) (hoff : DiffusionOptimal …)
    (hs : Function.Injective sbox) (keys) (hxy : x ≠ y) (r) :
    activityBound r ≤ aesLikeCipherActiveSboxes M off sbox keys r x y
```

The final round's S-boxes are counted (they are the `r`-th round's), and the count over the
`r` rounds of the cipher is exactly the count over the first `r` rounds of `aesLikeExec`: the
missing linear layer and the final key come after the last S-box, so they neither add to nor
take from the bound. These two theorems are in the main package and checked there (the
diffusion audit example prints them; axioms `propext`, `Classical.choice`, `Quot.sound`).
`lean/Cryptificate/Examples/DiffusionCipher.lean` evaluates `aesLikeCipher` with the AES
parameters and the expanded FIPS 197 key, round by round, and proves that it maps the plaintext
of Appendix B to its ciphertext.

**Refinement** (`Refinement/AesLike.lean`):

```lean
theorem aes_like_final_round_refines (s o t k k') :
    aes_like.final_round s o t k k' ⦃ out =>
      stateOf out = aesLikeFinalRound (offsetsOf o) (sboxOf t) (stateOf k) (stateOf k') (stateOf s) ⦄
theorem aes_like_encrypt_with_last_round_refines (s m o t ks rounds) (hks : rounds.val < ks.length) :
    aes_like.encrypt_with_last_round s m o t ks rounds ⦃ out =>
      stateOf out = aesLikeCipher (matrixOf m) (offsetsOf o) (sboxOf t) (keysOf ks) (stateOf s) rounds.val ⦄
theorem aes_like_encrypt_with_last_round_activity_bound (m o t ks) (hM hoff ht)  -- as in section 2
    (x y) (hxy : stateOf x ≠ stateOf y) (r : Usize) (hr : r.val < ks.length) :
    ∃ outX outY,
      aes_like.encrypt_with_last_round x m o t ks r = ok outX ∧
      aes_like.encrypt_with_last_round y m o t ks r = ok outY ∧
      stateOf outX = aesLikeCipher (matrixOf m) … (stateOf x) r.val ∧
      stateOf outY = aesLikeCipher (matrixOf m) … (stateOf y) r.val ∧
      activityBound r.val ≤ aesLikeCipherActiveSboxes (matrixOf m) … r.val (stateOf x) (stateOf y)
```

with the `_eq` forms `aes_like_final_round_eq` and `aes_like_encrypt_with_last_round_eq`. For
`rounds = 0` the code reads no key but the theorem still asks for one (`rounds < ks.length`).

**Checks and AES** (`Refinement/AesConcrete.lean`):
`aes_like_encrypt_with_last_round_activity_bound_of_checks` replaces `hM`, `hoff`, `ht` by the
three byte checks of section 2.1 (and `stateOf x ≠ stateOf y` by `x ≠ y`), and

```lean
theorem aes_rust_cipher_activity_bound (ks) (x y) (hxy : x ≠ y) (r : Usize) (hr : r.val < ks.length) :
    ∃ outX outY,
      aes_like.encrypt_with_last_round x aesMatrixBytes aesOffsetBytes aesSboxBytes ks r = ok outX ∧
      aes_like.encrypt_with_last_round y aesMatrixBytes aesOffsetBytes aesSboxBytes ks r = ok outY ∧
      stateOf outX = aesLikeCipher (gfMat4 2 3 1 1 1 2 3 1 1 1 2 3 3 1 1 2) (offsets4 0 1 2 3)
        AES.sbox (keysOf ks) (stateOf x) r.val ∧
      stateOf outY = aesLikeCipher … (stateOf y) r.val ∧
      activityBound r.val ≤ aesLikeCipherActiveSboxes (gfMat4 …) (offsets4 0 1 2 3) AES.sbox
        (keysOf ks) r.val (stateOf x) (stateOf y)
theorem aes_rust_cipher_activity_bound_10 (ks) (x y) (hxy : x ≠ y) (hr : 11 ≤ ks.length) :
    ∃ outX outY, (… as above with r = 10#usize …) ∧
      55 ≤ aesLikeCipherActiveSboxes (gfMat4 …) (offsets4 0 1 2 3) AES.sbox (keysOf ks) 10 (stateOf x) (stateOf y)
```

The outputs of the Rust function are identified with the AES-like cipher over WideTrail's
algebraic `AES.sbox`; the count is over that cipher's trace. The S-box inputs of its round
`n < r` are the outputs of `aes_like.encrypt` after `n` rounds plus key `n`
(`aesLikeCipherExec_of_lt` with `aes_like_encrypt_refines`), which is what
`encrypt_with_last_round` computes before its final round; the theorems do not restate the
count in terms of those Rust values. All theorems of this section use `propext`,
`Classical.choice`, `Quot.sound` only (`Refinement/Axioms.lean`).

**Scope.** As in section 2.1: the Aeneas model of the Rust source, Charon and Aeneas trusted,
the wide-trail activity count, not a bound on trail probabilities. The keys are arbitrary data:
`aes_rust_cipher_activity_bound_10` holds for every sequence of eleven or more keys, so in
particular for the AES-128 key expansion, which no theorem here models (the FIPS 197
ciphertexts are checked by the Rust tests and, for the model, by the example above, not by a
refinement theorem). AES-192 and AES-256 use the same data path with `12` and `14` rounds;
`aes_rust_cipher_activity_bound` covers those round counts (with `13` and `15` keys), not their
key expansions.

## 3. The gf256 crate (crates.io, version 0.3.1)

Configuration (`gf256crate/`): `#[gf(polynomial = 0x11b, generator = 0x3)]` with the crate
features `no-tables` and `no-xmul`. The macro then uses Barrett reduction (`barret` mode) over
the crate's polynomial types `p8`/`p16`, whose carry-less multiplication uses the bitwise loops
(`HAS_XMUL = false`).

**Expanded-source identity.** `gf256crate/expand.sh` expands the configuration with
`rustc -Zunpretty=expanded` (toolchain `nightly-2026-09-17`, dependencies locked by
`gf256crate/Cargo.lock`) and assembles one crate, `rust/gf256_aes_expanded.rs`, SHA-256
`53c324b9d62d448aaedf38c7741c8eba6bc4a2448dc888fa255529c859ddf824`. The assembly
(`gf256crate/assemble.py`) changes no executable code: it adds the internal feature gates and
two lint allowances that expanded derive and `panic!` code needs, adds
`extern crate self as gf256;` so the type's `::gf256::…` paths resolve inside the one crate,
drops the crate's predefined field types (`0x11D` and wider fields), macro imports and
documentation.
`cargo test` in `gf256crate/` checks that the expanded source, the crate itself and
`crates/kernels` agree on all 65,536 products.

**Extraction.** Charon translates the expanded crate starting from
`gf256_aes::__gf256_aes_gen::gf256_aes::mul`. Two problems, both handled explicitly:

* Aeneas emits Lean that does not compile: inside `mul` it names a temporary of type `p8` `p`,
  and Lean then reads the next reference to the crate module `p` (`p.__p8_gen.p8.widening_mul`)
  as a field of that local. `extract.sh` rewrites such references to their full names
  (`gf256_aes.p.__p8_gen.p8.widening_mul`), the names the definitions are declared under; no
  other change is made.
* `core::mem::size_of` (used for shift amounts) is not modelled by the Aeneas library at the
  pinned commit, so the translation declares `axiom gf256_aes.core.mem.size_of (T : Type) :
  Result Usize`, an uninterpreted function. The theorems assume
  `SizeOfU8 : gf256_aes.core.mem.size_of U8 = ok 1#usize` (`size_of::<u8>() == 1` is guaranteed
  by Rust), and `#print axioms` lists `gf256_aes.core.mem.size_of` for them.

Proof file `Refinement/Gf256Crate.lean`, namespace `Cryptificate.Refinement.Gf256Crate`:

```lean
theorem gf256crate_mul_refines (hsize : SizeOfU8) (a b : U8) :
    gf256_aes.__gf256_aes_gen.gf256_aes.mul a b = ok ⟨GF256.rawMul a.bv b.bv⟩
theorem gf256crate_mul_field (hsize : SizeOfU8) (a b : U8) :
    gf256_aes.__gf256_aes_gen.gf256_aes.mul a b = ok (ofField (toField a * toField b))
theorem gf256crate_mul_eq_kernels (hsize : SizeOfU8) (a b : U8) :
    gf256_aes.__gf256_aes_gen.gf256_aes.mul a b = cryptificate_kernels.gf256.mul a b
```

Axioms: `propext`, `Classical.choice`, `Quot.sound`, `gf256_aes.core.mem.size_of`. The proof
evaluates the crate's Barrett constant (`0x1B00 / 0x11B = 0x1A`, `naive_div_barrett`), proves
the loops of `naive_widening_mul` and `naive_wrapping_mul` by induction, and shows that the
resulting bit-level function equals `GF256.rawMul` (`crateMul_eq_rawMul`, axioms `propext`,
`Quot.sound`): both are additive in each argument, so the kernel checks the 64 products of
single-bit bytes and additivity extends them to all 65,536.

## 4. BN254 scalar field (arkworks): not established

`crates/kernels` re-exports `ark_bn254::Fr` (ark-bn254 / ark-ff 0.6), whose multiplication is
arkworks' generic Montgomery multiplication (`MontBackend<T, 4>`). No refinement theorem covers
it, and none covers a HADES round over it. What blocks the chain at this toolchain:

* `bn254-probe/probe.sh` runs the pinned Charon and Aeneas on `a * b` for `Fr`. Charon
  translates it with two warnings (`GATs cannot work with the --lift-associated-types option
  (implied by --preset=aeneas)` on the trait `ark_ff::Field`, `ark-ff-0.6.0/src/fields/mod.rs`
  line 160). Aeneas then fails: it reports mutually recursive groups mixing traits, types and
  functions (`Field`, `AdditiveGroup`, `PrimeField`, `FftField`, `FpConfig`,
  `SqrtPrecomputation`, the `Fp` trait implementations) as not supported, internal errors on
  the signatures of `Fp::mul` and of `MontBackend`'s `mul_assign`, `add_assign`, … and finally
  `Unimplemented` at `ark-ff-0.6.0/src/fields/mod.rs` lines 160–201, exiting with status 2.
  No Lean model of the arkworks code exists.
* Even with a model, the proof would have to show that arkworks' Montgomery multiplication
  (4×64-bit limbs, with carries in `u128`) and its final conditional subtraction compute
  `a·b·R⁻¹ mod p` for the BN254 modulus, and relate the Montgomery representation to
  WideTrail's `Poseidon2.BN254.F`. That proof has not been attempted.

So for designs over BN254, the evidence label "Rust-source refinement (Aeneas)" does not apply.
A possible route is a self-contained Montgomery kernel in `crates/kernels`, written in the
subset Aeneas handles, proved against `ZMod p`, and used by the native code instead of
arkworks; that is not done.

## Trusted components

* **Charon and Aeneas**: that the Lean model has the behaviour of the Rust source. The
  extraction is reproducible (`extract.sh` regenerates it byte for byte and checks the hashes),
  but its faithfulness is not proved.
* **The gf256 crate expansion** (section 3): that `rustc -Zunpretty=expanded` and
  `gf256crate/assemble.py` preserve the behaviour of the crate, which is checked by testing all
  65,536 products, not proved; and the renaming of module paths that `extract.sh` applies to
  `Extracted/Gf256Aes.lean` before Lean checks it.
* **The Aeneas Lean library**: its models of Rust integers (`U8`, `I8`, `I32`, `U16`, `U32`,
  `Usize`), shifts, casts, arrays and slices. It also declares axioms of its own for parts of
  the standard library it does not model (`Aeneas.Std.get_target`, `get_target.spec`,
  `target_feature_enabled`, the opaque types `core.sync.atomic.AtomicBool`, `AtomicU32`,
  `core.panic.panic_info.PanicInfo`, `core.pin.Pin`, `core.pin.helper.PinHelper`, and
  `core.slice.Slice.get_unchecked_SliceIndexUsizeSlice_spec`); none of the theorems above
  depends on them (`Refinement/Axioms.lean` pins every theorem's axioms with `#guard_msgs`).
* **The Lean kernel** (Lean `v4.35.0`).
* **rustc**: compilation of the Rust source to machine code is outside the chain, as are the
  optimizer and linker. The theorems are about the source.
* **The hardware.**

Not claimed: constant-time execution or the absence of other side channels; correctness of the
compiled machine code; anything about the generated native variants (`crates/native`) beyond
their calls to these kernel functions (the generated circuit code is checked by tests, not
refined); the BN254 arithmetic. The AES-like round kernel is proved, but the timed GF(2⁸)
native variants implement the column mixing as generated circuits and call only `gf256::add`,
`xtime` and `mul` from these kernels.

## Reproducing

```sh
# from the repository root
refinement/gf256crate/expand.sh                 # expanded-source identity of the gf256 crate
CHARON=… AENEAS=… refinement/extract.sh         # both extractions, byte for byte
(cd refinement && CI=1 lake build)              # all proofs, with the axiom pins
python3 -I refinement/scripts/claims.py --check # claims.json against Lean and the sources
(cd refinement/gf256crate && cargo test)        # expansion = crate = kernels on 65,536 products
CHARON=… AENEAS=… refinement/bn254-probe/probe.sh   # the BN254 failure above
```
