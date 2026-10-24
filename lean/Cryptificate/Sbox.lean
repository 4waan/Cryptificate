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

end Cryptificate
