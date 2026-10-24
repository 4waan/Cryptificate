
/-- Claim `offsets.dispersion`, refuted: rows `{{ROW_I}}` and `{{ROW_J}}` have the same
offset, so the bytes of one column in those two rows end up in the same column. -/
theorem offsets_not_optimal :
    ¬ DiffusionOptimal (gridCol 4 4) (shiftRowsPerm 4 4 candOffsets) :=
  not_diffusionOptimal_of_offset_collision ({{ROW_I}} : Fin 4) {{ROW_J}} (by decide) (by decide)
