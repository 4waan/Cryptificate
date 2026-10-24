
/-- The submitted circuit over the BN254 scalar field, width three. -/
def candProgram : Circuit.Program Poseidon2.BN254.F 3 :=
  bnProgram3 [{{INSTRS}}] {{OUTPUTS}}

#eval Audit.echoInput "candProgram" candProgram
