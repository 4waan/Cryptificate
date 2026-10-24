
/-- Claim `sbox.bijective`: `x ↦ x ^ candExponent` permutes the BN254 scalar field. The
certificate is the inverse exponent `d = {{INV_EXPONENT}}` with
`candExponent * d = (p - 1) * {{K}} + 1`, an identity between natural numbers that the kernel
checks; by Fermat's little theorem `x ↦ x ^ d` is then the inverse map. -/
theorem power_bijective : Function.Bijective (fun x : Poseidon2.BN254.F => x ^ candExponent) :=
  PrimePower.BN254.pow_bijective candExponent {{INV_EXPONENT}} {{K}}
    (by decide) (by decide) (by decide)
