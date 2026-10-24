import Cryptificate.Diffusion.Minors3
import Cryptificate.PrimePower
import Cryptificate.Hades.Design
import Cryptificate.Hades.Reference

/-!
# Certificates for HADES designs over the BN254 scalar field

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
* `Hades.Reference`: the execution model agrees with WideTrail's pinned Poseidon2 permutation,
  and the bound recovers WideTrail's figure of `16` active S-boxes.
-/
