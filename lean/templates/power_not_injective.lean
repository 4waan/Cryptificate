
/-- Claim `sbox.bijective`, refuted: `witnessRoot ≠ 1` and `witnessRoot ^ candExponent = 1`,
which the kernel computes by square-and-multiply, so `1` and `witnessRoot` have the same image
under `x ↦ x ^ candExponent`. -/
theorem power_not_injective :
    ¬ Function.Injective (fun x : Poseidon2.BN254.F => x ^ candExponent) :=
  PrimePower.pow_not_injective_of_root candExponent witnessRoot (by decide) (by decide)
