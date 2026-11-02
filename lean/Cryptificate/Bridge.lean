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

`aesLikeExec` iterates rounds with a sequence of round keys; every round has the four steps.

## The final round

AES differs in its last round: it has no MixColumns, and one more key is added after it.
`aesLikeFinalRound` is that round (add the key, S-boxes, shift rows, add the final key), and
`aesLikeCipher M off sbox keys x r` is `r - 1` rounds of `aesLikeExec` followed by the final
round, with `r + 1` keys; with the AES parameters, `r = 10` and the AES-128 key expansion it
is AES-128 encryption. `aesLikeCipherExec … r x n` is the state at the input of round `n` of
that cipher. Its S-box inputs over the `r` rounds are the S-box inputs of the first `r` rounds
of `aesLikeExec` (`aesLikeCipherExec_of_lt`): the S-boxes of the first `r` rounds see only the
first `r - 1` linear layers, and the final key addition comes after every S-box. So the
cipher's count of active S-boxes over its `r` rounds, its final round included, equals the
count of the first `r` rounds of `aesLikeExec` (`aesLikeCipherActiveSboxes_eq`) and has the
same lower bound (`aesLikeCipherActiveSboxes_bound`). Dropping the last linear layer neither
adds to nor takes from that bound.

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

/-! ### A final round without the linear layer -/

/-- The final round of AES: add the round key, substitute bytes, shift rows, add the final
key. There is no column mixing. -/
def aesLikeFinalRound (off : Fin 4 → Fin 4) (sbox : K → K) (key finalKey s : Fin 16 → K) :
    Fin 16 → K :=
  addRoundKey finalKey (shiftRows off (subBytes sbox (addRoundKey key s)))

/-- `r` rounds whose last one is the final round: rounds `0, …, r - 2` are `aesLikeRound` with
keys `0, …, r - 2`, round `r - 1` is `aesLikeFinalRound` with keys `r - 1` and `r`. It uses
`r + 1` keys; with `r = 0` it is the input. -/
def aesLikeCipher (M : Matrix (Fin 4) (Fin 4) K) (off : Fin 4 → Fin 4) (sbox : K → K)
    (keys : ℕ → Fin 16 → K) (x : Fin 16 → K) : ℕ → Fin 16 → K
  | 0 => x
  | n + 1 => aesLikeFinalRound off sbox (keys n) (keys (n + 1)) (aesLikeExec M off sbox keys x n)

@[simp] theorem aesLikeCipher_zero (M : Matrix (Fin 4) (Fin 4) K) (off : Fin 4 → Fin 4)
    (sbox : K → K) (keys : ℕ → Fin 16 → K) (x : Fin 16 → K) :
    aesLikeCipher M off sbox keys x 0 = x := rfl

theorem aesLikeCipher_succ (M : Matrix (Fin 4) (Fin 4) K) (off : Fin 4 → Fin 4)
    (sbox : K → K) (keys : ℕ → Fin 16 → K) (x : Fin 16 → K) (n : ℕ) :
    aesLikeCipher M off sbox keys x (n + 1)
      = aesLikeFinalRound off sbox (keys n) (keys (n + 1)) (aesLikeExec M off sbox keys x n) :=
  rfl

/-- Round `n` of the `r`-round cipher: a full round while `n + 1 < r`, the final round
otherwise. -/
def aesLikeCipherRound (M : Matrix (Fin 4) (Fin 4) K) (off : Fin 4 → Fin 4) (sbox : K → K)
    (keys : ℕ → Fin 16 → K) (r n : ℕ) (s : Fin 16 → K) : Fin 16 → K :=
  if n + 1 < r then aesLikeRound M off sbox (keys n) s
  else aesLikeFinalRound off sbox (keys n) (keys (n + 1)) s

/-- The state at the input of round `n` of the `r`-round cipher `aesLikeCipher`, round by
round (`aesLikeCipherExec_self`: after `r` rounds it is the cipher's output). -/
def aesLikeCipherExec (M : Matrix (Fin 4) (Fin 4) K) (off : Fin 4 → Fin 4) (sbox : K → K)
    (keys : ℕ → Fin 16 → K) (r : ℕ) (x : Fin 16 → K) : ℕ → Fin 16 → K
  | 0 => x
  | n + 1 => aesLikeCipherRound M off sbox keys r n (aesLikeCipherExec M off sbox keys r x n)

/-- Before its last round, the cipher is `aesLikeExec`: the state at the input of round
`n < r` is the same in both. -/
theorem aesLikeCipherExec_of_lt (M : Matrix (Fin 4) (Fin 4) K) (off : Fin 4 → Fin 4)
    (sbox : K → K) (keys : ℕ → Fin 16 → K) (x : Fin 16 → K) {r n : ℕ} (h : n < r) :
    aesLikeCipherExec M off sbox keys r x n = aesLikeExec M off sbox keys x n := by
  induction n with
  | zero => rfl
  | succ n ih =>
    simp only [aesLikeCipherExec, aesLikeCipherRound, if_pos h, ih (by omega), aesLikeExec_succ]

/-- After its `r` rounds, the round-by-round execution is `aesLikeCipher`. -/
theorem aesLikeCipherExec_self (M : Matrix (Fin 4) (Fin 4) K) (off : Fin 4 → Fin 4)
    (sbox : K → K) (keys : ℕ → Fin 16 → K) (x : Fin 16 → K) (r : ℕ) :
    aesLikeCipherExec M off sbox keys r x r = aesLikeCipher M off sbox keys x r := by
  cases r with
  | zero => rfl
  | succ n =>
    simp only [aesLikeCipherExec, aesLikeCipherRound, lt_irrefl, if_false,
      aesLikeCipherExec_of_lt M off sbox keys x (Nat.lt_succ_self n), aesLikeCipher_succ]

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

/-! ### Active S-boxes of the cipher with a final round -/

/-- The S-boxes of round `n` of the `r`-round cipher whose inputs differ between the
executions from `x` and from `y`. -/
def aesLikeCipherActiveSboxesAt (M : Matrix (Fin 4) (Fin 4) K) (off : Fin 4 → Fin 4)
    (sbox : K → K) (keys : ℕ → Fin 16 → K) (r : ℕ) (x y : Fin 16 → K) (n : ℕ) :
    Finset (Fin 16) :=
  univ.filter fun p =>
    addRoundKey (keys n) (aesLikeCipherExec M off sbox keys r x n) p
      ≠ addRoundKey (keys n) (aesLikeCipherExec M off sbox keys r y n) p

/-- The number of active S-boxes over the `r` rounds of the cipher, its final round
included. -/
def aesLikeCipherActiveSboxes (M : Matrix (Fin 4) (Fin 4) K) (off : Fin 4 → Fin 4)
    (sbox : K → K) (keys : ℕ → Fin 16 → K) (r : ℕ) (x y : Fin 16 → K) : ℕ :=
  ∑ n ∈ range r, (aesLikeCipherActiveSboxesAt M off sbox keys r x y n).card

/-- **The final round's S-boxes count, and the missing linear layer changes nothing.** Over
its `r` rounds, the cipher with a final round has exactly as many active S-boxes as the first
`r` rounds of `aesLikeExec`. -/
theorem aesLikeCipherActiveSboxes_eq (M : Matrix (Fin 4) (Fin 4) K) (off : Fin 4 → Fin 4)
    (sbox : K → K) (keys : ℕ → Fin 16 → K) (r : ℕ) (x y : Fin 16 → K) :
    aesLikeCipherActiveSboxes M off sbox keys r x y = activeSboxes M off sbox keys x y r := by
  refine Finset.sum_congr rfl fun n hn => ?_
  have h := Finset.mem_range.mp hn
  simp only [aesLikeCipherActiveSboxesAt, activeSboxesAt, aesLikeCipherExec_of_lt _ _ _ _ _ h]

/-- **The active-S-box bound for the cipher with a final round.** For an MDS matrix `M`,
diffusion-optimal offsets `off` and any injective S-box, two executions of the `r`-round
cipher (the last round without column mixing, then the final key) from distinct inputs under
the same keys have at least `activityBound r` S-boxes with differing inputs over their `r`
rounds: the bound of the first `r` rounds of `aesLikeExec`. -/
theorem aesLikeCipherActiveSboxes_bound {M : Matrix (Fin 4) (Fin 4) K} {off : Fin 4 → Fin 4}
    (hM : IsMDS M) (hoff : DiffusionOptimal (gridCol 4 4) (shiftRowsPerm 4 4 off))
    {sbox : K → K} (hs : Function.Injective sbox) (keys : ℕ → Fin 16 → K) {x y : Fin 16 → K}
    (hxy : x ≠ y) (r : ℕ) : activityBound r ≤ aesLikeCipherActiveSboxes M off sbox keys r x y := by
  rw [aesLikeCipherActiveSboxes_eq]
  exact activeSboxes_bound hM hoff hs keys hxy r

end Cryptificate
