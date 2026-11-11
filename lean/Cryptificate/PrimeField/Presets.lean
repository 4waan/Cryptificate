import Cryptificate.PrimeField.Pratt
import WideTrail.Poseidon2.BN254Parameters

/-!
# The named prime fields

The prime-field profile offers five moduli by name, and any other prime the user supplies. For
each named modulus this file proves primality with the same Pratt checker the generated
certificates use (`Pratt.prime_of_checkFlat`), so the library build itself exercises the checker
on every named field. A generated certificate does not import these theorems: it carries its own
Pratt certificate for the submitted modulus, named or not.

| Name | Modulus | `p - 1` |
|---|---|---|
| BabyBear | `2013265921 = 15 · 2²⁷ + 1` | `2²⁷ · 3 · 5` |
| KoalaBear | `2130706433 = 127 · 2²⁴ + 1` | `2²⁴ · 127` |
| Mersenne31 | `2147483647 = 2³¹ - 1` | `2 · 3² · 7 · 11 · 31 · 151 · 331` |
| Goldilocks | `18446744069414584321 = 2⁶⁴ - 2³² + 1` | `2³² · 3 · 5 · 17 · 257 · 65537` |
| BN254 (scalar field) | `Poseidon2.BN254.modulus` | 254 bits, ten prime factors |

The BN254 theorem re-proves WideTrail's `Fact (Nat.Prime modulus)` through the generic checker,
with nested certificates for the large factors of `p - 1`; the BN254 certificates themselves
keep using WideTrail's instance.
-/

set_option autoImplicit false

namespace Cryptificate.PrimeField

/-- The BabyBear modulus `15 · 2²⁷ + 1`. -/
def babyBear : ℕ := 2013265921

/-- The KoalaBear modulus `127 · 2²⁴ + 1`. -/
def koalaBear : ℕ := 2130706433

/-- The Mersenne prime `2³¹ - 1`. -/
def mersenne31 : ℕ := 2147483647

/-- The Goldilocks modulus `2⁶⁴ - 2³² + 1`. -/
def goldilocks : ℕ := 18446744069414584321

theorem babyBear_eq : babyBear = 15 * 2 ^ 27 + 1 := by decide
theorem koalaBear_eq : koalaBear = 127 * 2 ^ 24 + 1 := by decide
theorem mersenne31_eq : mersenne31 = 2 ^ 31 - 1 := by decide
theorem goldilocks_eq : goldilocks = 2 ^ 64 - 2 ^ 32 + 1 := by decide

theorem babyBear_prime : Nat.Prime babyBear :=
  Pratt.prime_of_checkFlat
    [2, 1, 0, 3, 2, 1, 2, 1, 5, 2, 1, 2, 2, 2013265921, 31, 3, 2, 27, 3, 1, 5, 1] _ (by decide)

theorem koalaBear_prime : Nat.Prime koalaBear :=
  Pratt.prime_of_checkFlat
    [2, 1, 0, 3, 2, 1, 2, 1, 7, 3, 2, 2, 1, 3, 1, 127, 3, 3, 2, 1, 3, 2, 7, 1, 2130706433, 3, 2, 2,
     24, 127, 1] _ (by decide)

theorem mersenne31_prime : Nat.Prime mersenne31 :=
  Pratt.prime_of_checkFlat
    [2, 1, 0, 3, 2, 1, 2, 1, 7, 3, 2, 2, 1, 3, 1, 5, 2, 1, 2, 2, 11, 2, 2, 2, 1, 5, 1, 31, 3, 3, 2,
     1, 3, 1, 5, 1, 151, 6, 3, 2, 1, 3, 1, 5, 2, 331, 3, 4, 2, 1, 3, 1, 5, 1, 11, 1, 2147483647, 7,
     7, 2, 1, 3, 2, 7, 1, 11, 1, 31, 1, 151, 1, 331, 1] _ (by decide)

theorem goldilocks_prime : Nat.Prime goldilocks :=
  Pratt.prime_of_checkFlat
    [2, 1, 0, 3, 2, 1, 2, 1, 5, 2, 1, 2, 2, 17, 3, 1, 2, 4, 257, 3, 1, 2, 8, 65537, 3, 1, 2, 16,
     18446744069414584321, 7, 6, 2, 32, 3, 1, 5, 1, 17, 1, 257, 1, 65537, 1] _ (by decide)

set_option maxRecDepth 16000 in
theorem bn254_prime : Nat.Prime Poseidon2.BN254.modulus :=
  Pratt.prime_of_checkFlat
    [2, 1, 0, 3, 2, 1, 2, 1, 13, 2, 2, 2, 2, 3, 1, 7, 3, 2, 2, 1, 3, 1, 29, 2, 2, 2, 2, 7, 1, 5, 2,
     1, 2, 2, 491, 2, 3, 2, 1, 5, 1, 7, 2, 983, 5, 2, 2, 1, 491, 1, 11, 2, 2, 2, 1, 5, 1, 5501, 2,
     3, 2, 2, 5, 3, 11, 1, 11003, 2, 2, 2, 1, 5501, 1, 449, 3, 2, 2, 6, 7, 1, 237073, 15, 4, 2, 4,
     3, 1, 11, 1, 449, 1, 41, 6, 2, 2, 3, 5, 1, 3691, 2, 4, 2, 1, 3, 2, 5, 1, 41, 1, 17, 3, 1, 2, 4,
     4999, 3, 4, 2, 1, 3, 1, 7, 2, 17, 1, 405928799, 22, 4, 2, 1, 11, 1, 3691, 1, 4999, 1, 53, 2, 2,
     2, 2, 13, 1, 107, 2, 2, 2, 1, 53, 1, 661, 2, 4, 2, 2, 3, 1, 5, 1, 11, 1, 31, 3, 3, 2, 1, 3, 1,
     5, 1, 93001, 14, 4, 2, 3, 3, 1, 5, 3, 31, 1, 12048837557, 2, 4, 2, 2, 7, 2, 661, 1, 93001, 1,
     5156902474397, 2, 3, 2, 2, 107, 1, 12048837557, 1, 1670836401704629, 2, 3, 2, 2, 3, 4,
     5156902474397, 1, 137, 3, 2, 2, 3, 17, 1, 823, 3, 3, 2, 1, 3, 1, 137, 1, 19, 2, 2, 2, 1, 3, 2,
     23, 5, 2, 2, 1, 11, 1, 47, 5, 2, 2, 1, 23, 1, 37, 2, 2, 2, 2, 3, 2, 223, 3, 3, 2, 1, 3, 1, 37,
     1, 20963, 2, 3, 2, 1, 47, 1, 223, 1, 41927, 5, 2, 2, 1, 20963, 1, 1593227, 2, 3, 2, 1, 19, 1,
     41927, 1, 83, 2, 2, 2, 1, 41, 1, 379, 2, 3, 2, 1, 3, 3, 7, 1, 409, 21, 3, 2, 3, 3, 1, 17, 1,
     1637, 2, 2, 2, 2, 409, 1, 229, 6, 3, 2, 2, 3, 1, 19, 1, 71, 7, 3, 2, 1, 5, 1, 7, 1, 853, 2, 3,
     2, 2, 3, 1, 71, 1, 639533339, 2, 4, 2, 1, 229, 1, 853, 1, 1637, 1, 65865678001877903, 5, 5, 2,
     1, 83, 1, 379, 1, 1637, 1, 639533339, 1, 13818364434197438864469338081, 3, 5, 2, 5, 5, 1, 823,
     1, 1593227, 1, 65865678001877903, 1,
     21888242871839275222246405745257275088548364400416034343698204186575808495617, 5, 10, 2, 28, 3,
     2, 13, 1, 29, 1, 983, 1, 11003, 1, 237073, 1, 405928799, 1, 1670836401704629, 1,
     13818364434197438864469338081, 1] _ (by decide)

end Cryptificate.PrimeField
