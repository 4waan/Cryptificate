
/-- Claim `sbox.linearity`: the largest absolute Walsh coefficient of `candSboxTable` over all
input masks and nonzero output masks is exactly `{{LIN}}`, attained at the input mask
`gf {{LIN_A}}` and the output mask `gf {{LIN_B}}`. The kernel tests every coefficient against
`{{LIN}}` (`latBounded`) and recounts the one at the witness (`walshAbsAt`); this is a property
of the table alone, not a bound on any linear trail or hull. -/
theorem sbox_linearity :
    linearity candSboxTable = {{LIN}} ∧ gf {{LIN_B}} ≠ 0 ∧
      (walsh candSboxTable (gf {{LIN_A}}) (gf {{LIN_B}})).natAbs = {{LIN}} :=
  linearity_tableSbox (by decide) (by decide) (by decide) (by decide +kernel)
    (by decide +kernel)
