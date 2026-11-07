
/-- Claim `external.m4_mds`, refuted: `candExternal` is `circ(2 M₄, M₄, …, M₄)` for the
`4 × 4` matrix `externalM4` (`Hades.poseidon2External`, one comparison of packed numbers), and
`externalM4` is not MDS: `witnessM4Vector` is nonzero, and it and its image under `externalM4`
have at most `4` nonzero coordinates between them, while an MDS matrix forces `5`
(`isMDS_branch_bound`). -/
theorem external_m4_not_mds :
    candExternal = Hades.poseidon2External {{WIDTH}} externalM4 ∧ ¬IsMDS externalM4 :=
  ⟨Hades.pfMat_eq_poseidon2External_of_checkP (S := {{PACK_BITS}}) (by decide +kernel),
    not_isMDS_of_witness witnessM4Vector (by decide) (by decide)⟩
