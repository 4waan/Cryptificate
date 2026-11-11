
/-- Claim `sbox.differential` for the AES S-box: its differential uniformity is exactly `4`,
attained at the input difference `01` and the output difference `1F`, from
`aes_sbox_differentialUniformity`, which the library checks once on the FIPS 197 table. -/
theorem sbox_differential :
    differentialUniformity candSboxTable = 4 ∧ gf 1 ≠ 0 ∧
      diffCount candSboxTable (gf 1) (gf 31) = 4 :=
  aes_sbox_differentialUniformity
