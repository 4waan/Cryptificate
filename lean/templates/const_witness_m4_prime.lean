
/-- The branch-number witness for `externalM4`: a nonzero vector that, together with its image
under `externalM4`, has at most `4` nonzero coordinates. -/
def witnessM4Vector : Fin 4 → ZMod candModulus :=
  pfVec candModulus 4 [{{M4_VECTOR_ENTRIES}}]

#eval Audit.echoInput "witnessM4Vector" witnessM4Vector
