import Cryptificate.Diffusion.Minors4
import Cryptificate.Diffusion.Branch
import Cryptificate.Diffusion.Offsets
import Cryptificate.Diffusion.Activity
import Cryptificate.Bridge
import Cryptificate.Sbox
import Cryptificate.Diffusion.Echo

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
* `Bridge`: an AES-like execution on the 16-byte state; two executions under the same round
  keys with an injective S-box produce such a trail, so the bound holds for executions.
* `Sbox`: byte S-boxes given as tables; an inverse table certifies bijectivity and a
  collision refutes injectivity. WideTrail's AES S-box is checked against the table of
  FIPS 197.
* `Diffusion.Echo`: the request encoding of an S-box, for the certificate's input echo.
-/
