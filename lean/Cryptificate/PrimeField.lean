import Cryptificate.PrimeField.Pratt
import Cryptificate.PrimeField.Encoding
import Cryptificate.PrimeField.Power
import Cryptificate.PrimeField.Presets
import Cryptificate.PrimeField.Axioms
import Cryptificate.Hades.Wide

/-!
# Certificates over any prime field

A request in the prime-field profile (`hades/prime/v1`) names a modulus `p` below `2⁶⁴`: one of
BabyBear, KoalaBear, Mersenne31 and Goldilocks, or a custom prime. Its claims are theorems about
`ZMod p`, and each certificate establishes the facts they rest on from small concrete
computations:

* `PrimeField.Pratt`: `Nat.Prime p` from a Pratt certificate (a base of order `p - 1` and the
  factorization of `p - 1`, recursively), checked by evaluating one Boolean function with
  `decide` (`Pratt.prime_of_checkFlat`). The certificate turns it into `Fact (Nat.Prime p)`, so
  `ZMod p` is a field.
* `PrimeField.Encoding`: matrices, vectors and masks of any width from flat numeral lists, and
  the echo of their values.
* `PrimeField.Power`: `x ↦ x ^ e` permutes `ZMod p` given an inverse exponent.
* `Hades.Wide`: the width-four observability certificate and the invariant-subspace and short
  bypass certificates for any dimension; with `Diffusion.Minors4` (MDS of `4 × 4` matrices) and
  `Hades.Design`/`Hades.Partial`, which are generic in the field and the width, these cover
  HADES designs of width three and four.
* `PrimeField.Presets`: the named moduli are prime, by the same checker.
-/
