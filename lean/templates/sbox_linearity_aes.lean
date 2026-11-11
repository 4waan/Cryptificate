
/-- Claim `sbox.linearity` for the AES S-box: its largest absolute Walsh coefficient at a
nonzero output mask is exactly `32` (nonlinearity `112`), attained at the input mask `01` and
the output mask `48`, from `aes_sbox_linearity`, which the library checks once on the FIPS 197
table. -/
theorem sbox_linearity :
    linearity candSboxTable = 32 ∧ gf 72 ≠ 0 ∧
      (walsh candSboxTable (gf 1) (gf 72)).natAbs = 32 :=
  aes_sbox_linearity
