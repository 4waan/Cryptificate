import Cryptificate.Diffusion.Minors3
import Cryptificate.Diffusion.Branch
import Cryptificate.PrimePower
import Cryptificate.Hades.Design
import Cryptificate.Hades.Partial
import Cryptificate.Hades.Reference
import Cryptificate.Hades.Axioms

/-!
# Certificates for HADES designs over the BN254 scalar field

The definitions and theorems below are generic in the field and the width; the BN254 templates
(`hades/bn254/v1`) use them at width three, and the prime-field templates (`hades/prime/v1`, see
`Cryptificate.PrimeField`) at widths three and four over `ZMod p`, with `Hades.Wide` for the
width-four certificates.

A HADES request (`hades/bn254/v1`) names an external and an internal `3 × 3` matrix, a power
S-box `x ↦ x ^ e`, and the numbers of full and partial rounds. Each claim the service reports
about it is a theorem about these definitions, proved from a small concrete computation:

* `Diffusion.Minors3`: a `3 × 3` matrix is MDS once its `19` canonical minors, evaluated by
  explicit formulas, are nonzero (`Mat3.isMDS_of_minorsOk`); a low-weight vector refutes it
  (`not_isMDS_of_witness`, shared with the width-four certificates). The same file decides
  invertibility of the internal matrix from its explicit determinant and refutes it with a
  kernel vector.
* `PrimePower`: an inverse exponent `d` with `e * d = (p - 1) * k + 1` proves `x ↦ x ^ e`
  bijective; an element `w ≠ 1` with `w ^ e = 1`, checked by square-and-multiply, proves it is
  not injective.
* `Hades.Design`: the submitted design as plain data with its own execution, and the
  full-round activity bound obtained from WideTrail's `Hades` library under the three facts
  above.
* `Hades.Partial`: the partial rounds. A nonzero difference that every power of the internal
  matrix keeps at zero on the partial-round mask passes all partial rounds with no active S-box
  (`Design.Bypass`, certified by an invariant subspace); conversely, when the rows of the powers
  of the internal matrix at the masked positions have full rank within `L` steps, every window of
  `L` consecutive partial rounds is charged (`Design.WindowActive`), and the full-round bound
  extends to `outerBound + RP / L` active S-boxes over the whole permutation.
* `Hades.Reference`: the execution model agrees with WideTrail's pinned Poseidon2 permutation,
  the bound recovers WideTrail's figure of `16` active S-boxes in the full rounds, and with the
  partial rounds counted the reference parameters activate at least `34`.
-/
