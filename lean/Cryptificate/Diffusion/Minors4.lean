import WideTrail

/-!
# Canonical minors of a `4 × 4` matrix

`IsMDS M` (WideTrail, `Algebra/MDS.lean`) asks that every square submatrix of `M` be
nonsingular, where a submatrix is chosen by a `Finset` of rows and a `Finset` of columns, each
read in increasing order. A `4 × 4` matrix has `69` nonempty submatrices of that kind: `16` of
order one, `36` of order two, `16` of order three and the matrix itself. This file turns the
definition into one Boolean check, `minors4Ok`, which evaluates each of the `69` determinants
by an explicit polynomial in the entries, and proves once, for every field and every matrix,
that a passing check implies `IsMDS`. A certificate for a concrete matrix is then a single
kernel evaluation:

    isMDS_of_minors4Ok M (by decide)

`Algebra/AESMix.lean` records two obstacles, and they shape the design. `Matrix.det`, a sum
over `Equiv.Perm`, does not reduce under `decide` once the order is three or more, and
`Finset.orderIsoOfFin` does not reduce either. Nothing here asks the kernel to evaluate them:

* Each minor is written out as a polynomial (`minor2`, `minor3`, `det4`). The link to
  `Matrix.det` is proved symbolically, once: `det_fin_two` and `det_fin_three` from Mathlib,
  and `det_eq_det4` here, by Laplace expansion along the first row.
* The selections `IsMDS` quantifies over are recognised without computing `orderIsoOfFin`.
  The selection it produces is strictly increasing, and a strictly increasing map
  `Fin k → Fin 4` is one of a short explicit list: a pair from `pairs4` when `k = 2`,
  `Fin.succAbove m` (omit the index `m`) when `k = 3`, and the identity when `k = 4`. The
  first two facts are decided once, over all `4 ^ k` maps; the last is Mathlib's
  `StrictMono.eq_id`.

`AESMix.lean` proves the AES instance through arbitrary injective selections: it factors each
one as a canonical embedding followed by a permutation, and absorbs the permutation with
`Matrix.det_permute`, which changes the determinant only by a sign. `IsMDS` already fixes the
canonical embedding, so the check does not need that step. `isMDS_iff_forall_injective` carries
the same factorization out for every order and every matrix size, which shows that the
`Finset` form of the definition loses nothing against arbitrary injective selections, and
`forall_injective_of_minors4Ok` restates the certificate in that form.
-/

set_option autoImplicit false

open Matrix

namespace Cryptificate

variable {K : Type*} [Field K]

/-! ### Explicit minor formulas -/

/-- The determinant of a `3 × 3` array, by the six-term formula of `Matrix.det_fin_three`. -/
def det3 (A : Fin 3 → Fin 3 → K) : K :=
  A 0 0 * A 1 1 * A 2 2 - A 0 0 * A 1 2 * A 2 1
    - A 0 1 * A 1 0 * A 2 2 + A 0 1 * A 1 2 * A 2 0
    + A 0 2 * A 1 0 * A 2 1 - A 0 2 * A 1 1 * A 2 0

/-- The four indices of `Fin 4`, in increasing order. -/
def fin4 : List (Fin 4) := [0, 1, 2, 3]

/-- The six strictly increasing pairs of indices of `Fin 4`. A pair `(a, b)` names the rows
(or columns) `a < b` of an order-two submatrix. -/
def pairs4 : List (Fin 4 × Fin 4) := [(0, 1), (0, 2), (0, 3), (1, 2), (1, 3), (2, 3)]

/-- The selection `Fin 2 → Fin 4` that reads the pair `p` in order. -/
def pairSel (p : Fin 4 × Fin 4) : Fin 2 → Fin 4 := ![p.1, p.2]

/-- The order-two minor on the rows `r` and the columns `c`. -/
def minor2 (M : Matrix (Fin 4) (Fin 4) K) (r c : Fin 4 × Fin 4) : K :=
  M r.1 c.1 * M r.2 c.2 - M r.1 c.2 * M r.2 c.1

/-- The order-three minor that omits row `m` and column `m'`. -/
def minor3 (M : Matrix (Fin 4) (Fin 4) K) (m m' : Fin 4) : K :=
  det3 (fun i j => M (m.succAbove i) (m'.succAbove j))

/-- The determinant of a `4 × 4` matrix, expanded along row `0` into the four order-three
minors that omit that row. -/
def det4 (M : Matrix (Fin 4) (Fin 4) K) : K :=
  M 0 0 * minor3 M 0 0 - M 0 1 * minor3 M 0 1 + M 0 2 * minor3 M 0 2 - M 0 3 * minor3 M 0 3

theorem det_submatrix_pairSel (M : Matrix (Fin 4) (Fin 4) K) (r c : Fin 4 × Fin 4) :
    (M.submatrix (pairSel r) (pairSel c)).det = minor2 M r c := by
  rw [det_fin_two]
  rfl

theorem det_submatrix_succAbove (M : Matrix (Fin 4) (Fin 4) K) (m m' : Fin 4) :
    (M.submatrix m.succAbove m'.succAbove).det = minor3 M m m' := by
  rw [det_fin_three]
  rfl

/-- The explicit order-four formula agrees with `Matrix.det`. Proved once, symbolically, so
that no certificate ever evaluates `Matrix.det` itself. -/
theorem det_eq_det4 (M : Matrix (Fin 4) (Fin 4) K) : M.det = det4 M := by
  rw [det_succ_row_zero, Fin.sum_univ_four, ← Fin.succAbove_zero, det_submatrix_succAbove,
    det_submatrix_succAbove, det_submatrix_succAbove, det_submatrix_succAbove]
  simp only [det4, Fin.val_zero, Fin.val_one, Fin.val_two, pow_zero, pow_one, one_mul,
    neg_mul, Fin.isValue]
  norm_num
  ring

/-! ### Strictly increasing selections, decided once -/

theorem mem_fin4 : ∀ i : Fin 4, i ∈ fin4 := by decide

/-- A strictly increasing `Fin 2 → Fin 4` is one of the six pairs. -/
theorem strictMono_two :
    ∀ f : Fin 2 → Fin 4, (∀ a b, a < b → f a < f b) → ∃ p ∈ pairs4, f = pairSel p := by
  decide

/-- A strictly increasing `Fin 3 → Fin 4` omits exactly one index `m`, so it is
`Fin.succAbove m`. -/
theorem strictMono_three :
    ∀ f : Fin 3 → Fin 4, (∀ a b, a < b → f a < f b) → ∃ m : Fin 4, f = m.succAbove := by
  decide

/-! ### The check -/

variable [DecidableEq K]

/-- All `16` entries are nonzero. -/
def minors1Ok (M : Matrix (Fin 4) (Fin 4) K) : Bool :=
  fin4.all fun i => fin4.all fun j => decide (M i j ≠ 0)

/-- All `36` order-two minors are nonzero. -/
def minors2Ok (M : Matrix (Fin 4) (Fin 4) K) : Bool :=
  pairs4.all fun r => pairs4.all fun c => decide (minor2 M r c ≠ 0)

/-- All `16` order-three minors are nonzero. -/
def minors3Ok (M : Matrix (Fin 4) (Fin 4) K) : Bool :=
  fin4.all fun m => fin4.all fun m' => decide (minor3 M m m' ≠ 0)

/-- The canonical-minor certificate: all `69` nonempty square minors are nonzero, each
evaluated by an explicit formula. -/
def minors4Ok (M : Matrix (Fin 4) (Fin 4) K) : Bool :=
  minors1Ok M && minors2Ok M && minors3Ok M && decide (det4 M ≠ 0)

/-- Every submatrix chosen by strictly increasing rows and columns is nonsingular, once the
check passes. The order `k` is at most `4` because a strictly increasing map is injective;
each order is then matched against the explicit list of selections of that order. -/
theorem det_submatrix_ne_zero_of_minors4Ok {M : Matrix (Fin 4) (Fin 4) K}
    (h : minors4Ok M = true) {k : ℕ} (r c : Fin k → Fin 4) (hr : StrictMono r)
    (hc : StrictMono c) : (M.submatrix r c).det ≠ 0 := by
  simp only [minors4Ok, minors1Ok, minors2Ok, minors3Ok, Bool.and_eq_true, List.all_eq_true,
    decide_eq_true_eq] at h
  obtain ⟨⟨⟨h1, h2⟩, h3⟩, h4⟩ := h
  have hk : k ≤ 4 := by simpa using Fintype.card_le_of_injective r hr.injective
  interval_cases k
  · rw [det_fin_zero]
    exact one_ne_zero
  · rw [det_fin_one]
    exact h1 (r 0) (mem_fin4 _) (c 0) (mem_fin4 _)
  · obtain ⟨p, hp, rfl⟩ := strictMono_two r (fun a b hab => hr hab)
    obtain ⟨q, hq, rfl⟩ := strictMono_two c (fun a b hab => hc hab)
    rw [det_submatrix_pairSel]
    exact h2 p hp q hq
  · obtain ⟨m, rfl⟩ := strictMono_three r (fun a b hab => hr hab)
    obtain ⟨m', rfl⟩ := strictMono_three c (fun a b hab => hc hab)
    rw [det_submatrix_succAbove]
    exact h3 m (mem_fin4 _) m' (mem_fin4 _)
  · obtain rfl := hr.eq_id
    obtain rfl := hc.eq_id
    rw [submatrix_id_id, det_eq_det4]
    exact h4

/-- **The canonical-minor certificate is sound.** If `minors4Ok M` evaluates to `true`, then
`M` is MDS in the sense of WideTrail's `IsMDS`, and so has branch number `5`
(`isMDS_branch_bound`). -/
theorem isMDS_of_minors4Ok (M : Matrix (Fin 4) (Fin 4) K) (h : minors4Ok M = true) :
    IsMDS M := by
  intro k Row Col hRow hCol
  exact det_submatrix_ne_zero_of_minors4Ok h _ _ (Row.orderEmbOfFin hRow).strictMono
    (Col.orderEmbOfFin hCol).strictMono

/-! ### Arbitrary injective selections

The same statement for selections that are injective but not necessarily increasing. Each
such selection is the increasing enumeration of its image followed by a permutation, and a
permutation of rows or columns multiplies the determinant by `±1`. This is the argument of
`AESMix.lean`, carried out once for every order and every matrix size rather than decided
for one order of one matrix. -/

omit [DecidableEq K] in
/-- An injective `r : Fin k → Fin n` is the increasing enumeration of its image, composed with
a permutation of `Fin k`. -/
theorem exists_perm_orderEmbOfFin {n k : ℕ} (r : Fin k → Fin n) (hr : Function.Injective r) :
    ∃ (h : (Finset.univ.image r).card = k) (σ : Equiv.Perm (Fin k)),
      r = (Finset.univ.image r).orderEmbOfFin h ∘ σ := by
  have h : (Finset.univ.image r).card = k := by
    rw [Finset.card_image_of_injective _ hr, Finset.card_univ, Fintype.card_fin]
  let e := (Finset.univ.image r).orderIsoOfFin h
  let f : Fin k → Fin k := fun i =>
    e.symm ⟨r i, Finset.mem_image_of_mem r (Finset.mem_univ i)⟩
  have hef : ∀ i, ((e (f i) : _) : Fin n) = r i := fun i => by simp [f]
  have hf : Function.Injective f := by
    intro i j hij
    apply hr
    rw [← hef i, ← hef j, hij]
  refine ⟨h, Equiv.ofBijective f (Finite.injective_iff_bijective.mp hf), ?_⟩
  funext i
  exact (hef i).symm

omit [DecidableEq K] in
/-- `±1` is never zero in a field. -/
theorem sign_cast_ne_zero' {k : ℕ} (σ : Equiv.Perm (Fin k)) :
    ((Equiv.Perm.sign σ : ℤ) : K) ≠ 0 := by
  rcases Int.units_eq_one_or (Equiv.Perm.sign σ) with h | h <;> simp [h]

omit [DecidableEq K] in
/-- Permuting the rows and the columns of a square submatrix keeps it nonsingular. -/
theorem det_submatrix_comp_perm_ne_zero {n k : ℕ} (M : Matrix (Fin n) (Fin n) K)
    (e e' : Fin k → Fin n) (σ τ : Equiv.Perm (Fin k)) (h : (M.submatrix e e').det ≠ 0) :
    (M.submatrix (e ∘ σ) (e' ∘ τ)).det ≠ 0 := by
  have heq : M.submatrix (e ∘ σ) (e' ∘ τ)
      = ((M.submatrix e e').submatrix σ id).submatrix id τ := by
    rw [Matrix.submatrix_submatrix, Matrix.submatrix_submatrix]
    rfl
  rw [heq, det_permute', det_permute]
  exact mul_ne_zero (sign_cast_ne_zero' _) (mul_ne_zero (sign_cast_ne_zero' _) h)

omit [DecidableEq K] in
/-- **`IsMDS` loses nothing against arbitrary injective selections**, at every order and
every matrix size. -/
theorem isMDS_iff_forall_injective {n : ℕ} (M : Matrix (Fin n) (Fin n) K) :
    IsMDS M ↔ ∀ (k : ℕ) (r c : Fin k → Fin n), Function.Injective r →
      Function.Injective c → (M.submatrix r c).det ≠ 0 := by
  constructor
  · intro hM k r c hr hc
    obtain ⟨hR, σ, hσ⟩ := exists_perm_orderEmbOfFin r hr
    obtain ⟨hC, τ, hτ⟩ := exists_perm_orderEmbOfFin c hc
    rw [hσ, hτ]
    exact det_submatrix_comp_perm_ne_zero M _ _ σ τ (hM k _ _ hR hC)
  · intro h k Row Col hRow hCol
    exact h k _ _ (Row.orderEmbOfFin hRow).injective (Col.orderEmbOfFin hCol).injective

/-- The certificate, read for arbitrary injective selections of rows and columns. -/
theorem forall_injective_of_minors4Ok (M : Matrix (Fin 4) (Fin 4) K)
    (h : minors4Ok M = true) : ∀ (k : ℕ) (r c : Fin k → Fin 4), Function.Injective r →
      Function.Injective c → (M.submatrix r c).det ≠ 0 :=
  (isMDS_iff_forall_injective M).mp (isMDS_of_minors4Ok M h)

end Cryptificate
