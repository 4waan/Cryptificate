
/-- The branch-number witness for the external matrix: a nonzero state that, together with its
image under `candExternal`, has fewer nonzero coordinates than the width plus one. -/
def witnessVector : Fin {{WIDTH}} → ZMod candModulus :=
  pfVec candModulus {{WIDTH}} [{{VECTOR_ENTRIES}}]

#eval Audit.echoInput "witnessVector" witnessVector
