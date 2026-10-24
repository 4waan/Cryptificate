import WideTrail

/-!
# Active S-boxes for an AES-like candidate

WideTrail proves the active-S-box bound once, for any `WideTrailSpec`
(`WideTrailSpec.IsTrail.bound_rounds`): over `r` rounds a nonzero trail activates at least
`r / 4 · B² + (B if r mod 4 ≥ 2)` S-boxes, where `B` is the branch number of the column
mixing. `Algebra/AESMix.lean` instantiates it for the AES matrix. This file does the same for
an arbitrary matrix `M` and offset vector `off`, with the matrix and offset facts as
hypotheses, so a certificate only has to supply `IsMDS M` and diffusion optimality.

* `gridMix M` multiplies each column of a `rows × cols` state by `M`. For an MDS `M` it has
  branch number `rows + 1` column by column (`gridMix_isColBranchBound`, from
  `isMDS_branch_bound`) and is invertible (`gridMix_nondegenerate`, from `isMDS_injective`).
  These are the AES-specific `aesMixColumns_isColBranchBound` and
  `aesMixColumns_nondegenerate`, generalized to every matrix and every state width.
* `candidateSpec M off` is WideTrail's `gridSpec` on the `4 × 4` byte state with ShiftRows at
  `off` and column mixing by `M`, branch number `5`.
* `candidate_activity_bound` reads off the bound for every pattern sequence that satisfies
  `IsTrail` for that specification, which is the form an execution produces
  (`Cryptificate.Bridge`).

The `sbox` field of the specification is the identity. As in WideTrail's
`Differential/AESProb.lean`, it is a placeholder: `IsTrail` asks only that each step apply the
linear layer to some pattern with the support of the current one, and an injective S-box
supplies exactly that. The S-box layer of an actual execution enters through that support
condition, not through this field.
-/

set_option autoImplicit false

namespace Cryptificate

variable {K : Type*} [Field K]

/-- Column mixing by `M`: column `c` of the output is `M` applied to column `c` of the
input. -/
def gridMix {rows cols : ℕ} (M : Matrix (Fin rows) (Fin rows) K) (a : GridIdx rows cols → K) :
    GridIdx rows cols → K :=
  fun i => M.mulVec (fun r => a (r, i.2)) i.1

theorem gridMix_apply {rows cols : ℕ} (M : Matrix (Fin rows) (Fin rows) K)
    (a : GridIdx rows cols → K) (r : Fin rows) (c : Fin cols) :
    gridMix M a (r, c) = ∑ j, M r j * a (j, c) := rfl

/-- Column mixing is additive. -/
theorem gridMix_sub {rows cols : ℕ} (M : Matrix (Fin rows) (Fin rows) K)
    (a b : GridIdx rows cols → K) : gridMix M (a - b) = gridMix M a - gridMix M b := by
  funext i
  change M.mulVec ((fun r => a (r, i.2)) - (fun r => b (r, i.2))) i.1 = _
  rw [Matrix.mulVec_sub]
  rfl

variable [DecidableEq K]

/-- The local weight of a grid state in column `ξ` is the weight of that column. -/
theorem localWeight_gridCol_eq_weight {L : Type*} [Zero L] [DecidableEq L] {rows cols : ℕ}
    (ξ : Fin cols) (s : GridIdx rows cols → L) :
    localWeight (gridCol rows cols) ξ s = weight (fun r => s (r, ξ)) := by
  have himg : (activePattern s).filter (fun i => gridCol rows cols i = ξ)
      = (activePattern (fun r => s (r, ξ))).image (fun r => (r, ξ)) := by
    ext ⟨r, c⟩
    simp only [Finset.mem_filter, mem_activePattern, gridCol, Finset.mem_image]
    constructor
    · rintro ⟨hne, rfl⟩
      exact ⟨r, hne, rfl⟩
    · rintro ⟨r', hne, heq⟩
      obtain ⟨rfl, rfl⟩ := Prod.mk.injEq .. |>.mp heq
      exact ⟨hne, rfl⟩
  rw [localWeight, himg,
    Finset.card_image_of_injective _ (fun a b h => (Prod.mk.injEq .. |>.mp h).1)]
  rfl

/-- An MDS column mixing has branch number `rows + 1` in every column. -/
theorem gridMix_isColBranchBound {rows cols : ℕ} {M : Matrix (Fin rows) (Fin rows) K}
    (hM : IsMDS M) : IsColBranchBound (gridCol rows cols) (gridMix M) (rows + 1) := by
  intro a ξ hpos
  rw [localWeight_gridCol_eq_weight, localWeight_gridCol_eq_weight] at hpos ⊢
  exact isMDS_branch_bound hM (fun r => a (r, ξ)) hpos

/-- An MDS column mixing is invertible. -/
theorem gridMix_nondegenerate {rows cols : ℕ} {M : Matrix (Fin rows) (Fin rows) K}
    (hM : IsMDS M) : NonDegenerate (gridMix (cols := cols) M) := by
  intro a ha
  funext ⟨r, c⟩
  have hcol : (fun r' => a (r', c)) = 0 := by
    apply isMDS_injective hM
    rw [Matrix.mulVec_zero]
    funext r'
    exact congrFun ha (r', c)
  exact congrFun hcol r

/-- The wide-trail specification of an AES-like candidate: a `4 × 4` byte state, ShiftRows at
the offsets `off`, column mixing by the MDS matrix `M` (branch number `5`), and the identity
as a placeholder S-box layer (see the module docstring). -/
def candidateSpec (M : Matrix (Fin 4) (Fin 4) K) (off : Fin 4 → Fin 4) (hM : IsMDS M)
    (hoff : DiffusionOptimal (gridCol 4 4) (shiftRowsPerm 4 4 off)) :
    WideTrailSpec (GridIdx 4 4) (Fin 4) K :=
  gridSpec 4 4 off id (gridMix M) 5 (fun _ => rfl)
    ((diffusionOptimal_shiftRowsPerm_iff 4 4 off).mp hoff) (gridMix_isColBranchBound hM)
    (gridMix_nondegenerate hM)

/-- The linear layer of the candidate: shift rows by `off`, then mix each column by `M`. -/
theorem candidateSpec_lin_apply (M : Matrix (Fin 4) (Fin 4) K) (off : Fin 4 → Fin 4)
    (hM : IsMDS M) (hoff : DiffusionOptimal (gridCol 4 4) (shiftRowsPerm 4 4 off))
    (b : GridIdx 4 4 → K) (r c : Fin 4) :
    (candidateSpec M off hM hoff).lin b (r, c) = ∑ j, M r j * b (j, c + off j) := rfl

/-- The number of active S-boxes guaranteed over `r` rounds of an AES-like cipher with an
MDS `4 × 4` mixing and diffusion-optimal row shifting: `25` for every complete block of four
rounds, and `5` more when at least two rounds are left over. At `r = 4, 6, 10, 32` this is
`25, 30, 55, 200`. -/
def activityBound (r : ℕ) : ℕ := r / 4 * 25 + (if 2 ≤ r % 4 then 5 else 0)

example : activityBound 4 = 25 := rfl
example : activityBound 6 = 30 := rfl
example : activityBound 10 = 55 := rfl
example : activityBound 32 = 200 := rfl

/-- **The active-S-box bound for an AES-like candidate, on trails.** Every pattern sequence
that is a trail of the candidate's specification for `r` rounds and starts nonzero activates
at least `activityBound r` S-boxes in those `r` rounds. -/
theorem candidate_activity_bound {M : Matrix (Fin 4) (Fin 4) K} {off : Fin 4 → Fin 4}
    (hM : IsMDS M) (hoff : DiffusionOptimal (gridCol 4 4) (shiftRowsPerm 4 4 off))
    {T : ℕ → GridIdx 4 4 → K} {r : ℕ} (hT : (candidateSpec M off hM hoff).IsTrail T r)
    (h0 : T 0 ≠ 0) : activityBound r ≤ patternWeight T r :=
  hT.bound_rounds h0

/-- The same bound for the functional trail of any support-preserving S-box layer: the
statement WideTrail proves for AES (`aes_rounds`), at the candidate's matrix and offsets. -/
theorem candidate_trail_bound {M : Matrix (Fin 4) (Fin 4) K} {off : Fin 4 → Fin 4}
    (hM : IsMDS M) (hoff : DiffusionOptimal (gridCol 4 4) (shiftRowsPerm 4 4 off))
    (sbox : (GridIdx 4 4 → K) → (GridIdx 4 4 → K)) (hsbox : PreserveSupport sbox)
    {a : GridIdx 4 4 → K} (ha : a ≠ 0) (r : ℕ) :
    activityBound r ≤ (gridSpec 4 4 off sbox (gridMix M) 5 hsbox
      ((diffusionOptimal_shiftRowsPerm_iff 4 4 off).mp hoff) (gridMix_isColBranchBound hM)
      (gridMix_nondegenerate hM)).trailWeight a r :=
  (gridSpec 4 4 off sbox (gridMix M) 5 hsbox
    ((diffusionOptimal_shiftRowsPerm_iff 4 4 off).mp hoff) (gridMix_isColBranchBound hM)
    (gridMix_nondegenerate hM)).trailWeight_bound_rounds ha r

end Cryptificate
