
/-- Claim `internal.invertible`: the determinant of `candInternal`, which the kernel evaluates
over `ZMod candModulus` by the six-term formula of `Matrix.det_fin_three`, is nonzero. -/
theorem internal_invertible : candInternal.det ≠ 0 :=
  Mat3.det_ne_zero_of_det3 (by decide)
