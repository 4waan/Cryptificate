
/-- Claim `constants.grain` for the profile's reference constants: WideTrail's pinned BN254
constants (`Poseidon2.BN254.roundConstants`, read row by row as `Grain.bn254ReferenceFlat`) are
exactly the ones the Poseidon2 reference procedure generates for width `3`, `candFullRounds = 8`
full and `candPartialRounds = 56` partial rounds. The library proves this once by kernel
evaluation (`Grain.bn254_reference`); the certificate reuses it. -/
theorem constants_grain :
    Grain.poseidon2Constants Poseidon2.BN254.modulus 3 candFullRounds candPartialRounds =
      some Grain.bn254ReferenceFlat :=
  Grain.bn254_reference
