
/-- A basis of a subspace that `candInternal` maps into itself and that is zero on every masked
position, listed vector after vector; its first vector is the bypass witness. -/
def witnessBypassBasis : Fin {{BYPASS_DIM}} → Fin {{WIDTH}} → ZMod candModulus :=
  pfVecs candModulus {{BYPASS_DIM}} {{WIDTH}} [{{BYPASS_BASIS_ENTRIES}}]

/-- The coefficients of `candInternal` on that basis, row `k` for basis vector `k`:
`candInternal *ᵥ witnessBypassBasis k = ∑ l, witnessBypassCoeffs k l • witnessBypassBasis l`. -/
def witnessBypassCoeffs : Fin {{BYPASS_DIM}} → Fin {{BYPASS_DIM}} → ZMod candModulus :=
  pfVecs candModulus {{BYPASS_DIM}} {{BYPASS_DIM}} [{{BYPASS_COEFF_ENTRIES}}]

/-- The bypass witness: the first basis vector, a nonzero difference whose images under every
power of `candInternal` stay at zero on every masked position. -/
def witnessBypass : Fin {{WIDTH}} → ZMod candModulus :=
  witnessBypassBasis 0

#eval Audit.echoInput "witnessBypass" witnessBypass
