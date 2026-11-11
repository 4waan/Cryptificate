
/-- The bypass witness for a design with fewer partial rounds than its width: a nonzero
difference whose images under `candInternal ^ j`, for every `j` below the number of partial
rounds, are zero on every masked position. -/
def witnessBypass : Fin {{WIDTH}} → ZMod candModulus :=
  pfVec candModulus {{WIDTH}} [{{BYPASS_ENTRIES}}]

#eval Audit.echoInput "witnessBypass" witnessBypass
