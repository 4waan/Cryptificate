import Cryptificate.Encoding

/-!
# Byte S-boxes given as tables

A candidate either names the AES S-box or gives its own as a table of `256` bytes, entry `x`
being the image of the byte `x`. The activity bound needs only that the S-box is injective
(`Cryptificate.Bridge`), so the S-box claim is bijectivity, and both outcomes have a short
certificate:

* **bijective**: the generator also writes the inverse table, and the kernel checks that the
  inverse undoes the table on all `256` bytes (`bijective_of_leftInverse`). A left inverse
  makes the map injective, and an injective self-map of a finite type is bijective, so the
  check is one pass over the bytes and no search.
* **not injective**: two distinct bytes with the same entry (`not_injective_of_collision`).

For the AES S-box, WideTrail already proves bijectivity structurally
(`AES.sboxEquiv`, from the explicit inverse `AES.sboxInv`), and `aes_sbox_bijective` reuses it
rather than evaluating the table.

WideTrail defines `AES.sbox` algebraically, as inversion in `GF(2⁸)` followed by the affine
map, not by the table that FIPS 197 prints. A certificate for a candidate that names the AES
S-box uses that definition and echoes only `{"kind":"aes"}`, so `aes_sbox_eq_table` checks once,
here, that the definition agrees with the printed table on all `256` bytes. The kernel does the
check in four blocks of `64` bytes: one evaluation over all `256` exhausts its memory, because
every byte evaluates a field inversion.

The generator writes a table as `byteTable![0x63 0x7C …]`, `256` byte numerals separated by
spaces. The notation below turns it into a lookup tree on the bits of the index, so that the
kernel's pass over all `256` bytes costs eight bit tests per lookup.
-/

set_option autoImplicit false

namespace Cryptificate

/-- Look up `n` in one of two tables according to bit `i` of `n`. A byte table is a complete
binary tree of these, eight levels deep, so one lookup reads eight bits instead of walking a
list of `256` entries; this keeps the kernel's pass over all `256` bytes short. -/
def bitSel (i : ℕ) (a b : ℕ → ℕ) (n : ℕ) : ℕ := if n.testBit i then b n else a n

open Lean in
/-- The lookup tree for the entries `lo, …, lo + 2 ^ d - 1` of `xs`, splitting on bit `d - 1`
first. -/
def byteTree (xs : Array (TSyntax `num)) : ℕ → ℕ → MacroM Term
  | 0, lo => `(fun _ : ℕ => ($(xs[lo]!) : ℕ))
  | d + 1, lo => do
    let a ← byteTree xs d lo
    let b ← byteTree xs d (lo + 2 ^ d)
    `(bitSel $(Syntax.mkNumLit (toString d)) $a $b)

/-- `byteTable![e₀ e₁ … e₂₅₅]` is the map `ℕ → ℕ` sending `x < 256` to `eₓ`, written with
spaces between entries so that a generator can paste a table directly. Exactly `256` entries
are required. -/
syntax (name := byteTableStx) "byteTable![" num* "]" : term

macro_rules
  | `(byteTable![ $xs* ]) => do
    if xs.size != 256 then
      Lean.Macro.throwError s!"a byte table has 256 entries, found {xs.size}"
    byteTree xs 8 0

/-- A byte table `f` read as a map of `GF(2⁸)`: the byte `x` goes to `f x`, reduced mod
`256`. -/
def tableSbox (f : ℕ → ℕ) : GF256 → GF256 := fun x => gf (f x.val.toNat)

/-- **An inverse table certifies bijectivity.** If `g` undoes `f` on every byte, `f` is a
bijection of `GF(2⁸)`. -/
theorem bijective_of_leftInverse {f g : GF256 → GF256} (h : ∀ x, g (f x) = x) :
    Function.Bijective f :=
  Finite.injective_iff_bijective.mp (Function.LeftInverse.injective h)

/-- **A collision refutes injectivity.** -/
theorem not_injective_of_collision {f : GF256 → GF256} (x₁ x₂ : GF256) (hne : x₁ ≠ x₂)
    (heq : f x₁ = f x₂) : ¬ Function.Injective f :=
  fun hf => hne (hf heq)

/-- The AES S-box is a bijection, by WideTrail's explicit inverse. -/
theorem aes_sbox_bijective : Function.Bijective AES.sbox := AES.sboxEquiv.bijective

/-! ### WideTrail's AES S-box is the table of FIPS 197 -/

/-- The AES S-box as FIPS 197 prints it, sixteen entries per row: entry `x` is the image of the
byte `x`. -/
def aesSboxTable : ℕ → ℕ := byteTable![
  0x63 0x7C 0x77 0x7B 0xF2 0x6B 0x6F 0xC5 0x30 0x01 0x67 0x2B 0xFE 0xD7 0xAB 0x76
  0xCA 0x82 0xC9 0x7D 0xFA 0x59 0x47 0xF0 0xAD 0xD4 0xA2 0xAF 0x9C 0xA4 0x72 0xC0
  0xB7 0xFD 0x93 0x26 0x36 0x3F 0xF7 0xCC 0x34 0xA5 0xE5 0xF1 0x71 0xD8 0x31 0x15
  0x04 0xC7 0x23 0xC3 0x18 0x96 0x05 0x9A 0x07 0x12 0x80 0xE2 0xEB 0x27 0xB2 0x75
  0x09 0x83 0x2C 0x1A 0x1B 0x6E 0x5A 0xA0 0x52 0x3B 0xD6 0xB3 0x29 0xE3 0x2F 0x84
  0x53 0xD1 0x00 0xED 0x20 0xFC 0xB1 0x5B 0x6A 0xCB 0xBE 0x39 0x4A 0x4C 0x58 0xCF
  0xD0 0xEF 0xAA 0xFB 0x43 0x4D 0x33 0x85 0x45 0xF9 0x02 0x7F 0x50 0x3C 0x9F 0xA8
  0x51 0xA3 0x40 0x8F 0x92 0x9D 0x38 0xF5 0xBC 0xB6 0xDA 0x21 0x10 0xFF 0xF3 0xD2
  0xCD 0x0C 0x13 0xEC 0x5F 0x97 0x44 0x17 0xC4 0xA7 0x7E 0x3D 0x64 0x5D 0x19 0x73
  0x60 0x81 0x4F 0xDC 0x22 0x2A 0x90 0x88 0x46 0xEE 0xB8 0x14 0xDE 0x5E 0x0B 0xDB
  0xE0 0x32 0x3A 0x0A 0x49 0x06 0x24 0x5C 0xC2 0xD3 0xAC 0x62 0x91 0x95 0xE4 0x79
  0xE7 0xC8 0x37 0x6D 0x8D 0xD5 0x4E 0xA9 0x6C 0x56 0xF4 0xEA 0x65 0x7A 0xAE 0x08
  0xBA 0x78 0x25 0x2E 0x1C 0xA6 0xB4 0xC6 0xE8 0xDD 0x74 0x1F 0x4B 0xBD 0x8B 0x8A
  0x70 0x3E 0xB5 0x66 0x48 0x03 0xF6 0x0E 0x61 0x35 0x57 0xB9 0x86 0xC1 0x1D 0x9E
  0xE1 0xF8 0x98 0x11 0x69 0xD9 0x8E 0x94 0x9B 0x1E 0x87 0xE9 0xCE 0x55 0x28 0xDF
  0x8C 0xA1 0x89 0x0D 0xBF 0xE6 0x42 0x68 0x41 0x99 0x2D 0x0F 0xB0 0x54 0xBB 0x16]

/-- Whether `AES.sbox` agrees with `aesSboxTable` on the `64` bytes from `lo`. -/
def aesSboxAgreesFrom (lo : ℕ) : Bool :=
  (List.range' lo 64).all fun n => decide (AES.sbox (gf n) = gf (aesSboxTable n))

theorem aesSboxAgreesFrom_0 : aesSboxAgreesFrom 0 = true := by decide +kernel
theorem aesSboxAgreesFrom_64 : aesSboxAgreesFrom 64 = true := by decide +kernel
theorem aesSboxAgreesFrom_128 : aesSboxAgreesFrom 128 = true := by decide +kernel
theorem aesSboxAgreesFrom_192 : aesSboxAgreesFrom 192 = true := by decide +kernel

/-- Every element of `GF(2⁸)` is the byte numeral of its own value. -/
theorem gf_val_toNat (x : GF256) : gf x.val.toNat = x := by
  cases x
  simp [gf]

/-- **WideTrail's AES S-box is the table of FIPS 197**, on every byte. -/
theorem aes_sbox_eq_table (x : GF256) : AES.sbox x = tableSbox aesSboxTable x := by
  have block : ∀ lo, aesSboxAgreesFrom lo = true → lo ≤ x.val.toNat →
      x.val.toNat < lo + 64 → AES.sbox x = tableSbox aesSboxTable x := by
    intro lo h hlo hhi
    simp only [aesSboxAgreesFrom, List.all_eq_true, List.mem_range', decide_eq_true_eq] at h
    have := h x.val.toNat ⟨x.val.toNat - lo, by omega, by omega⟩
    rwa [gf_val_toNat] at this
  have hlt : x.val.toNat < 256 := x.val.isLt
  by_cases h0 : x.val.toNat < 64
  · exact block 0 aesSboxAgreesFrom_0 (by omega) (by omega)
  by_cases h1 : x.val.toNat < 128
  · exact block 64 aesSboxAgreesFrom_64 (by omega) (by omega)
  by_cases h2 : x.val.toNat < 192
  · exact block 128 aesSboxAgreesFrom_128 (by omega) (by omega)
  · exact block 192 aesSboxAgreesFrom_192 (by omega) (by omega)

end Cryptificate
