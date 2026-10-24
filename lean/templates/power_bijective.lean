
/-- Claim `sbox.bijective`: `x ↦ x ^ candExponent` permutes the BN254 scalar field. The
certificate is an inverse exponent `d` and a multiplier `k` with
`candExponent * d = (p - 1) * k + 1`, given below in that order: an identity between natural
numbers that the kernel checks. By Fermat's little theorem `x ↦ x ^ d` is then the inverse
map. -/
theorem power_bijective : Function.Bijective (fun x : Poseidon2.BN254.F => x ^ candExponent) :=
  PrimePower.BN254.pow_bijective candExponent
    {{INV_EXPONENT}}
    {{K}} (by decide) (by decide) (by decide)
