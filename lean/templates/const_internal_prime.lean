
/-- The candidate's internal matrix over `ZMod candModulus`, row-major as submitted. HADES mixes
with it in every partial round. -/
def candInternal : Matrix (Fin {{WIDTH}}) (Fin {{WIDTH}}) (ZMod candModulus) :=
  pfMat candModulus {{WIDTH}} [{{INTERNAL_ENTRIES}}]

#eval Audit.echoInput "candInternal" candInternal
