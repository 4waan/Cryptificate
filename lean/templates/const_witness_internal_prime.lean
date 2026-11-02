
/-- The singularity witness for the internal matrix: a nonzero state that `candInternal` sends
to zero. -/
def witnessKernel : Fin {{WIDTH}} → ZMod candModulus :=
  pfVec candModulus {{WIDTH}} [{{KERNEL_ENTRIES}}]

#eval Audit.echoInput "witnessKernel" witnessKernel
