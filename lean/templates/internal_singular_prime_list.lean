
/-- Claim `internal.invertible`, refuted: `witnessKernel` is a nonzero state that `candInternal`
sends to zero, so the determinant of `candInternal` is zero. The kernel checks both facts on the
numerals, modulo `candModulus` (`NatMatrix.checkNonzero`, `NatMatrix.checkKernel`). -/
theorem internal_singular : candInternal.det = 0 :=
  Mat3.det_eq_zero_of_mulVec_eq_zero witnessKernel
    (NatMatrix.pfVec_ne_zero_of_check (by decide +kernel))
    (NatMatrix.mulVec_eq_zero_of_check (by decide +kernel))
