
/-- Claim `internal.invertible`, refuted: `witnessKernel` is a nonzero state that
`candInternal` sends to zero, so the determinant of `candInternal` is zero. -/
theorem internal_singular : candInternal.det = 0 :=
  Mat3.det_eq_zero_of_mulVec_eq_zero witnessKernel (by decide) (by decide)
