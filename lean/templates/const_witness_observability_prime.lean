
/-- The rows of the observability certificate, as indices into the stacked rows `eᵢ Mʲ` of
`Packed.obsStackP` (power `j` major, masked position `i` minor). -/
def witnessObsRows : List ℕ :=
  [{{OBS_SELECT}}]

/-- An inverse of those rows over `ZMod candModulus`, column by column, each column from its last
entry to its first (`Packed.revCols`). -/
def witnessObsInverse : List ℕ :=
  [{{OBS_INVERSE_ENTRIES}}]
