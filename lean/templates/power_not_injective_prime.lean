
/-- Claim `sbox.bijective`, refuted: `witnessRoot ≠ 1` and `witnessRoot ^ candExponent = 1`,
which the kernel computes over `ZMod candModulus` by square-and-multiply, so `1` and `witnessRoot`
have the same image under `x ↦ x ^ candExponent`. The statement is about
`PrimePower.ZModP.powMap candModulus candExponent`, so it names the field. -/
theorem power_not_injective :
    ¬ Function.Injective (PrimePower.ZModP.powMap candModulus candExponent) :=
  PrimePower.ZModP.powMap_not_injective_of_root candModulus candExponent witnessRoot
    (by decide) (by decide)
