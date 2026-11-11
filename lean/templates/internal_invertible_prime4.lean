
/-- Claim `internal.invertible`: the determinant of `candInternal`, which the kernel evaluates
over `ZMod candModulus` by cofactor expansion along the first row (`det4`), is nonzero. -/
theorem internal_invertible : candInternal.det ≠ 0 :=
  det_ne_zero_of_det4 (by decide)
