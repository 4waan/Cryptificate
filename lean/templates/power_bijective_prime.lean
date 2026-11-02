
/-- Claim `sbox.bijective`: `x ↦ x ^ candExponent` permutes `ZMod candModulus`. The certificate is
an inverse exponent `d` and a multiplier `k` with `candExponent * d = (p - 1) * k + 1`, given
below in that order: an identity between natural numbers that the kernel checks. By Fermat's
little theorem in `ZMod p` (`PrimePower.ZModP.pow_bijective`) `x ↦ x ^ d` is then the inverse
map. -/
theorem power_bijective : Function.Bijective (fun x : ZMod candModulus => x ^ candExponent) :=
  PrimePower.ZModP.pow_bijective candModulus candExponent
    {{INV_EXPONENT}}
    {{K}} (by decide) (by decide) (by decide)
