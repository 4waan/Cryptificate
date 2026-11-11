
/-- Claim `external.mds`, refuted: `witnessVector` is nonzero, and it and its image under
`candExternal` have at most as many nonzero coordinates between them as the width, while an MDS
matrix forces one more (`isMDS_branch_bound`). -/
theorem external_not_mds : ¬ IsMDS candExternal :=
  not_isMDS_of_witness witnessVector (by decide) (by decide)
