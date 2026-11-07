
/-- The `4 × 4` block `M₄` of the external matrix, row-major: the block on rows 0–3 and
columns 4–7 of `candExternal` (its first off-diagonal block), as the engine read it. Claim
`external.m4_mds` proves that `candExternal` is `circ(2 M₄, M₄, …, M₄)` for this matrix. -/
def externalM4 : Matrix (Fin 4) (Fin 4) (ZMod candModulus) :=
  pfMat candModulus 4 [{{M4_ENTRIES}}]

#eval Audit.echoInput "externalM4" externalM4
