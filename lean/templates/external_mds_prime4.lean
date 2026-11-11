
/-- Claim `external.mds`: every square submatrix of `candExternal` is nonsingular, so its branch
number is `5`. The kernel evaluates the `69` canonical minors by explicit formulas over
`ZMod candModulus`, and `isMDS_of_minors4Ok`, proved once for every `4 × 4` matrix over every
field, turns that into WideTrail's `IsMDS`. -/
theorem external_mds : IsMDS candExternal :=
  isMDS_of_minors4Ok candExternal (by decide)
