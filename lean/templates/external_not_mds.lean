
/-- Claim `external.mds`, refuted: `witnessVector` is nonzero, and it and its image under
`candExternal` have at most `3` nonzero coordinates between them, while an MDS matrix of width
three forces `4` (`isMDS_branch_bound`). -/
theorem external_not_mds : ¬ IsMDS candExternal :=
  not_isMDS_of_witness witnessVector (by decide) (by decide)
