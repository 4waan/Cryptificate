import Cryptificate.PrimePower

/-!
# Power maps over `ZMod p` for any prime `p`

`PrimePower` proves bijectivity of `x ↦ x ^ e` from an inverse exponent in any field that
satisfies Fermat's little theorem, and refutes injectivity from a nontrivial root `w ^ e = 1` in
any monoid. Its `BN254` section instantiates the first for the pinned BN254 modulus. This file does
the same for `ZMod p` with any prime `p`, given as an instance `Fact (Nat.Prime p)`, which a
certificate builds from a Pratt certificate (`Cryptificate.Pratt`):

* `pow_bijective`: if `e * d = (p - 1) * k + 1` then `x ↦ x ^ e` permutes `ZMod p`, with inverse
  `x ↦ x ^ d`. Such `d` exists exactly when `gcd(e, p - 1) = 1`.
* Non-injectivity needs nothing new: `PrimePower.pow_not_injective_of_root` already holds in every
  monoid, and a certificate applies it to `ZMod p` with a root of unity checked by
  square-and-multiply.
-/

set_option autoImplicit false

namespace Cryptificate.PrimePower.ZModP

/-- The power S-box `x ↦ x ^ e` on `ZMod p`, with inverse `x ↦ x ^ d`. -/
def powEquiv (p : ℕ) [Fact p.Prime] (e d k : ℕ) (he : 0 < e) (hd : 0 < d)
    (hexp : e * d = (p - 1) * k + 1) : ZMod p ≃ ZMod p :=
  Sbox.powerEquivOfFermat p e d k he hd hexp fun _ hx => ZMod.pow_card_sub_one_eq_one hx

@[simp] theorem powEquiv_apply (p : ℕ) [Fact p.Prime] (e d k : ℕ) (he : 0 < e) (hd : 0 < d)
    (hexp : e * d = (p - 1) * k + 1) (x : ZMod p) : powEquiv p e d k he hd hexp x = x ^ e :=
  rfl

/-- **`x ↦ x ^ e` permutes `ZMod p`** once `e * d = (p - 1) * k + 1`, for any prime `p`. -/
theorem pow_bijective (p : ℕ) [Fact p.Prime] (e d k : ℕ) (he : 0 < e) (hd : 0 < d)
    (hexp : e * d = (p - 1) * k + 1) : Function.Bijective (fun x : ZMod p => x ^ e) :=
  (powEquiv p e d k he hd hexp).bijective

/-- The BN254 statement is the special case `p = Poseidon2.BN254.modulus`. -/
example (e d k : ℕ) (he : 0 < e) (hd : 0 < d)
    (hexp : e * d = (Poseidon2.BN254.modulus - 1) * k + 1) :
    Function.Bijective (fun x : Poseidon2.BN254.F => x ^ e) :=
  pow_bijective Poseidon2.BN254.modulus e d k he hd hexp

end Cryptificate.PrimePower.ZModP
