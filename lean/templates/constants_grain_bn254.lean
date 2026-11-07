
/-- Claim `constants.grain`: the submitted round constants are exactly the ones the Poseidon2
reference procedure generates for the BN254 scalar field (`n = 254` bits), width `3`,
`candFullRounds` full and `candPartialRounds` partial rounds: the Grain LFSR seeded from these
parameters, 160 discarded clocks, the self-shrinking generator and rejection of candidates `≥ p`,
in the Poseidon2 layout (one constant per partial round, followed by zeros). The kernel runs the
procedure (`Grain.poseidon2Constants`) and compares the result with `candConstants`. This is a
statement about where the constants come from, not about their quality. -/
theorem constants_grain :
    Grain.poseidon2Constants Poseidon2.BN254.modulus 3 candFullRounds candPartialRounds =
      some candConstants := by
  decide +kernel
