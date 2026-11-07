
/-- Claim `internal.invertible`: the determinant of `candInternal` over `ZMod candModulus` is
nonzero. The certificate is the inverse matrix `witnessInternalInverse`: the kernel checks
`candInternal * witnessInternalInverse = 1` entry by entry (`Packed.checkInverse`), each entry one
product of packed numbers in base `2 ^ {{PACK_BITS}}`, and a matrix with a right inverse has a
nonzero determinant (`Packed.det_ne_zero_of_checkInverse`). -/
theorem internal_invertible : candInternal.det ≠ 0 :=
  Packed.det_ne_zero_of_checkInverse (S := {{PACK_BITS}}) (Wr := witnessInternalInverse)
    (by decide +kernel)
