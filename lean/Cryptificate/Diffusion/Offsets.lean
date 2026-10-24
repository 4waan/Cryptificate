import WideTrail

/-!
# Row offsets and diffusion optimality

A candidate states its row shifting as four offsets, with the convention

    out[r][c] = in[r][(c + offset[r]) mod 4],

that is, row `r` is rotated left by `offset[r]`. AES uses the offsets `0, 1, 2, 3`.

WideTrail models the same layer as a permutation of positions, `shiftRowsPerm rows cols off`,
sending `(r, c)` to `(r, c + off r)`, applied through `transpose p a i = a (p i)`. So the
transposed state at `(r, c)` is the input at `(r, c + off r)`, and `Fin` addition is addition
modulo the number of columns: this is exactly the convention above, with no change of
direction (`transpose_shiftRowsPerm_apply`). A candidate's offsets therefore enter
WideTrail unchanged, as `offsets4 o0 o1 o2 o3 : Fin 4 → Fin 4`.

Definition 5 of Daemen and Rijmen (`DiffusionOptimal`) asks that the bytes of any one column
land in four different columns. WideTrail proves that for row shifting this is exactly
injectivity of the offset vector (`diffusionOptimal_shiftRowsPerm_iff`), so:

* distinct offsets are certified by deciding injectivity of a map `Fin 4 → Fin 4`;
* a repeated offset is refuted by naming the two rows that share it
  (`not_diffusionOptimal_of_offset_collision`): those two rows of one column end up in the
  same column.
-/

set_option autoImplicit false

namespace Cryptificate

/-- The transposed state at `(r, c)` is the input at `(r, c + off r)`: WideTrail's ShiftRows
rotates row `r` left by `off r`, as the candidate format specifies. -/
theorem transpose_shiftRowsPerm_apply {K : Type*} {rows cols : ℕ} [NeZero cols]
    (off : Fin rows → Fin cols) (a : GridIdx rows cols → K) (r : Fin rows) (c : Fin cols) :
    transpose (shiftRowsPerm rows cols off) a (r, c) = a (r, c + off r) := rfl

/-- Distinct offsets make row shifting diffusion-optimal. -/
theorem diffusionOptimal_of_injective {rows cols : ℕ} [NeZero cols]
    {off : Fin rows → Fin cols} (h : Function.Injective off) :
    DiffusionOptimal (gridCol rows cols) (shiftRowsPerm rows cols off) :=
  (diffusionOptimal_shiftRowsPerm_iff rows cols off).mpr h

/-- **Two rows with the same offset refute diffusion optimality.** -/
theorem not_diffusionOptimal_of_offset_collision {rows cols : ℕ} [NeZero cols]
    {off : Fin rows → Fin cols} (i j : Fin rows) (hij : i ≠ j) (h : off i = off j) :
    ¬ DiffusionOptimal (gridCol rows cols) (shiftRowsPerm rows cols off) :=
  fun hd => hij ((diffusionOptimal_shiftRowsPerm_iff rows cols off).mp hd h)

end Cryptificate
