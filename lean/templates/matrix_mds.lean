
/-- Claim `matrix.mds`: every square submatrix of `candMatrix` is nonsingular, so its branch
number is `5`. The kernel evaluates the `69` canonical minors by explicit formulas
(`minors4Ok`), and `isMDS_of_minors4Ok`, proved once for every matrix, turns that into
WideTrail's `IsMDS`. -/
theorem matrix_mds : IsMDS candMatrix :=
  isMDS_of_minors4Ok candMatrix (by decide +kernel)
