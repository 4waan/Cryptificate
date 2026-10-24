
/-- The submitted circuit over `GF(2⁸)`, width four. -/
def candProgram : Circuit.Program GF256 4 :=
  gfProgram4 [{{INSTRS}}] {{OUTPUTS}}

#eval Audit.echoInput "candProgram" candProgram
