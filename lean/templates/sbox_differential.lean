
/-- Claim `sbox.differential`: the differential uniformity of `candSboxTable` is exactly
`{{DU}}`, attained at the input difference `{{DU_A}}` and the output difference `{{DU_B}}`. The
kernel tests every row `a ≠ 0` of the difference table of the packed table against `{{DU}}`
(`ddtRowsBounded`) and recounts the entry at the witness (`ddtCountAt`); this is a property of
the table alone, not a bound on any trail. -/
theorem sbox_differential :
    differentialUniformity candSboxTable = {{DU}} ∧ gf {{DU_A}} ≠ 0 ∧
      diffCount candSboxTable (gf {{DU_A}}) (gf {{DU_B}}) = {{DU}} :=
  differentialUniformity_tableSbox (by decide) (by decide) (by decide) (by decide)
    (by decide +kernel) (by decide +kernel)
