import Cryptificate.Diffusion.Minors4

/-!
# Diffusion certificates for AES-like designs

The modules below turn the claims a certificate makes about an AES-like candidate into
statements about WideTrail's definitions, each with a proof that the kernel can check from a
small concrete computation:

* `Diffusion.Minors4`: a `4 × 4` matrix is MDS (`IsMDS`) once its `69` canonical minors,
  evaluated by explicit formulas, are all nonzero.
-/
