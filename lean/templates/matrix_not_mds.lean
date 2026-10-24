
/-- Claim `matrix.mds`, refuted: `witnessVector` is nonzero, and it and its image under
`candMatrix` have at most `4` nonzero bytes between them, while an MDS matrix forces `5`
(`isMDS_branch_bound`). -/
theorem matrix_not_mds : ¬ IsMDS candMatrix :=
  not_isMDS_of_witness witnessVector (by decide) (by decide)
