
/-- The bypass witness: a nonzero difference whose images under the powers of `candInternal`
stay at zero on every masked position, so that it never reaches a partial-round S-box. -/
def witnessBypass : Fin 3 → Poseidon2.BN254.F :=
  bnVec3 {{BYPASS_VECTOR}}

#eval Audit.echoInput "witnessBypass" witnessBypass
