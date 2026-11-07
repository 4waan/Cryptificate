
/-- Claim `external.invertible`: the determinant of `candExternal` over `ZMod candModulus` is
nonzero. The certificate is the inverse matrix `witnessExternalInverse`, checked as for
`internal_invertible` (`Packed.det_ne_zero_of_checkInverse`). This is invertibility only: it
does not say that the external matrix is MDS. -/
theorem external_invertible : candExternal.det ≠ 0 :=
  Packed.det_ne_zero_of_checkInverse (S := {{PACK_BITS}}) (Wr := witnessExternalInverse)
    (by decide +kernel)
