
/-- The singularity witness for the internal matrix: a nonzero state that `candInternal` sends
to zero. -/
def witnessKernel : Fin 3 → Poseidon2.BN254.F :=
  bnVec3 {{KERNEL_VECTOR}}

#eval Audit.echoInput "witnessKernel" witnessKernel
