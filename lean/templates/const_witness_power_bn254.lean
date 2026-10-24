
/-- The collision witness for the power S-box: an element other than `1` whose
`candExponent`-th power is `1`, so that it and `1` have the same image. -/
def witnessRoot : Poseidon2.BN254.F :=
  bn {{OMEGA}}

#eval Audit.echoInput "witnessRoot" witnessRoot
