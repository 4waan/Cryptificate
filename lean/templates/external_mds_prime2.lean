
/-- Claim `external.mds`: every square submatrix of `candExternal` is nonsingular, so its branch
number is `3`. The kernel evaluates the `5` canonical minors (the entries and the determinant) by
explicit formulas over `ZMod candModulus`, and `Mat2.isMDS_of_minorsOk`, proved once for every
`2 × 2` matrix over every field, turns that into WideTrail's `IsMDS`. -/
theorem external_mds : IsMDS candExternal :=
  Mat2.isMDS_of_minorsOk candExternal (by decide)
