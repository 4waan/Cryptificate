import Cryptificate.PrimeField.Pratt
import Cryptificate.PrimeField.Encoding
import Cryptificate.PrimeField.Power
import Cryptificate.PrimeField.Presets
import Cryptificate.PrimeField.NatMatrix
import Cryptificate.PrimeField.Packed
import Cryptificate.Diffusion.Minors2
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
* `PrimeField.Packed`: the checks of wide widths (Poseidon2 widths `8`, `12`, `16`, `24`, and
  the generic path of width two). Matrices and vectors are packed into single numbers, base
  `2 ^ S`, and every dot product is one multiplication (Kronecker substitution), so the kernel's
  GMP arithmetic does the work: an inverse witness proves a matrix invertible
  (`Packed.det_ne_zero_of_checkInverse`), an inverse of `t` rows `eᵢ Mʲ` proves observability
  (`Hades.observable_of_checkObsP`), rows orthogonal to a vector prove a short bypass
  (`Hades.powers_zero_of_checkOrthP`), and one packed comparison proves that a matrix is the
  Poseidon2 external matrix `circ(2 M₄, M₄, …, M₄)` (`Hades.pfMat_eq_poseidon2External_of_checkP`).
* `PrimeField.NatMatrix`: kernel vectors of singular matrices and invariant-subspace bypasses,
  checked on lists, and the definition of `poseidon2External`.
* `Diffusion.Minors2`: a `2 × 2` matrix is MDS once its `5` canonical minors are nonzero.
-/
