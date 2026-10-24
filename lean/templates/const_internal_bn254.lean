
/-- The candidate's internal matrix over the BN254 scalar field, row-major as submitted. HADES
mixes with it in every partial round. -/
def candInternal : Matrix (Fin 3) (Fin 3) Poseidon2.BN254.F :=
  bnMat3 {{INTERNAL}}

#eval Audit.echoInput "candInternal" candInternal
