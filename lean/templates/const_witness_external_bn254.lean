
/-- The branch-number witness for the external matrix: a nonzero state that, together with its
image under `candExternal`, has fewer than `4` nonzero coordinates. -/
def witnessVector : Fin 3 → Poseidon2.BN254.F :=
  bnVec3 {{VECTOR}}

#eval Audit.echoInput "witnessVector" witnessVector
