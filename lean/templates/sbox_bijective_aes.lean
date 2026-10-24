
/-- Claim `sbox.bijective` for the AES S-box, from WideTrail's explicit inverse
`AES.sboxInv`; no table is evaluated. -/
theorem sbox_bijective : Function.Bijective candSboxTable :=
  aes_sbox_bijective
