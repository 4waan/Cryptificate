
/-- The branch-number witness: a nonzero column that, together with its image under
`candMatrix`, has fewer than `5` nonzero bytes. -/
def witnessVector : Fin 4 → GF256 :=
  gfVec4 {{VECTOR}}

#eval Audit.echoInput "witnessVector" witnessVector
