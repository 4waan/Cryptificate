
/-- The singularity witness for the external matrix: a nonzero state that `candExternal` sends
to zero. -/
def witnessExternalKernel : Fin {{WIDTH}} → ZMod candModulus :=
  pfVec candModulus {{WIDTH}} [{{EXTERNAL_KERNEL_ENTRIES}}]

#eval Audit.echoInput "witnessExternalKernel" witnessExternalKernel
