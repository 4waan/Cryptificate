
/-- An inverse witness for `candInternal`, computed by the engine and checked below: the
inverse matrix over `ZMod candModulus`, listed column by column, each column from its last entry
to its first (`Packed.revCols`), so that one multiplication of packed numbers gives one entry of
`candInternal * witnessInternalInverse`. -/
def witnessInternalInverse : List ℕ :=
  [{{INTERNAL_INVERSE_ENTRIES}}]
