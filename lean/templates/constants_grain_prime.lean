
/-- Claim `constants.grain`: the submitted round constants are exactly the ones the Poseidon2
reference procedure generates for modulus `candModulus` (field size its bit length), width
`{{WIDTH}}`, `candFullRounds` full and `candPartialRounds` partial rounds: the Grain LFSR seeded
from these parameters, 160 discarded clocks, the self-shrinking generator and rejection of
candidates `≥ candModulus`, in the Poseidon2 layout (one constant per partial round, followed by
zeros). The kernel runs the procedure (`Grain.poseidon2Constants`) and compares the result with
`candConstants`. This is a statement about where the constants come from, not about their
quality, and it does not use the primality of the modulus. -/
theorem constants_grain :
    Grain.poseidon2Constants candModulus {{WIDTH}} candFullRounds candPartialRounds =
      some candConstants := by
  decide +kernel
