
/-- A second vector that spans, with `witnessBypass`, a subspace that `candInternal` maps into
itself and that is zero on every masked position; it is the zero vector when that subspace is a
line through `witnessBypass`. -/
def witnessBypassSpan : Fin 3 → Poseidon2.BN254.F :=
  bnVec3 {{BYPASS_SPAN}}

/-- The coefficients of `candInternal` on that subspace:
`candInternal *ᵥ witnessBypass = a₁₁ • witnessBypass + a₁₂ • witnessBypassSpan` and
`candInternal *ᵥ witnessBypassSpan = a₂₁ • witnessBypass + a₂₂ • witnessBypassSpan`, in the order
`a₁₁ a₁₂ a₂₁ a₂₂`. -/
def witnessBypassCoeffs : Fin 4 → Poseidon2.BN254.F :=
  ![bn {{BYPASS_A11}}, bn {{BYPASS_A12}}, bn {{BYPASS_A21}}, bn {{BYPASS_A22}}]
