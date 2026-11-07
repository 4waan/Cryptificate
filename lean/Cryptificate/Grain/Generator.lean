import Mathlib.Data.List.Basic

/-!
# Round constants from the Grain LFSR

Poseidon and Poseidon2 fix their round constants with one public procedure: an 80-bit Grain LFSR
seeded from the instance parameters, run through the self-shrinking generator, read in blocks of
`n` bits and rejection-sampled into `[0, p)`. This file is a transcription of that procedure for
prime fields and the Poseidon2 constant layout, written so that the kernel can evaluate it.

## Sources

The transcription follows two reference scripts, pinned by commit:

* the Poseidon reference, `code/generate_parameters_grain.sage` in
  <https://extgit.isec.tugraz.at/krypto/hadeshash> at commit
  `208b5a164c6a252b137997694d90931b2bb851c5` (file SHA-256
  `8d692787eee9dbd3ff8aab083a0ffc35c118d9ac70466d3feb179d2b0eaa1630`);
* the Poseidon2 reference, `poseidon2_rust_params.sage` in
  <https://github.com/HorizenLabs/poseidon2> at commit
  `055bde3f4782731ba5f5ce5888a440a94327eaf3` (file SHA-256
  `c301c6d074b58cc27f117f59971f405a16c57d10e6140f1025643fa25ba75223`).

Both share `init_generator`, `grain_sr_generator` and `grain_random_bits`; they differ only in
`generate_constants`. The Poseidon2 script draws `R_F·t + R_P` constants instead of
`(R_F + R_P)·t` and inserts `t - 1` zeros after each constant of a partial round. This file
models the Poseidon2 version, for `GF(p)` (`FIELD = 1`) and the power S-box `x ↦ x^α` with
`α > 0` (`SBOX = 0`).

## The procedure

1. **Seed.** `INIT_SEQUENCE` is the concatenation, each most significant bit first, of `FIELD` in
   2 bits, `SBOX` in 4, the field size `n` in 12, `t` in 12, `R_F` in 10, `R_P` in 10 and 30 ones:
   80 bits. The Poseidon2 script takes `n = len(p.bits())`, the bit length of `p`; the exponent
   `α` itself is not part of the seed.
2. **Warm-up.** The LFSR is clocked 160 times, output discarded. One clock computes
   `b₆₂ ⊕ b₅₁ ⊕ b₃₈ ⊕ b₂₃ ⊕ b₁₃ ⊕ b₀` over the current sequence `b₀ … b₇₉`, drops `b₀` and appends
   the new bit.
3. **Self-shrinking.** Clocks are read in pairs `(a, b)`; `b` is output when `a = 1`, and the pair
   is discarded when `a = 0`.
4. **Sampling.** A candidate is `n` output bits read as a number, first bit most significant; it
   is redrawn while it is `≥ p`.
5. **Layout (Poseidon2).** `R_F·t + R_P` constants are drawn in order; the `i`-th is followed by
   `t - 1` zeros when `R_F/2·t ≤ i < R_F/2·t + R_P`. Read in rows of `t`, this is one row per
   round: `R_F/2` full rows, `R_P` rows `[c, 0, …, 0]` and `R_F/2` full rows, as in the Poseidon2
   Rust instances (`RC3`, `RC16`, …).

## Representation

The sequence `b₀ … b₇₉` is the natural number `v` with `bᵢ` at bit `79 - i`, so the seed is a
plain sum of shifted fields and a clock is `v ↦ ((v <<< 1) ||| new) &&& (2⁸⁰ - 1)`. The taps
`b₀, b₁₃, b₂₃, b₃₈, b₅₁, b₆₂` are bits `79, 66, 56, 41, 28, 17`.

The nearest tap is 62 positions behind the newest bit, so the next 16 new bits depend only on the
current 80 and are computed with one expression (`block16`): `16` clocks cost a handful of
operations on natural numbers, which the kernel computes with its built-in arbitrary-precision
arithmetic. The warm-up is ten such blocks. Each block holds eight whole pairs (pairs start at
even clock counts, and 160 and 16 are even), which the self-shrinking step reads in order and
appends to a buffer of output bits; candidates are taken from the front of the buffer. Reading
ahead does not change the output sequence, only when the LFSR is clocked.

`Grain.Bitwise` transcribes the scripts clock by clock and output bit by output bit, and checks
that both versions agree; the agreement is tested on several instances, not proved in general.

## Termination and trust

Every loop has an explicit budget (`fuel`) and recursion is structural on it. When a budget runs
out, or a parameter does not fit its field of the seed (the scripts would write it with more
bits and seed a different register), the result is `none`. So `poseidon2Constants … = some cs`
means that the procedure ran to completion and produced exactly `cs`; nothing is assumed about
the budgets. What is trusted is that this file transcribes the scripts faithfully; the library
checks that it reproduces the published constants of the BN254 instance of HorizenLabs/poseidon2
in the kernel (`Grain.bn254_reference`) and the published BabyBear, KoalaBear and Goldilocks
constants by evaluation (`Grain.Vectors`).
-/

set_option autoImplicit false

namespace Cryptificate.Grain

/-- `FIELD = 1`: the field is `GF(p)`. -/
def fieldPrime : ℕ := 1

/-- `SBOX = 0`: the S-box is `x ↦ x^α` with `α > 0`. -/
def sboxPower : ℕ := 0

/-- `2⁸⁰ - 1`, the LFSR's 80 bits. -/
def mask80 : ℕ := 1208925819614629174706175

theorem mask80_eq : mask80 = 2 ^ 80 - 1 := rfl

/-- The field size used in the seed: the bit length of `p` (`len(p.bits())` in the Poseidon2
script), for `p ≥ 1`. -/
def fieldSize (p : ℕ) : ℕ := Nat.log2 p + 1

/-- Whether the seed fields hold their values: `n` and `t` below `2¹²`, `R_F` and `R_P` below
`2¹⁰`. The scripts zero-pad with `zfill`, which never truncates, so a larger value would give a
longer `INIT_SEQUENCE` and a different register; such parameters are outside this model. -/
def fits (n t rf rp : ℕ) : Bool :=
  n < 2 ^ 12 && t < 2 ^ 12 && rf < 2 ^ 10 && rp < 2 ^ 10

/-- `INIT_SEQUENCE` as an 80-bit number, its first bit most significant:
`FIELD (2) ‖ SBOX (4) ‖ n (12) ‖ t (12) ‖ R_F (10) ‖ R_P (10) ‖ 1³⁰`. -/
def seed (n t rf rp : ℕ) : ℕ :=
  ((((((fieldPrime * 2 ^ 4 + sboxPower) * 2 ^ 12 + n) * 2 ^ 12 + t) * 2 ^ 10 + rf) * 2 ^ 10 + rp)
    * 2 ^ 30) + (2 ^ 30 - 1)

/-- The next 16 bits of the LFSR from state `v`, the first one most significant. Bit `15 - j` is
`b₆₂₊ⱼ ⊕ b₅₁₊ⱼ ⊕ b₃₈₊ⱼ ⊕ b₂₃₊ⱼ ⊕ b₁₃₊ⱼ ⊕ bⱼ`; every index is below 80, so all 16 bits are
determined by `v`. With `bᵢ` at bit `79 - i`, the tap `b_{c+j}` of bit `15 - j` is bit `15 - j`
of `v >>> (64 - c)`, for `c = 0, 13, 23, 38, 51, 62`.

The hot loop calls `Nat.shiftRight`, `Nat.xor`, `Nat.land` and the other primitives by name
rather than through `>>>`, `^^^` and `&&&`: the meaning is the same, and the kernel does not have
to unfold the notation's instances on every step. -/
def block16 (v : ℕ) : ℕ :=
  Nat.land
    (Nat.xor (Nat.shiftRight v 64) (Nat.xor (Nat.shiftRight v 51) (Nat.xor (Nat.shiftRight v 41)
      (Nat.xor (Nat.shiftRight v 26) (Nat.xor (Nat.shiftRight v 13) (Nat.shiftRight v 2))))))
    65535

/-- The LFSR state after 16 clocks: the 16 new bits `w` are appended and the 16 oldest dropped. -/
def shift16 (v w : ℕ) : ℕ := Nat.land (Nat.lor (Nat.shiftLeft v 16) w) mask80

/-- `k` blocks of 16 clocks. -/
def warm : ℕ → ℕ → ℕ
  | 0, v => v
  | k + 1, v => warm k (shift16 v (block16 v))

/-- The self-shrinking step on the `k` pairs in the low `2k` bits of `w`, most significant pair
first: for each pair `(a, b)`, `b` is appended to the buffer `buf` (of `cnt` bits) when
`a = 1`. This is the readable definition; `refill` uses `shrinkTable`, its values on all bytes
(`shrinkTable_spec`). -/
def shrink : ℕ → ℕ → ℕ → ℕ → ℕ × ℕ
  | 0, _, buf, cnt => (buf, cnt)
  | k + 1, w, buf, cnt =>
    if (w >>> (2 * k + 1)) % 2 = 1 then
      shrink k w (2 * buf + (w >>> (2 * k)) % 2) (cnt + 1)
    else shrink k w buf cnt

/-- The self-shrinking step on every byte (four pairs), as one number: the entry of byte `x` is
bits `8x … 8x + 7`, holding the number of output bits in its low three bits and the output bits
above them. -/
def shrinkTable : ℕ :=
  15710865643230198632276322062338213434649358189655659678270574225005557226904902179401453003874548714719487777759561728693638847207675042148199232465125607695217818091444957883089052980979404688710844559373688587763538838138805921504341562600998350954876245308698724766429612322583086463477483194564651766464570625643122211597272875438475048178368803373042058746532259690362777693034588614915348847596040451099751277747776668774948628089531073217226653327411464358128144663180415164581441449422588182908489820860749901368449716186124666507879243995257608723113070231602705139630382469461814980383300787512088887099392

/-- The entry of byte `x` in `shrinkTable`. -/
def shrinkEntry (x : ℕ) : ℕ := Nat.land (Nat.shiftRight shrinkTable (Nat.mul 8 x)) 255

/-- The table is the self-shrinking step: entry `x` holds the output bits and their number for
the four pairs of byte `x`. -/
theorem shrinkTable_spec :
    ∀ x < 256, (shrinkEntry x / 8, shrinkEntry x % 8) = shrink 4 x 0 0 := by
  decide +kernel

/-- The generator: the LFSR state, and the self-shrinking output bits read ahead but not yet
used (`count` bits in `buf`, the oldest most significant). -/
structure State where
  lfsr : ℕ
  buf : ℕ
  count : ℕ

/-- The generator after the warm-up of `160` clocks, with no output read yet. -/
def start (n t rf rp : ℕ) : State := ⟨warm 10 (seed n t rf rp), 0, 0⟩

/-- Clock 16 times and append the output of the eight pairs, high byte first: each byte's
output bits `e / 8` (`e % 8` of them) go after the bits already buffered. -/
def refill (s : State) : State :=
  let w := block16 s.lfsr
  let e₁ := shrinkEntry (Nat.shiftRight w 8)
  let e₂ := shrinkEntry (Nat.land w 255)
  let c₁ := Nat.land e₁ 7
  let c₂ := Nat.land e₂ 7
  let buf₁ := Nat.lor (Nat.shiftLeft s.buf c₁) (Nat.shiftRight e₁ 3)
  ⟨shift16 s.lfsr w, Nat.lor (Nat.shiftLeft buf₁ c₂) (Nat.shiftRight e₂ 3),
    Nat.add s.count (Nat.add c₁ c₂)⟩

/-- `grain_random_bits(n)`: the next `n` output bits as a number, first bit most significant,
refilling at most `fuel` times. -/
def take (n : ℕ) : ℕ → State → Option (ℕ × State)
  | 0, _ => none
  | fuel + 1, s =>
    match Nat.ble n s.count with
    | true =>
      let r := Nat.sub s.count n
      let c := Nat.shiftRight s.buf r
      some (c, ⟨s.lfsr, Nat.sub s.buf (Nat.shiftLeft c r), r⟩)
    | false => take n fuel (refill s)

/-- Refills allowed for one candidate: 16 times the expected number. -/
def takeFuel (n : ℕ) : ℕ := 64 * n + 64

/-- One constant: candidates of `n` bits until one is below `p`, at most `fuel` of them. -/
def element (n p : ℕ) : ℕ → State → Option (ℕ × State)
  | 0, _ => none
  | fuel + 1, s =>
    match take n (takeFuel n) s with
    | some (c, s') =>
      match Nat.blt c p with
      | true => some (c, s')
      | false => element n p fuel s'
    | none => none

/-- Candidates allowed for one constant. -/
def elementFuel : ℕ := 1024

/-- `generate_constants` of the Poseidon2 script from constant index `i` on, `k` constants
left: the constants with index in `[lo, hi)` are followed by `t - 1` zeros. -/
def constantsFrom (n p t lo hi : ℕ) : ℕ → ℕ → State → Option (List ℕ)
  | 0, _, _ => some []
  | k + 1, i, s =>
    match element n p elementFuel s with
    | some (c, s') =>
      match constantsFrom n p t lo hi k (Nat.succ i) s' with
      | some rest =>
        match Nat.ble lo i && Nat.blt i hi with
        | true => some (c :: (List.replicate (t - 1) 0 ++ rest))
        | false => some (c :: rest)
      | none => none
    | none => none

/-- **The Poseidon2 round constants** of an instance over `GF(p)` with state width `t`, `rf` full
rounds and `rp` partial rounds, as the flat list of the reference script (`round_constants`):
`(rf + rp) · t` numbers, row `r` (positions `r·t … r·t + t - 1`) holding the constants added in
round `r`, partial rounds `[c, 0, …, 0]`. `none` when `rf` is odd, a parameter does not fit the
seed, or a budget runs out. -/
def poseidon2Constants (p t rf rp : ℕ) : Option (List ℕ) :=
  let n := fieldSize p
  if fits n t rf rp ∧ rf % 2 = 0 then
    constantsFrom n p t (rf / 2 * t) (rf / 2 * t + rp) (rf * t + rp) 0 (start n t rf rp)
  else none

/-- The constant at flat position `i` (round `i / t`, position `i % t`), when the procedure
completes and `i` is in range. -/
def constantAt (p t rf rp i : ℕ) : Option ℕ := (poseidon2Constants p t rf rp).bind (·[i]?)

/-- A list that differs from the generated constants at some position is not the generated
list. Refutations state `constantAt … i = some e` and `cs[i]? ≠ some e`, which also records that
the procedure completed. -/
theorem ne_of_constantAt {p t rf rp i e : ℕ} {cs : List ℕ} (h : constantAt p t rf rp i = some e)
    (hne : cs[i]? ≠ some e) : poseidon2Constants p t rf rp ≠ some cs := by
  intro heq
  rw [constantAt, heq, Option.bind_some] at h
  exact hne h

/-- The Poseidon2 layout of constants given as Plonky3 lists them: the rows of the first full
rounds, one constant per partial round, and the rows of the last full rounds. Each partial-round
constant `c` becomes the row `[c, 0, …, 0]` of `t` numbers. -/
def fromSplit (t : ℕ) (initial : List (List ℕ)) (internal : List ℕ) (final : List (List ℕ)) :
    List ℕ :=
  initial.flatten ++ internal.flatMap (fun c => c :: List.replicate (t - 1) 0) ++ final.flatten

/-- The rows of `t` numbers of a flat list (the last one shorter if `t` does not divide its
length), the shape in which designs list their constants. -/
def rows (t : ℕ) (l : List ℕ) : List (List ℕ) := rowsAux t l l.length

where
  /-- `rows` with a budget: `l.length` always suffices. -/
  rowsAux (t : ℕ) : List ℕ → ℕ → List (List ℕ)
    | [], _ => []
    | _ :: _, 0 => []
    | l@(_ :: _), fuel + 1 => l.take t :: rowsAux t (l.drop t) fuel

end Cryptificate.Grain
