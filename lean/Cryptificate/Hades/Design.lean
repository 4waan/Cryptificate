import Cryptificate.Diffusion.Minors3

/-!
# HADES designs as submitted, and their full-round activity

A HADES design (the round structure of Poseidon and Poseidon2) is submitted as plain data: an
external matrix for the full rounds, an internal matrix for the partial rounds, an exponent `e`
for the S-box `x ↦ x ^ e`, a number `RF` of full rounds split evenly before and after a number
`RP` of partial rounds. `Design` holds exactly that, and `Design.execute` runs it directly from
the data. Nothing in these definitions presumes that the matrices are invertible or that the
S-box is a permutation, so a statement about `Design.execute` is a statement about the design
the user wrote down, whatever its quality.

## Execution model

Rounds are numbered from `0`. With `h = RF / 2`, rounds `0 … h - 1` and
`h + RP … h + RP + h - 1` are full rounds, which apply the S-box to every coordinate and mix with
the external matrix; the `RP` rounds in between apply it only on `partialMask` and mix with the
internal matrix. Round `n` computes

    x ↦ L_n (S_n (x + c n))

with the round constants `c n` added first, `S_n` the masked S-box layer and `L_n` the round's
matrix: the operation order of WideTrail's `Hades.RoundSpec.apply`. As in Poseidon2 (and
WideTrail's `Poseidon2.BN254.permutation`), the permutation applies the external matrix once
before the first round. The round constants are an arbitrary function `c : ℕ → Fin t → K`, so
the reference Poseidon2 constants and any explicit table are both instances; only the first
`2 h + RP` values are read. An odd `RF` contributes `2 h` full rounds; requests have even `RF`.

## What is charged

`outerActivity` counts, for two inputs `x` and `y`, the S-boxes of the full rounds whose input
difference is nonzero: the `weight` of the difference of the two round inputs, summed over the
`2 h` full rounds. The round constants cancel in this difference. Partial rounds are not charged
at all, so the count is a lower bound on the active S-boxes of the whole permutation and makes no
claim about the partial rounds, about algebraic attacks or about any probability.

## The bound

`outer_activity` is WideTrail's full-round argument (`Hades.fullWindow_bound`, the two halves of
`Hades.outerRound_bound`) applied to this execution. Its hypotheses are the three facts that
the certificates establish separately: the external matrix is MDS (branch number `t + 1`), the
internal matrix has nonzero determinant, and `x ↦ x ^ e` is a bijection. Under them the
execution coincides with a WideTrail schedule built from the corresponding equivalences
(`execute_eq`), and for `x ≠ y`

    (h / 2 + h / 2) * (t + 1) + h % 2 + h % 2 ≤ outerActivity x y.

Each adjacent pair of full rounds inside one block charges the branch number of its mixing
layer, and an odd round left over charges one, because distinct executions stay distinct. No
pair crosses the partial rounds, which is why the bound needs nothing about the internal matrix
beyond invertibility. For the reference width `t = 3` and `RF = 8` the bound is `16`, the figure
of WideTrail's `Poseidon2.BN254.activity` (see `Hades.Reference`).
-/

set_option autoImplicit false

open Matrix

namespace Cryptificate.Hades

/-- A HADES design of width `t` over the field `K`, as submitted. -/
structure Design (K : Type*) (t : ℕ) where
  /-- The matrix of the full rounds, also applied once before the first round. -/
  external : Matrix (Fin t) (Fin t) K
  /-- The matrix of the partial rounds. -/
  internal : Matrix (Fin t) (Fin t) K
  /-- The S-box is `x ↦ x ^ exponent`. -/
  exponent : ℕ
  /-- Full rounds in total, half before and half after the partial rounds. -/
  fullRounds : ℕ
  /-- Partial rounds. -/
  partialRounds : ℕ

namespace Design

variable {K : Type*} [Field K] {t : ℕ} (D : Design K t)

/-- Full rounds on each side of the partial rounds. -/
def half : ℕ := D.fullRounds / 2

/-- The matrix of round `n`: the external matrix in the full rounds, the internal matrix in the
partial rounds. -/
def linear (n : ℕ) : Matrix (Fin t) (Fin t) K :=
  if n < D.half ∨ D.half + D.partialRounds ≤ n then D.external else D.internal

/-- The S-box positions of round `n`: every coordinate in a full round, `partialMask` in a
partial round (WideTrail's `Hades.hadesMask`). -/
def mask (partialMask : Finset (Fin t)) (n : ℕ) : Finset (Fin t) :=
  Hades.hadesMask D.half D.partialRounds D.half partialMask n

/-- Round `n`: add the round constant, apply `x ↦ x ^ e` on the round's mask, multiply by the
round's matrix. -/
def round (partialMask : Finset (Fin t)) (c : ℕ → Fin t → K) (n : ℕ) (x : Fin t → K) :
    Fin t → K :=
  (D.linear n).mulVec
    (Hades.maskedBricklayer (D.mask partialMask n) (fun _ v => v ^ D.exponent) (x + c n))

/-- The state after the first `n` rounds, starting from `x`. -/
def execute (partialMask : Finset (Fin t)) (c : ℕ → Fin t → K) (x : Fin t → K) :
    ℕ → (Fin t → K)
  | 0 => x
  | n + 1 => D.round partialMask c n (execute partialMask c x n)

/-- The permutation: the external matrix, then all `2 h + RP` rounds. -/
def permutation (partialMask : Finset (Fin t)) (c : ℕ → Fin t → K) (x : Fin t → K) :
    Fin t → K :=
  D.execute partialMask c (D.external.mulVec x) (D.half + D.partialRounds + D.half)

/-- The difference of the inputs to round `n` when the permutation runs on `x` and on `y`. -/
def difference (partialMask : Finset (Fin t)) (c : ℕ → Fin t → K) (x y : Fin t → K) (n : ℕ) :
    Fin t → K :=
  D.execute partialMask c (D.external.mulVec x) n - D.execute partialMask c (D.external.mulVec y) n

variable [DecidableEq K]

/-- The S-boxes of the full rounds whose input difference is nonzero, for the inputs `x` and
`y`: the `h` rounds before the partial rounds and the `h` rounds after them. Partial rounds are
not counted. -/
def outerActivity (partialMask : Finset (Fin t)) (c : ℕ → Fin t → K) (x y : Fin t → K) : ℕ :=
  (∑ j ∈ Finset.range D.half, weight (D.difference partialMask c x y j))
    + ∑ j ∈ Finset.range D.half,
        weight (D.difference partialMask c x y (D.half + D.partialRounds + j))

/-- WideTrail's full-round bound for this design: `B = t + 1` per pair of adjacent full rounds
within each block of `h` rounds, and one for an odd round left over in each block. -/
def outerBound : ℕ := (D.half / 2 + D.half / 2) * (t + 1) + D.half % 2 + D.half % 2

/-! ### The certified schedule -/

omit [DecidableEq K] in
/-- The linear equivalence of a matrix with nonzero determinant. -/
noncomputable def linearEquivOfDet (M : Matrix (Fin t) (Fin t) K) (h : M.det ≠ 0) :
    (Fin t → K) ≃ₗ[K] (Fin t → K) :=
  M.toLinearEquiv' (M.invertibleOfIsUnitDet (isUnit_iff_ne_zero.mpr h))

omit [DecidableEq K] in
@[simp] theorem linearEquivOfDet_apply (M : Matrix (Fin t) (Fin t) K) (h : M.det ≠ 0)
    (a : Fin t → K) : linearEquivOfDet M h a = M.mulVec a := by
  simp [linearEquivOfDet, ← Matrix.toLin'_apply]
  rfl

omit [DecidableEq K] in
/-- The round matrices as linear equivalences, given both determinants. -/
noncomputable def linearEquiv (hE : D.external.det ≠ 0) (hI : D.internal.det ≠ 0) (n : ℕ) :
    (Fin t → K) ≃ₗ[K] (Fin t → K) :=
  if n < D.half ∨ D.half + D.partialRounds ≤ n then linearEquivOfDet D.external hE
  else linearEquivOfDet D.internal hI

omit [DecidableEq K] in
theorem linearEquiv_apply (hE : D.external.det ≠ 0) (hI : D.internal.det ≠ 0) (n : ℕ)
    (a : Fin t → K) : D.linearEquiv hE hI n a = (D.linear n).mulVec a := by
  unfold linearEquiv linear
  split_ifs <;> simp

omit [DecidableEq K] in
/-- The design as a WideTrail schedule. It exists once the matrices are invertible and the
S-box is a bijection; `execute_eq` shows that it computes what `execute` computes. -/
noncomputable def schedule (hE : D.external.det ≠ 0) (hI : D.internal.det ≠ 0)
    (hS : Function.Bijective (fun v : K => v ^ D.exponent)) (partialMask : Finset (Fin t))
    (c : ℕ → Fin t → K) : ℕ → Hades.RoundSpec (Fin t) K :=
  Hades.hadesSchedule D.half D.partialRounds D.half partialMask
    (fun _ _ => Equiv.ofBijective _ hS) (D.linearEquiv hE hI) c

omit [DecidableEq K] in
/-- The certified schedule computes the design's own execution. -/
theorem execute_eq (hE : D.external.det ≠ 0) (hI : D.internal.det ≠ 0)
    (hS : Function.Bijective (fun v : K => v ^ D.exponent)) (partialMask : Finset (Fin t))
    (c : ℕ → Fin t → K) (x : Fin t → K) (n : ℕ) :
    Hades.execute (D.schedule hE hI hS partialMask c) x n = D.execute partialMask c x n := by
  induction n with
  | zero => rfl
  | succ n ih =>
    rw [Hades.execute_succ, ih]
    change D.linearEquiv hE hI n _ = _
    rw [linearEquiv_apply]
    rfl

omit [DecidableEq K] in
/-- With both matrices invertible and a bijective S-box, the permutation is a bijection. -/
theorem permutation_bijective (hE : D.external.det ≠ 0) (hI : D.internal.det ≠ 0)
    (hS : Function.Bijective (fun v : K => v ^ D.exponent)) (partialMask : Finset (Fin t))
    (c : ℕ → Fin t → K) : Function.Bijective (D.permutation partialMask c) := by
  have heq : D.permutation partialMask c =
      (fun x => Hades.execute (D.schedule hE hI hS partialMask c) x
        (D.half + D.partialRounds + D.half)) ∘ (linearEquivOfDet D.external hE) := by
    funext x
    simp [permutation, execute_eq]
  rw [heq]
  exact (Hades.execute_bijective _ _).comp (linearEquivOfDet D.external hE).bijective

/-! ### The full-round bound -/

/-- A block of full rounds of the certified schedule charges exactly the `weight` of each round
input difference, which is what `outerActivity` sums. -/
theorem scheduledWeight_eq (hE : D.external.det ≠ 0) (hI : D.internal.det ≠ 0)
    (hS : Function.Bijective (fun v : K => v ^ D.exponent)) (partialMask : Finset (Fin t))
    (c : ℕ → Fin t → K) (x y : Fin t → K) (start len : ℕ)
    (hfull : ∀ j < len, (D.schedule hE hI hS partialMask c (start + j)).mask = Finset.univ) :
    Hades.scheduledWeight (D.schedule hE hI hS partialMask c)
        (Hades.differenceTrace (D.schedule hE hI hS partialMask c)
          (D.external.mulVec x) (D.external.mulVec y)) start len =
      ∑ j ∈ Finset.range len, weight (D.difference partialMask c x y (start + j)) := by
  unfold Hades.scheduledWeight
  apply Finset.sum_congr rfl
  intro j hj
  rw [hfull j (Finset.mem_range.mp hj), Hades.sboxWeight_full]
  simp only [Hades.differenceTrace, execute_eq, difference]

/-- **Full-round activity of a HADES design.** If the external matrix is MDS, the internal
matrix has nonzero determinant and `x ↦ x ^ e` is a bijection, then for every partial-round
mask, every choice of round constants and every two distinct inputs, the full rounds contain at
least `outerBound` S-boxes with a nonzero input difference. -/
theorem outer_activity (hM : IsMDS D.external) (hI : D.internal.det ≠ 0)
    (hS : Function.Bijective (fun v : K => v ^ D.exponent)) (partialMask : Finset (Fin t))
    (c : ℕ → Fin t → K) {x y : Fin t → K} (hxy : x ≠ y) :
    D.outerBound ≤ D.outerActivity partialMask c x y := by
  have hE : D.external.det ≠ 0 := Mat3.det_ne_zero_of_isMDS hM
  set R := D.schedule hE hI hS partialMask c with hR
  have hxy' : D.external.mulVec x ≠ D.external.mulVec y :=
    fun h => hxy (isMDS_injective hM h)
  have hlin : ∀ n, n < D.half ∨ D.half + D.partialRounds ≤ n →
      isBranchBound id (R n).lin (t + 1) := by
    intro n hn
    refine Hades.branch_of_mds hM (R n).lin (fun a => ?_)
    change D.linearEquiv hE hI n a = _
    rw [linearEquiv_apply, linear, if_pos hn]
  have hpre : ∀ j < D.half, (R (0 + j)).mask = Finset.univ := fun j hj =>
    Hades.hadesMask_prefix _ _ _ _ (by omega)
  have hsuf : ∀ j < D.half, (R (D.half + D.partialRounds + j)).mask = Finset.univ :=
    fun j hj => Hades.hadesMask_suffix _ _ _ _ hj
  have hp := Hades.fullWindow_bound R hxy' 0 D.half (t + 1) hpre
    (fun j _ => hlin (0 + j) (Or.inl (by omega)))
  have hs := Hades.fullWindow_bound R hxy' (D.half + D.partialRounds) D.half (t + 1) hsuf
    (fun j _ => hlin _ (Or.inr (by omega)))
  rw [scheduledWeight_eq D hE hI hS partialMask c x y 0 D.half hpre] at hp
  rw [scheduledWeight_eq D hE hI hS partialMask c x y _ D.half hsuf] at hs
  simp only [zero_add] at hp
  unfold outerActivity outerBound
  rw [Nat.add_mul]
  omega

end Design

end Cryptificate.Hades
