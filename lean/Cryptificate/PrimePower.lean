import WideTrail

/-!
# Power maps over a prime field

A HADES design uses the S-box `x ↦ x ^ e` on every coordinate it touches. Whether this map is
a permutation of the field `𝔽_q` depends only on `gcd(e, q - 1)`, and both answers have short
certificates that the kernel can check without enumerating the field:

* **Bijective.** An inverse exponent `d` with `e * d = (q - 1) * k + 1` makes `x ↦ x ^ d` a
  two-sided inverse, by Fermat's little theorem. WideTrail packages exactly this as
  `Sbox.powerEquivOfFermat`; `pow_bijective_of_inverse` and `BN254.pow_bijective` only state
  the consequence. The certificate is one identity between natural numbers, which the kernel
  checks with its arbitrary-precision arithmetic.
* **Not injective.** An element `w ≠ 1` with `w ^ e = 1` collides with `1`, since `1 ^ e = 1`.
  When `g = gcd(e, q - 1) > 1`, such a `w` is a nontrivial `g`-th root of unity, for example
  `a ^ ((q - 1) / g)` for a suitable base `a`. For `e = 3` over the BN254 scalar field it is a
  primitive cube root of unity.

The collision check has to compute `w ^ e` in the kernel, and `e` may be as large as `65535`.
`Monoid.npow` on `ZMod p` multiplies `e` times, one level of recursion per factor. For
`e = 65535`, under the options and the memory limit that certificates run with, `decide` stops
at the recursion limit and a kernel-only check (`decide +kernel`) runs out of memory.
`fastPow` is square-and-multiply, so it takes about `2 log₂ e` multiplications;
`fastPow_eq` identifies it with `Monoid.npow` once, for every monoid, so certificates state
their results with the ordinary `^`.
-/

set_option autoImplicit false

namespace Cryptificate.PrimePower

/-! ### Square-and-multiply -/

section FastPow

variable {M : Type*} [Monoid M]

/-- Square-and-multiply with an explicit recursion budget: `powFuel fuel x n` reads the bits of
`n` from the least significant one and squares `x` at each step. Recursion is structural on
`fuel`, which the kernel unfolds without well-founded recursion; `fuel ≥ n` is always enough. -/
def powFuel : ℕ → M → ℕ → M
  | 0, _, _ => 1
  | fuel + 1, x, n =>
    if n = 0 then 1 else (if n % 2 = 1 then x else 1) * powFuel fuel (x * x) (n / 2)

/-- `x ^ n` by square-and-multiply. -/
def fastPow (x : M) (n : ℕ) : M := powFuel n x n

theorem powFuel_eq (fuel : ℕ) (x : M) (n : ℕ) (h : n ≤ fuel) : powFuel fuel x n = x ^ n := by
  induction fuel generalizing x n with
  | zero =>
    obtain rfl : n = 0 := by omega
    simp [powFuel]
  | succ fuel ih =>
    by_cases hn : n = 0
    · subst hn
      simp [powFuel]
    · have hhalf : n / 2 ≤ fuel := by omega
      have hsq : (x * x) ^ (n / 2) = x ^ (2 * (n / 2)) := by rw [← sq, ← pow_mul]
      simp only [powFuel, hn, if_false, ih (x * x) (n / 2) hhalf, hsq]
      rcases Nat.mod_two_eq_zero_or_one n with h2 | h2
      · rw [if_neg (by omega), one_mul]
        congr 1
        omega
      · rw [if_pos h2, ← pow_succ']
        congr 1
        omega

/-- **Square-and-multiply computes the monoid power.** -/
theorem fastPow_eq (x : M) (n : ℕ) : fastPow x n = x ^ n := powFuel_eq n x n le_rfl

end FastPow

/-! ### Collisions -/

/-- **A nontrivial root refutes injectivity.** If `w ≠ 1` and `w ^ e = 1`, computed by
square-and-multiply, then `1` and `w` have the same image under `x ↦ x ^ e`. -/
theorem pow_not_injective_of_root {M : Type*} [Monoid M] (e : ℕ) (w : M)
    (hw : fastPow w e = 1) (hw1 : w ≠ 1) : ¬ Function.Injective (fun x : M => x ^ e) := by
  intro hinj
  apply hw1
  apply hinj
  change w ^ e = 1 ^ e
  rw [← fastPow_eq, hw, one_pow]

/-! ### Inverse exponents -/

/-- **An inverse exponent proves bijectivity.** In a field whose nonzero elements satisfy
`x ^ (q - 1) = 1`, an identity `e * d = (q - 1) * k + 1` makes `x ↦ x ^ d` the inverse of
`x ↦ x ^ e` (WideTrail's `Sbox.powerEquivOfFermat`). -/
theorem pow_bijective_of_inverse {K : Type*} [Field K] (q e d k : ℕ) (he : 0 < e) (hd : 0 < d)
    (hexp : e * d = (q - 1) * k + 1) (hfermat : ∀ x : K, x ≠ 0 → x ^ (q - 1) = 1) :
    Function.Bijective (fun x : K => x ^ e) :=
  (Sbox.powerEquivOfFermat q e d k he hd hexp hfermat).bijective

namespace BN254

open Poseidon2.BN254

/-- The power S-box `x ↦ x ^ e` on the BN254 scalar field, with inverse `x ↦ x ^ d`. -/
def powEquiv (e d k : ℕ) (he : 0 < e) (hd : 0 < d) (hexp : e * d = (modulus - 1) * k + 1) :
    F ≃ F :=
  Sbox.powerEquivOfFermat modulus e d k he hd hexp fermat

@[simp] theorem powEquiv_apply (e d k : ℕ) (he : 0 < e) (hd : 0 < d)
    (hexp : e * d = (modulus - 1) * k + 1) (x : F) : powEquiv e d k he hd hexp x = x ^ e :=
  rfl

/-- `x ↦ x ^ e` permutes the BN254 scalar field once `e * d = (p - 1) * k + 1`. -/
theorem pow_bijective (e d k : ℕ) (he : 0 < e) (hd : 0 < d)
    (hexp : e * d = (modulus - 1) * k + 1) : Function.Bijective (fun x : F => x ^ e) :=
  (powEquiv e d k he hd hexp).bijective

/-- WideTrail's reference exponent `5` and its inverse, recovered through this interface. -/
example : Function.Bijective (fun x : F => x ^ 5) :=
  pow_bijective 5 inverseExponent 4 (by decide) inverseExponent_positive inverseExponent_equation

/-- A primitive cube root of unity, `3 ^ ((p - 1) / 3)`: the exponent `3` is not a permutation
exponent, because `3` divides `p - 1`. -/
example : ¬ Function.Injective (fun x : F => x ^ 3) :=
  pow_not_injective_of_root 3
    (4407920970296243842393367215006156084916469457145843978461 : F) (by decide) (by decide)

end BN254

end Cryptificate.PrimePower
