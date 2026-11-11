import Cryptificate.Grain.Generator

/-!
# The Grain procedure, clock by clock

A second transcription of the reference scripts (see `Grain.Generator` for the sources), as
close to their text as Lean allows and with no attention to speed: the register is the list
`bit_sequence` of 80 bits, one clock appends `b₆₂ ⊕ b₅₁ ⊕ b₃₈ ⊕ b₂₃ ⊕ b₁₃ ⊕ b₀` and drops `b₀`,
the self-shrinking generator reads one pair at a time, `grain_random_bits` reads one output bit at
a time, and `generate_constants` pads after each partial-round constant.

The `#guard` lines below evaluate both transcriptions on several instances and fail the build if
they differ. They are tests: the equality of `Grain.Bitwise.poseidon2Constants` and
`Grain.poseidon2Constants` is not proved for all parameters.
-/

set_option autoImplicit false

namespace Cryptificate.Grain.Bitwise

/-- `bin(x)[2:].zfill(w)` as a list of bits, for `x < 2 ^ w`: `w` bits, most significant first. -/
def bitsOf (w x : ℕ) : List ℕ := (List.range w).reverse.map fun j => x / 2 ^ j % 2

/-- `INIT_SEQUENCE` (`init_generator`). -/
def initSequence (n t rf rp : ℕ) : List ℕ :=
  bitsOf 2 fieldPrime ++ bitsOf 4 sboxPower ++ bitsOf 12 n ++ bitsOf 12 t ++ bitsOf 10 rf ++
    bitsOf 10 rp ++ List.replicate 30 1

/-- One clock: the new bit, and the sequence with `b₀` popped and the new bit appended. -/
def clock (s : List ℕ) : ℕ × List ℕ :=
  let b := (s.getD 62 0 + s.getD 51 0 + s.getD 38 0 + s.getD 23 0 + s.getD 13 0 + s.getD 0 0) % 2
  (b, s.tail ++ [b])

/-- `k` clocks with the output discarded. -/
def clocks : ℕ → List ℕ → List ℕ
  | 0, s => s
  | k + 1, s => clocks k (clock s).2

/-- One output bit of `grain_sr_generator` after the warm-up: clock a pair `(a, b)`; output `b`
if `a = 1`, otherwise try the next pair (at most `fuel` pairs). -/
def nextBit : ℕ → List ℕ → Option (ℕ × List ℕ)
  | 0, _ => none
  | fuel + 1, s =>
    let (a, s₁) := clock s
    let (b, s₂) := clock s₁
    if a = 1 then some (b, s₂) else nextBit fuel s₂

/-- `grain_random_bits(k)` with the bits accumulated into `acc`, first bit most significant. -/
def randomBits : ℕ → ℕ → List ℕ → Option (ℕ × List ℕ)
  | 0, acc, s => some (acc, s)
  | k + 1, acc, s =>
    match nextBit 4096 s with
    | some (b, s') => randomBits k (2 * acc + b) s'
    | none => none

/-- One constant: `random_int` redrawn `while random_int >= prime_number`. -/
def element (n p : ℕ) : ℕ → List ℕ → Option (ℕ × List ℕ)
  | 0, _ => none
  | fuel + 1, s =>
    match randomBits n 0 s with
    | some (c, s') => if c < p then some (c, s') else element n p fuel s'
    | none => none

/-- The loop of `generate_constants` from index `i` on, with `k` constants left. -/
def constantsFrom (n p t rf rp : ℕ) : ℕ → ℕ → List ℕ → Option (List ℕ)
  | 0, _, _ => some []
  | k + 1, i, s =>
    match element n p 1024 s with
    | some (c, s') =>
      match constantsFrom n p t rf rp k (i + 1) s' with
      | some rest =>
        if rf / 2 * t ≤ i ∧ i < rf / 2 * t + rp then some (c :: List.replicate (t - 1) 0 ++ rest)
        else some (c :: rest)
      | none => none
    | none => none

/-- `generate_constants` of the Poseidon2 script, with `n = len(p.bits())`. -/
def poseidon2Constants (p t rf rp : ℕ) : Option (List ℕ) :=
  let n := Nat.log2 p + 1
  if fits n t rf rp ∧ rf % 2 = 0 then
    constantsFrom n p t rf rp (rf * t + rp) 0 (clocks 160 (initSequence n t rf rp))
  else none

/-! ### Both transcriptions agree -/

/-- The register after the warm-up is the same in both representations. -/
theorem start_eq : (clocks 160 (initSequence 254 3 8 56)) =
    bitsOf 80 (start 254 3 8 56).lfsr := by
  decide +kernel

-- BN254, width 3, the Poseidon2 instance of HorizenLabs/poseidon2.
#guard poseidon2Constants
    21888242871839275222246405745257275088548364400416034343698204186575808495617 3 8 56 =
  Grain.poseidon2Constants
    21888242871839275222246405745257275088548364400416034343698204186575808495617 3 8 56

-- The prime fields of the prime-field profile at widths 3 and 4, with illustrative round counts.
#guard poseidon2Constants 2013265921 3 8 13 = Grain.poseidon2Constants 2013265921 3 8 13
#guard poseidon2Constants 2013265921 4 8 13 = Grain.poseidon2Constants 2013265921 4 8 13
#guard poseidon2Constants 2130706433 4 8 20 = Grain.poseidon2Constants 2130706433 4 8 20
#guard poseidon2Constants 2147483647 3 8 14 = Grain.poseidon2Constants 2147483647 3 8 14
#guard poseidon2Constants 18446744069414584321 4 8 22 =
  Grain.poseidon2Constants 18446744069414584321 4 8 22
-- A small prime, where about half of the candidates are rejected (`p = 2⁸ + 1`, `n = 9`).
#guard poseidon2Constants 257 3 6 5 = Grain.poseidon2Constants 257 3 6 5
-- Odd `R_F` and parameters that do not fit the seed are outside both models.
#guard poseidon2Constants 257 3 5 5 = none ∧ Grain.poseidon2Constants 257 3 5 5 = none
#guard poseidon2Constants 257 3 8 1024 = none ∧ Grain.poseidon2Constants 257 3 8 1024 = none

end Cryptificate.Grain.Bitwise
