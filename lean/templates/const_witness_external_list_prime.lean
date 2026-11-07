
/-- The branch-number witness for the external matrix, as numerals: a nonzero state that,
together with its image under `candExternal`, has at most as many nonzero coordinates as the
width. -/
def witnessVectorEntries : List ℕ :=
  [{{VECTOR_ENTRIES}}]

/-- The same witness as a state over `ZMod candModulus`. -/
def witnessVector : Fin {{WIDTH}} → ZMod candModulus :=
  pfVec candModulus {{WIDTH}} witnessVectorEntries

#eval Audit.echoInput "witnessVector" witnessVector
