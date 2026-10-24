
/-- Claim `offsets.dispersion`: the offsets are pairwise distinct, so row shifting sends the
four bytes of every column to four different columns (Definition 5 of Daemen and Rijmen,
WideTrail's `DiffusionOptimal`). -/
theorem offsets_optimal : DiffusionOptimal (gridCol 4 4) (shiftRowsPerm 4 4 candOffsets) :=
  diffusionOptimal_of_injective (by decide)
