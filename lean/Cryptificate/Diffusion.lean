import Cryptificate.Diffusion.Minors4
import Cryptificate.Diffusion.Branch
import Cryptificate.Diffusion.Offsets
import Cryptificate.Diffusion.Activity

/-!
# Diffusion certificates for AES-like designs

The modules below turn the claims a certificate makes about an AES-like candidate into
statements about WideTrail's definitions, each with a proof that the kernel can check from a
small concrete computation:

* `Diffusion.Minors4`: a `4 × 4` matrix is MDS (`IsMDS`) once its `69` canonical minors,
  evaluated by explicit formulas, are all nonzero.
* `Diffusion.Branch`: a nonzero vector `x` with `weight x + weight (M x) ≤ 4` refutes `IsMDS`.
* `Diffusion.Offsets`: the candidate's row-offset convention is WideTrail's `shiftRowsPerm`;
  distinct offsets are diffusion-optimal and a repeated offset is not.
* `Diffusion.Activity`: an MDS matrix and diffusion-optimal offsets give WideTrail's
  active-S-box bound for every trail of the candidate's specification.
-/
