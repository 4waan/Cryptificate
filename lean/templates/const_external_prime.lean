
/-- The candidate's external matrix over `ZMod candModulus`, row-major as submitted. HADES mixes
with it in every full round and, as Poseidon2 does, once before the first round. -/
def candExternal : Matrix (Fin {{WIDTH}}) (Fin {{WIDTH}}) (ZMod candModulus) :=
  pfMat candModulus {{WIDTH}} [{{EXTERNAL_ENTRIES}}]

#eval Audit.echoInput "candExternal" candExternal
