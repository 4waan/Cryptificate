
/-- Claim `sbox.bijective`, refuted: the distinct bytes `{{X1}}` and `{{X2}}` have the same
table entry. -/
theorem sbox_not_injective : ¬ Function.Injective candSboxTable :=
  not_injective_of_collision (gf {{X1}}) (gf {{X2}}) (by decide) (by decide)
