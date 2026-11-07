
/-- Claim `external.invertible`, refuted: `witnessExternalKernel` is a nonzero state that
`candExternal` sends to zero, so the determinant of `candExternal` is zero. -/
theorem external_singular : candExternal.det = 0 :=
  Mat3.det_eq_zero_of_mulVec_eq_zero witnessExternalKernel
    (NatMatrix.pfVec_ne_zero_of_check (by decide +kernel))
    (NatMatrix.mulVec_eq_zero_of_check (by decide +kernel))
