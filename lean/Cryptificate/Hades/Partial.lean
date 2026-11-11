import Cryptificate.Hades.Design

/-!
# Partial rounds: bypassing subspaces and charged windows

A partial round of a HADES design applies the S-box only at the positions of `partialMask`.
Two states whose difference is zero at every masked position feed equal values to every S-box of
the round, so the difference passes the S-box layer unchanged and the round acts on it linearly:
it is multiplied by the internal matrix `M` (`round_sub_of_agree`). Along a stretch of partial
rounds in which no S-box is active, the difference after `j` rounds is therefore `M ^ j` times
the difference at the start (`run_sub_of_agree`).

Two certificates follow, one for each outcome.

## A bypass

If a nonzero `v` has `(M ^ j *ᵥ v) i = 0` for every masked `i` and every `j` below the number
of partial rounds, two states that differ by `v` when they enter the partial rounds feed equal
inputs to every S-box of every partial round, whatever the round constants (`bypass_of_powers`).
`Bypass` states exactly this about the design's own rounds. Two cheap sufficient conditions are
proved once:

* `powers_zero_of_invariant2`: `v` lies in a subspace spanned by at most two vectors that `M`
  maps into their own span and that vanish on the mask. The kernel then only checks `M b₁` and
  `M b₂` against explicit coefficients, however many partial rounds there are. For width three
  every bypass of more than two partial rounds has this form, because the largest `M`-invariant
  subspace inside the kernel of the mask projection has dimension at most two.
* `powers_zero_of_short`: at most two partial rounds, checked directly on `v` and `M v`.

## A charged window

`Observable M P L` says that no nonzero `d` keeps every masked coordinate of `d`, `M d`, …,
`M ^ (L - 1) d` at zero: the stacked rows of `M ^ j` at the masked positions, `j < L`, have full
column rank. For width three this is certified by three such rows with a nonzero `3 × 3`
determinant (`observable_of_rows3`), the rows being computed by `obsRow` from the matrix itself.
Then any two distinct states that enter a window of `L` consecutive partial rounds activate a
masked S-box in that window (`window_active`), and no nonzero difference bypasses the partial
rounds when `L ≤ RP` (`not_bypass_of_windowActive`).

## Whole-permutation activity

`partialActivity` counts the masked S-boxes with a nonzero input difference in the partial rounds,
for two executions of the permutation; together with `outerActivity` it counts every active
S-box of the permutation. Under the hypotheses of the full-round bound (an MDS external matrix,
an invertible internal matrix and a bijective S-box) two distinct inputs stay distinct at every
round, so the partial rounds split into `RP / L` disjoint windows that each charge at least one
S-box (`partialActivity_ge`), and

    outerBound + RP / L ≤ outerActivity x y + partialActivity x y

(`total_activity`). For the reference parameters `L = 3`, so the bound is `16 + 56 / 3 = 34`
(see `Hades.Reference`). This is a lower bound on the number of active S-boxes of two distinct
executions with the same round constants. It is not a statement about probabilities, about
algebraic attacks, or about the tightness of the bound.
-/

set_option autoImplicit false

open Matrix

namespace Cryptificate.Hades

variable {K : Type*} [Field K] {t : ℕ}

/-! ### Observability of the internal matrix at the masked positions -/

/-- No nonzero `d` keeps the masked coordinates of `d, M d, …, M ^ (L - 1) d` all at zero. -/
def Observable (M : Matrix (Fin t) (Fin t) K) (P : Finset (Fin t)) (L : ℕ) : Prop :=
  ∀ d : Fin t → K, (∀ j < L, ∀ i ∈ P, ((M ^ j).mulVec d) i = 0) → d = 0

/-- Row `i` of `M ^ j`, computed by `j` vector-matrix products from the unit row `i`, so that a
kernel evaluation never forms a matrix power. -/
def obsRow (M : Matrix (Fin t) (Fin t) K) (i : Fin t) : ℕ → (Fin t → K)
  | 0 => Pi.single i 1
  | j + 1 => vecMul (obsRow M i j) M

theorem obsRow_dotProduct (M : Matrix (Fin t) (Fin t) K) (i : Fin t) (j : ℕ) (d : Fin t → K) :
    obsRow M i j ⬝ᵥ d = ((M ^ j).mulVec d) i := by
  induction j generalizing d with
  | zero => simp [obsRow, single_dotProduct]
  | succ j ih =>
    rw [obsRow, ← dotProduct_mulVec, ih, pow_succ, ← mulVec_mulVec]

/-- **The observability certificate for width three.** Three rows of the powers `M ^ j`,
`j < L`, taken at masked positions, with a nonzero determinant: then `M` is observable from the
mask in `L` steps. -/
theorem observable_of_rows3 (M : Matrix (Fin 3) (Fin 3) K) (P : Finset (Fin 3)) (L : ℕ)
    (pw : Fin 3 → ℕ) (co : Fin 3 → Fin 3) (hpw : ∀ k, pw k < L) (hco : ∀ k, co k ∈ P)
    (hdet : det3 (fun k => obsRow M (co k) (pw k)) ≠ 0) : Observable M P L := by
  intro d hd
  set R : Matrix (Fin 3) (Fin 3) K := fun k => obsRow M (co k) (pw k) with hR
  have hRd : R.mulVec d = 0 := by
    funext k
    change obsRow M (co k) (pw k) ⬝ᵥ d = 0
    rw [obsRow_dotProduct]
    exact hd _ (hpw k) _ (hco k)
  have hdet' : R.det ≠ 0 := Mat3.det_ne_zero_of_det3 hdet
  by_contra hne
  exact hdet' (Mat3.det_eq_zero_of_mulVec_eq_zero d hne hRd)

/-! ### Sufficient conditions for a bypass -/

/-- **The invariant-subspace certificate.** If `M` maps `b₁` and `b₂` into their span and both
vanish on `P`, then every power of `M` keeps `b₁` at zero on `P`. Take `b₂ = 0` for a
one-dimensional subspace (an eigenvector). -/
theorem powers_zero_of_invariant2 (M : Matrix (Fin t) (Fin t) K) (P : Finset (Fin t))
    (b₁ b₂ : Fin t → K) (a₁₁ a₁₂ a₂₁ a₂₂ : K)
    (h₁ : M.mulVec b₁ = a₁₁ • b₁ + a₁₂ • b₂) (h₂ : M.mulVec b₂ = a₂₁ • b₁ + a₂₂ • b₂)
    (hz₁ : ∀ i ∈ P, b₁ i = 0) (hz₂ : ∀ i ∈ P, b₂ i = 0) :
    ∀ j, ∀ i ∈ P, ((M ^ j).mulVec b₁) i = 0 := by
  have hspan : ∀ j, ∃ α β : K, (M ^ j).mulVec b₁ = α • b₁ + β • b₂ := by
    intro j
    induction j with
    | zero => exact ⟨1, 0, by simp⟩
    | succ j ih =>
      obtain ⟨α, β, h⟩ := ih
      refine ⟨α * a₁₁ + β * a₂₁, α * a₁₂ + β * a₂₂, ?_⟩
      rw [pow_succ', ← mulVec_mulVec, h, mulVec_add, mulVec_smul, mulVec_smul, h₁, h₂]
      funext i
      simp only [Pi.add_apply, Pi.smul_apply, smul_eq_mul]
      ring
  intro j i hi
  obtain ⟨α, β, h⟩ := hspan j
  rw [h]
  simp [hz₁ i hi, hz₂ i hi]

/-- **The short certificate.** For at most two steps it suffices to look at `v` and `M v`. -/
theorem powers_zero_of_short (M : Matrix (Fin t) (Fin t) K) (P : Finset (Fin t))
    (v : Fin t → K) (L : ℕ) (hL : L ≤ 2) (h₀ : 0 < L → ∀ i ∈ P, v i = 0)
    (h₁ : 1 < L → ∀ i ∈ P, (M.mulVec v) i = 0) :
    ∀ j < L, ∀ i ∈ P, ((M ^ j).mulVec v) i = 0 := by
  intro j hj i hi
  rcases j with _ | _ | j
  · simpa using h₀ hj i hi
  · simpa using h₁ hj i hi
  · omega

namespace Design

variable (D : Design K t)

/-! ### Running a stretch of rounds -/

/-- Rounds `start, start + 1, …` of the design, run from the state `z`: after `k` steps, the
state that enters round `start + k`. -/
def run (partialMask : Finset (Fin t)) (c : ℕ → Fin t → K) (start : ℕ) (z : Fin t → K) :
    ℕ → (Fin t → K)
  | 0 => z
  | k + 1 => D.round partialMask c (start + k) (run partialMask c start z k)

/-- The execution from the start is the execution up to round `n`, followed by a run from
round `n`. -/
theorem execute_add (partialMask : Finset (Fin t)) (c : ℕ → Fin t → K) (x : Fin t → K)
    (n k : ℕ) :
    D.execute partialMask c x (n + k) = D.run partialMask c n (D.execute partialMask c x n) k := by
  induction k with
  | zero => rfl
  | succ k ih =>
    change D.round partialMask c (n + k) (D.execute partialMask c x (n + k)) = _
    rw [ih]
    rfl

omit [Field K] in
theorem mask_partial (partialMask : Finset (Fin t)) {n : ℕ} (h₁ : D.half ≤ n)
    (h₂ : n < D.half + D.partialRounds) : D.mask partialMask n = partialMask := by
  simp [mask, Hades.hadesMask, show ¬n < D.half by omega, h₂]

omit [Field K] in
theorem linear_partial {n : ℕ} (h₁ : D.half ≤ n) (h₂ : n < D.half + D.partialRounds) :
    D.linear n = D.internal := by
  unfold linear
  rw [if_neg (by omega)]

/-- **A partial round with no active S-box is linear on the difference.** If two states agree
at every masked position, then the partial round maps their difference by the internal
matrix. -/
theorem round_sub_of_agree (partialMask : Finset (Fin t)) (c : ℕ → Fin t → K) {n : ℕ}
    (h₁ : D.half ≤ n) (h₂ : n < D.half + D.partialRounds) {x y : Fin t → K}
    (h : ∀ i ∈ partialMask, x i = y i) :
    D.round partialMask c n x - D.round partialMask c n y = D.internal.mulVec (x - y) := by
  unfold round
  rw [D.linear_partial h₁ h₂, D.mask_partial partialMask h₁ h₂, ← mulVec_sub]
  congr 1
  funext i
  simp only [Pi.sub_apply, Hades.maskedBricklayer_apply, Pi.add_apply]
  split_ifs with hi
  · simp [h i hi]
  · ring

/-- **The inactivity lemma.** If, during the first `L` steps of a run inside the partial rounds,
the two states agree at every masked position, then after `j ≤ L` steps their difference is
`M ^ j` times the starting difference. -/
theorem run_sub_of_agree (partialMask : Finset (Fin t)) (c : ℕ → Fin t → K) {start L : ℕ}
    (h₁ : D.half ≤ start) (h₂ : start + L ≤ D.half + D.partialRounds) {z z' : Fin t → K}
    (h : ∀ j < L, ∀ i ∈ partialMask,
      D.run partialMask c start z j i = D.run partialMask c start z' j i) :
    ∀ j ≤ L, D.run partialMask c start z j - D.run partialMask c start z' j =
      (D.internal ^ j).mulVec (z - z') := by
  intro j hj
  induction j with
  | zero => simp [run]
  | succ j ih =>
    change D.round partialMask c (start + j) _ - D.round partialMask c (start + j) _ = _
    rw [D.round_sub_of_agree partialMask c (by omega) (by omega) (h j (by omega)),
      ih (by omega), pow_succ', ← mulVec_mulVec]

/-! ### Bypasses -/

/-- **A bypass of the partial rounds.** For every choice of round constants and every state `z`
entering the first partial round, the runs from `z` and from `z + v` feed equal inputs to every
masked S-box in each of the partial rounds: no S-box of the partial rounds is active. -/
def Bypass (partialMask : Finset (Fin t)) (v : Fin t → K) : Prop :=
  ∀ (c : ℕ → Fin t → K) (z : Fin t → K), ∀ j < D.partialRounds, ∀ i ∈ partialMask,
    D.run partialMask c D.half z j i = D.run partialMask c D.half (z + v) j i

theorem run_sub_of_powers (partialMask : Finset (Fin t)) (c : ℕ → Fin t → K) (v : Fin t → K)
    (h : ∀ j < D.partialRounds, ∀ i ∈ partialMask, ((D.internal ^ j).mulVec v) i = 0)
    (z : Fin t → K) :
    ∀ j ≤ D.partialRounds, D.run partialMask c D.half (z + v) j -
      D.run partialMask c D.half z j = (D.internal ^ j).mulVec v := by
  intro j hj
  induction j with
  | zero => simp [run]
  | succ j ih =>
    have ih := ih (by omega)
    have hag : ∀ i ∈ partialMask,
        D.run partialMask c D.half (z + v) j i = D.run partialMask c D.half z j i := by
      intro i hi
      have := congrFun ih i
      rw [Pi.sub_apply, h j (by omega) i hi] at this
      exact sub_eq_zero.mp this
    change D.round partialMask c (D.half + j) _ - D.round partialMask c (D.half + j) _ = _
    rw [D.round_sub_of_agree partialMask c (by omega) (by omega) hag, ih, pow_succ',
      ← mulVec_mulVec]

/-- A difference that every power of the internal matrix below the number of partial rounds
keeps at zero on the mask is a bypass. -/
theorem bypass_of_powers (partialMask : Finset (Fin t)) (v : Fin t → K)
    (h : ∀ j < D.partialRounds, ∀ i ∈ partialMask, ((D.internal ^ j).mulVec v) i = 0) :
    D.Bypass partialMask v := by
  intro c z j hj i hi
  have := congrFun (D.run_sub_of_powers partialMask c v h z j hj.le) i
  rw [Pi.sub_apply, h j hj i hi] at this
  exact (sub_eq_zero.mp this).symm

/-! ### Charged windows -/

/-- **Every window of `L` consecutive partial rounds is charged.** For every choice of round
constants, every window of `L` partial rounds starting at partial round `s`, and every two
distinct states entering it, some masked S-box in the window receives different inputs. -/
def WindowActive (partialMask : Finset (Fin t)) (L : ℕ) : Prop :=
  ∀ (c : ℕ → Fin t → K) (s : ℕ), s + L ≤ D.partialRounds →
    ∀ z z' : Fin t → K, z ≠ z' →
      ∃ j < L, ∃ i ∈ partialMask,
        D.run partialMask c (D.half + s) z j i ≠ D.run partialMask c (D.half + s) z' j i

/-- **Observability charges every window.** If the internal matrix is observable from the mask
in `L` steps, every window of `L` consecutive partial rounds is charged. -/
theorem windowActive_of_observable {partialMask : Finset (Fin t)} {L : ℕ}
    (hobs : Observable D.internal partialMask L) : D.WindowActive partialMask L := by
  intro c s hs z z' hz
  by_contra hne
  push Not at hne
  apply hz
  have hd := D.run_sub_of_agree partialMask c (start := D.half + s) (L := L) (by omega)
    (by omega) hne
  have h0 : z - z' = 0 := hobs _ (fun j hj i hi => by
    have := congrFun (hd j hj.le) i
    rw [Pi.sub_apply, hne j hj i hi, sub_self] at this
    exact this.symm)
  exact sub_eq_zero.mp h0

/-- A charged window of length at most the number of partial rounds rules out every bypass. -/
theorem not_bypass_of_windowActive {partialMask : Finset (Fin t)} {L : ℕ}
    (hL : L ≤ D.partialRounds) (hW : D.WindowActive partialMask L) {v : Fin t → K}
    (hv : v ≠ 0) : ¬ D.Bypass partialMask v := by
  intro hB
  have hz : (0 : Fin t → K) ≠ 0 + v := by simpa [eq_comm] using hv
  obtain ⟨j, hj, i, hi, hne⟩ := hW (fun _ _ => 0) 0 (by omega) 0 (0 + v) hz
  exact hne (by simpa using hB (fun _ _ => 0) 0 j (by omega) i hi)

/-! ### Activity of the whole permutation -/

variable [DecidableEq K]

/-- The S-boxes of the partial rounds whose input difference is nonzero, for the inputs `x`
and `y`: masked positions only, in each of the `RP` partial rounds. With `outerActivity` this
counts every active S-box of the permutation. -/
def partialActivity (partialMask : Finset (Fin t)) (c : ℕ → Fin t → K) (x y : Fin t → K) : ℕ :=
  ∑ j ∈ Finset.range D.partialRounds,
    Hades.sboxWeight partialMask (D.difference partialMask c x y (D.half + j))

/-- `q` disjoint blocks of length `L` that each sum to at least one sum to at least `q`. -/
theorem le_sum_blocks (f : ℕ → ℕ) (L q : ℕ)
    (h : ∀ b < q, 1 ≤ ∑ k ∈ Finset.range L, f (b * L + k)) :
    q ≤ ∑ j ∈ Finset.range (q * L), f j := by
  induction q with
  | zero => simp
  | succ q ih =>
    rw [Nat.succ_mul, Finset.sum_range_add]
    have := ih (fun b hb => h b (by omega))
    have := h q (by omega)
    omega

omit [DecidableEq K] in
/-- With both matrices invertible and a bijective S-box, two distinct inputs give distinct
states at every round. -/
theorem execute_ne (hE : D.external.det ≠ 0) (hI : D.internal.det ≠ 0)
    (hS : Function.Bijective (fun v : K => v ^ D.exponent)) (partialMask : Finset (Fin t))
    (c : ℕ → Fin t → K) {x y : Fin t → K} (hxy : x ≠ y) (n : ℕ) :
    D.execute partialMask c (D.external.mulVec x) n ≠
      D.execute partialMask c (D.external.mulVec y) n := by
  intro h
  rw [← D.execute_eq hE hI hS, ← D.execute_eq hE hI hS] at h
  have h' := Hades.execute_injective _ n h
  exact hxy ((linearEquivOfDet D.external hE).injective (by simpa using h'))

/-- **Charged partial windows.** Under the hypotheses of the full-round bound, if every window
of `L` partial rounds is charged, two distinct inputs activate at least `RP / L` S-boxes in the
partial rounds. -/
theorem partialActivity_ge (hE : D.external.det ≠ 0) (hI : D.internal.det ≠ 0)
    (hS : Function.Bijective (fun v : K => v ^ D.exponent)) {partialMask : Finset (Fin t)}
    {L : ℕ} (hW : D.WindowActive partialMask L) (c : ℕ → Fin t → K) {x y : Fin t → K}
    (hxy : x ≠ y) : D.partialRounds / L ≤ D.partialActivity partialMask c x y := by
  set f : ℕ → ℕ := fun j =>
    Hades.sboxWeight partialMask (D.difference partialMask c x y (D.half + j)) with hf
  have hblock : ∀ b < D.partialRounds / L, 1 ≤ ∑ k ∈ Finset.range L, f (b * L + k) := by
    intro b hb
    have hs : b * L + L ≤ D.partialRounds := by
      have := Nat.div_mul_le_self D.partialRounds L
      have : (b + 1) * L ≤ D.partialRounds / L * L := Nat.mul_le_mul_right L hb
      rw [Nat.succ_mul] at this
      omega
    obtain ⟨j, hj, i, hi, hne⟩ := hW c (b * L) hs _ _
      (D.execute_ne hE hI hS partialMask c hxy (D.half + b * L))
    rw [← D.execute_add, ← D.execute_add] at hne
    have hpos : 1 ≤ f (b * L + j) := by
      change 0 < (partialMask ∩ activePattern _).card
      refine Finset.card_pos.mpr ⟨i, Finset.mem_inter.mpr ⟨hi, ?_⟩⟩
      rw [mem_activePattern]
      intro h0
      apply hne
      rw [difference, Pi.sub_apply, ← Nat.add_assoc] at h0
      exact sub_eq_zero.mp h0
    calc 1 ≤ f (b * L + j) := hpos
      _ ≤ ∑ k ∈ Finset.range L, f (b * L + k) :=
        Finset.single_le_sum (f := fun k => f (b * L + k)) (fun _ _ => Nat.zero_le _)
          (Finset.mem_range.mpr hj)
  calc D.partialRounds / L ≤ ∑ j ∈ Finset.range (D.partialRounds / L * L), f j :=
        le_sum_blocks f L _ hblock
    _ ≤ ∑ j ∈ Finset.range D.partialRounds, f j :=
        Finset.sum_le_sum_of_subset (Finset.range_subset_range.mpr (Nat.div_mul_le_self _ _))
    _ = D.partialActivity partialMask c x y := rfl

/-- **Activity of the whole permutation.** If the external matrix is MDS, the internal matrix has
nonzero determinant, `x ↦ x ^ e` is a bijection and every window of `L` partial rounds is
charged for the mask `partialMask`, then two distinct inputs activate at least
`outerBound + RP / L` S-boxes: the full-round bound plus one per disjoint window. -/
theorem total_activity (hM : IsMDS D.external) (hI : D.internal.det ≠ 0)
    (hS : Function.Bijective (fun v : K => v ^ D.exponent)) {partialMask : Finset (Fin t)}
    {L : ℕ} (hW : D.WindowActive partialMask L) (c : ℕ → Fin t → K) {x y : Fin t → K}
    (hxy : x ≠ y) :
    D.outerBound + D.partialRounds / L ≤
      D.outerActivity partialMask c x y + D.partialActivity partialMask c x y :=
  Nat.add_le_add (D.outer_activity hM hI hS partialMask c hxy)
    (D.partialActivity_ge (Mat3.det_ne_zero_of_isMDS hM) hI hS hW c hxy)

end Design

end Cryptificate.Hades
