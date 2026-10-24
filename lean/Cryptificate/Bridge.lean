import Cryptificate.Diffusion.Activity

/-!
# From executions to trails

WideTrail's active-S-box bound is a statement about trails: sequences of difference patterns
in which each step applies the linear layer to some pattern with the support of the current
one (`WideTrailSpec.IsTrail`). This file defines the cipher those trails are meant to describe,
an AES-like execution on a 16-byte state, and proves that two executions under the same
round keys produce such a trail. The bound then holds for actual pairs of executions, not only
for patterns assumed to be trails.

## The execution

The state is `Fin 16 → K`, with row `r`, column `c` at byte `4 * c + r` (`bytePos`), the
column-major layout of AES. One round is

1. add the round key, bytewise;
2. apply the S-box to every byte;
3. shift rows: `out[r][c] = in[r][(c + off r) mod 4]`;
4. mix columns: column `c` of the output is `M` times column `c` of the input.

`aesLikeExec` iterates rounds with a sequence of round keys. Real AES differs in its last
round (no MixColumns, one more key addition); neither changes the count below, which only
looks at S-box inputs, and the S-boxes of the first `r` rounds see only the first `r - 1`
linear layers.

## The bridge

Write `Δₙ` for the difference of the two states at the input of round `n`. Three facts turn
`Δ` into a trail of `candidateSpec M off` (`isTrail_difference`):

* the round key is added to both executions, so it cancels: the S-box inputs differ by `Δₙ`;
* the S-box is injective, so its output difference is nonzero exactly where its input
  difference is: the S-box layer preserves the support of `Δₙ`;
* row shifting and column mixing are additive, so `Δₙ₊₁` is the linear layer applied to the
  S-box output difference.

The number of S-boxes of round `n` whose inputs differ is the weight of `Δₙ`
(`card_activeSboxesAt`), so `activeSboxes_bound` is WideTrail's `IsTrail.bound_rounds` read
for executions. The only hypothesis on the S-box is injectivity; it is not assumed to be the
AES S-box or to have any differential property.

WideTrail's `Hades/Schedule.lean` models executions of the same shape (a fixed addition, then
the S-boxes, then a linear map) for HADES. The definitions here are stated directly instead,
so that they stay computable, use the byte layout of the candidate format, and need only an
injective S-box rather than a bundled equivalence.
-/

set_option autoImplicit false

namespace Cryptificate

open Finset

/-! ### The byte layout -/

/-- The byte holding row `r`, column `c`: `4 * c + r`. -/
def bytePos (r c : Fin 4) : Fin 16 := ⟨4 * c.val + r.val, by omega⟩

/-- The row of byte `p`. -/
def byteRow (p : Fin 16) : Fin 4 := ⟨p.val % 4, by omega⟩

/-- The column of byte `p`. -/
def byteCol (p : Fin 16) : Fin 4 := ⟨p.val / 4, by omega⟩

@[simp] theorem byteRow_bytePos (r c : Fin 4) : byteRow (bytePos r c) = r := by
  ext
  simp only [byteRow, bytePos]
  omega

@[simp] theorem byteCol_bytePos (r c : Fin 4) : byteCol (bytePos r c) = c := by
  ext
  simp only [byteCol, bytePos]
  omega

@[simp] theorem bytePos_byteRow_byteCol (p : Fin 16) : bytePos (byteRow p) (byteCol p) = p := by
  ext
  simp only [byteRow, byteCol, bytePos]
  omega

/-- The byte layout as a bijection between grid positions and byte positions. -/
def byteEquiv : GridIdx 4 4 ≃ Fin 16 where
  toFun i := bytePos i.1 i.2
  invFun p := (byteRow p, byteCol p)
  left_inv i := by simp
  right_inv p := by simp

/-- A byte state read as a grid state: `toGrid s (r, c) = s[4 * c + r]`. -/
def toGrid {L : Type*} (s : Fin 16 → L) : GridIdx 4 4 → L := fun i => s (bytePos i.1 i.2)

/-- Reading a state as a grid does not change its weight. -/
theorem weight_toGrid {L : Type*} [Zero L] [DecidableEq L] (s : Fin 16 → L) :
    weight (toGrid s) = weight s :=
  Finset.card_equiv byteEquiv (fun i => by rw [mem_activePattern, mem_activePattern]; rfl)

/-! ### One round -/

/-- Shift rows: `out[r][c] = in[r][(c + off r) mod 4]`. -/
def shiftRows {L : Type*} (off : Fin 4 → Fin 4) (s : Fin 16 → L) : Fin 16 → L :=
  fun p => s (bytePos (byteRow p) (byteCol p + off (byteRow p)))

variable {K : Type*} [Field K]

/-- Add a round key, bytewise. -/
def addRoundKey (key s : Fin 16 → K) : Fin 16 → K := fun p => s p + key p

/-- Apply the S-box to every byte. -/
def subBytes (sbox : K → K) (s : Fin 16 → K) : Fin 16 → K := fun p => sbox (s p)

/-- Mix columns: column `c` of the output is `M` times column `c` of the input. -/
def mixColumns (M : Matrix (Fin 4) (Fin 4) K) (s : Fin 16 → K) : Fin 16 → K :=
  fun p => ∑ j, M (byteRow p) j * s (bytePos j (byteCol p))

/-- One round: add the round key, substitute bytes, shift rows, mix columns. -/
def aesLikeRound (M : Matrix (Fin 4) (Fin 4) K) (off : Fin 4 → Fin 4) (sbox : K → K)
    (key s : Fin 16 → K) : Fin 16 → K :=
  mixColumns M (shiftRows off (subBytes sbox (addRoundKey key s)))

/-- The state at the input of round `n`, starting from `x`, with round keys `keys`. -/
def aesLikeExec (M : Matrix (Fin 4) (Fin 4) K) (off : Fin 4 → Fin 4) (sbox : K → K)
    (keys : ℕ → Fin 16 → K) (x : Fin 16 → K) : ℕ → Fin 16 → K
  | 0 => x
  | n + 1 => aesLikeRound M off sbox (keys n) (aesLikeExec M off sbox keys x n)

@[simp] theorem aesLikeExec_zero (M : Matrix (Fin 4) (Fin 4) K) (off : Fin 4 → Fin 4)
    (sbox : K → K) (keys : ℕ → Fin 16 → K) (x : Fin 16 → K) :
    aesLikeExec M off sbox keys x 0 = x := rfl

@[simp] theorem aesLikeExec_succ (M : Matrix (Fin 4) (Fin 4) K) (off : Fin 4 → Fin 4)
    (sbox : K → K) (keys : ℕ → Fin 16 → K) (x : Fin 16 → K) (n : ℕ) :
    aesLikeExec M off sbox keys x (n + 1)
      = aesLikeRound M off sbox (keys n) (aesLikeExec M off sbox keys x n) := rfl

/-! ### Active S-boxes of an execution pair -/

variable [DecidableEq K]

/-- The S-boxes of round `n` whose inputs differ between the executions from `x` and from
`y`: the S-boxes that difference propagation through round `n` has to pay for. -/
def activeSboxesAt (M : Matrix (Fin 4) (Fin 4) K) (off : Fin 4 → Fin 4) (sbox : K → K)
    (keys : ℕ → Fin 16 → K) (x y : Fin 16 → K) (n : ℕ) : Finset (Fin 16) :=
  univ.filter fun p =>
    addRoundKey (keys n) (aesLikeExec M off sbox keys x n) p
      ≠ addRoundKey (keys n) (aesLikeExec M off sbox keys y n) p

/-- The number of active S-boxes in the first `r` rounds of two executions. -/
def activeSboxes (M : Matrix (Fin 4) (Fin 4) K) (off : Fin 4 → Fin 4) (sbox : K → K)
    (keys : ℕ → Fin 16 → K) (x y : Fin 16 → K) (r : ℕ) : ℕ :=
  ∑ n ∈ range r, (activeSboxesAt M off sbox keys x y n).card

/-- The difference of two executions at the input of each round, as a grid pattern. -/
def differenceTrail (M : Matrix (Fin 4) (Fin 4) K) (off : Fin 4 → Fin 4) (sbox : K → K)
    (keys : ℕ → Fin 16 → K) (x y : Fin 16 → K) (n : ℕ) : GridIdx 4 4 → K :=
  toGrid (aesLikeExec M off sbox keys x n - aesLikeExec M off sbox keys y n)

/-- The round key cancels: the active S-boxes of round `n` are the nonzero bytes of the
difference at the input of round `n`. -/
theorem card_activeSboxesAt (M : Matrix (Fin 4) (Fin 4) K) (off : Fin 4 → Fin 4)
    (sbox : K → K) (keys : ℕ → Fin 16 → K) (x y : Fin 16 → K) (n : ℕ) :
    (activeSboxesAt M off sbox keys x y n).card = weight (differenceTrail M off sbox keys x y n) := by
  rw [differenceTrail, weight_toGrid, weight, activePattern, activeSboxesAt]
  congr 1
  ext p
  simp [addRoundKey, sub_eq_zero]

theorem activeSboxes_eq_patternWeight (M : Matrix (Fin 4) (Fin 4) K) (off : Fin 4 → Fin 4)
    (sbox : K → K) (keys : ℕ → Fin 16 → K) (x y : Fin 16 → K) (r : ℕ) :
    activeSboxes M off sbox keys x y r = patternWeight (differenceTrail M off sbox keys x y) r :=
  Finset.sum_congr rfl (fun n _ => card_activeSboxesAt M off sbox keys x y n)

/-- **Executions produce trails.** Under the same round keys and an injective S-box, the
difference of two executions is a trail of the candidate's wide-trail specification, for any
number of rounds. -/
theorem isTrail_difference {M : Matrix (Fin 4) (Fin 4) K} {off : Fin 4 → Fin 4}
    (hM : IsMDS M) (hoff : DiffusionOptimal (gridCol 4 4) (shiftRowsPerm 4 4 off))
    {sbox : K → K} (hs : Function.Injective sbox) (keys : ℕ → Fin 16 → K) (x y : Fin 16 → K)
    (r : ℕ) : (candidateSpec M off hM hoff).IsTrail (differenceTrail M off sbox keys x y) r := by
  intro n _
  set u := subBytes sbox (addRoundKey (keys n) (aesLikeExec M off sbox keys x n))
  set v := subBytes sbox (addRoundKey (keys n) (aesLikeExec M off sbox keys y n))
  refine ⟨toGrid (u - v), ?_, ?_⟩
  · ext i
    simp only [mem_activePattern, toGrid, differenceTrail, Pi.sub_apply, u, v, subBytes,
      addRoundKey, ne_eq, sub_eq_zero, hs.eq_iff, add_left_inj]
  · funext ⟨r, c⟩
    rw [candidateSpec_lin_apply]
    simp only [differenceTrail, toGrid, aesLikeExec_succ, aesLikeRound, mixColumns, shiftRows,
      byteRow_bytePos, byteCol_bytePos, Pi.sub_apply, u, v, ← Finset.sum_sub_distrib, mul_sub]

omit [DecidableEq K] in
/-- Distinct inputs give a nonzero first difference. -/
theorem differenceTrail_zero_ne_zero (M : Matrix (Fin 4) (Fin 4) K) (off : Fin 4 → Fin 4)
    (sbox : K → K) (keys : ℕ → Fin 16 → K) {x y : Fin 16 → K} (hxy : x ≠ y) :
    differenceTrail M off sbox keys x y 0 ≠ 0 := by
  intro h
  apply hxy
  funext p
  have := congrFun h (byteRow p, byteCol p)
  simpa [differenceTrail, toGrid, sub_eq_zero] using this

/-- **The active-S-box bound for executions.** For an MDS matrix `M`, diffusion-optimal
offsets `off` and any injective S-box, two executions from distinct inputs under the same
round keys have at least `activityBound r` S-boxes with differing inputs in their first `r`
rounds. -/
theorem activeSboxes_bound {M : Matrix (Fin 4) (Fin 4) K} {off : Fin 4 → Fin 4}
    (hM : IsMDS M) (hoff : DiffusionOptimal (gridCol 4 4) (shiftRowsPerm 4 4 off))
    {sbox : K → K} (hs : Function.Injective sbox) (keys : ℕ → Fin 16 → K) {x y : Fin 16 → K}
    (hxy : x ≠ y) (r : ℕ) : activityBound r ≤ activeSboxes M off sbox keys x y r := by
  rw [activeSboxes_eq_patternWeight]
  exact candidate_activity_bound hM hoff (isTrail_difference hM hoff hs keys x y r)
    (differenceTrail_zero_ne_zero M off sbox keys hxy)

end Cryptificate
