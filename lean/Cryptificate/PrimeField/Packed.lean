import Cryptificate.PrimeField.NatMatrix

/-!
# Packed rows: matrix checks by big-number arithmetic

The kernel evaluates a function on lists one cons cell at a time, and every step costs far more
than the arithmetic it performs: a `24 × 24` product check that walks lists entry by entry takes
seconds. Arithmetic on natural-number literals, on the other hand, is a single kernel step
whatever the size of the numbers (the kernel calls GMP for `+`, `*`, `/`, `%`, `<<<`, `>>>`). This
file therefore packs a vector of `n` residues into one number, the digits of a base `X = 2 ^ S`
expansion, and replaces each dot product by one multiplication.

## The encoding

* `packMod p S l` packs a list of numerals, reduced modulo `p`, as the digits of a base-`2 ^ S`
  number, the first entry lowest. A row-major `n × n` matrix becomes one number whose block `i`
  (`blk`, digits `n i` to `n i + n - 1`) is row `i`.
* `digit S N k` is digit `k`.
* `kron S n a c` multiplies two packed vectors and reads digit `n - 1` of the product. If the
  digits of `a` are `x₀, …, x_{n-1}` and those of `c` are `y₀, …, y_{n-1}`, that digit is
  `∑ₖ xₖ y_{n-1-k}` (Kronecker substitution), provided no digit of the product overflows: every
  digit is below `p` and `n² p² ≤ 2 ^ S` (`boundOk`). An inverse witness `W` is therefore
  supplied column by column, each column reversed (`revCols`), so that one multiplication per
  entry computes an entry of `M * W`.

The lemmas `sum_div_pow_mod`, `eq_sum_digits` and `kron_eq` carry out the carry analysis once, for
every base, length and digit bound. Everything the kernel evaluates in a certificate is a
`Bool`-valued function of numerals; `decide +kernel` checks it, and the theorems below turn
acceptance into statements about matrices over `ZMod p`.

## The checks

* `checkInverse p n S E Wr`: `pfMat p n E * revCols p n Wr = 1` (`mul_revCols_eq_one`).
* `checkObs`: the rows `eᵢ Mʲ`, `j < L`, `i` masked, computed by packed vector-matrix products
  (`vecMulP`), include `n` rows that have an inverse: `M` is observable from the mask in `L`
  steps (`Hades.observable_of_checkObsP`).
* `checkOrth`: all those rows are orthogonal to a vector `v` (`Hades.powers_zero_of_checkOrthP`).
* `checkBlocks`: a `t × t` matrix is the Poseidon2 external matrix `circ(2 M₄, M₄, …, M₄)` of a
  `4 × 4` matrix (`Hades.pfMat_eq_poseidon2External_of_checkP`).
-/

set_option autoImplicit false

open Matrix

namespace Cryptificate

namespace Packed

/-! ### Base-`b` expansions -/

section Digits

variable {b : ℕ}

/-- A sum of digits below `b` times powers of `b` is below `b ^ m`. -/
theorem sum_lt (c : ℕ → ℕ) {m : ℕ} (hc : ∀ j < m, c j < b) :
    ∑ j ∈ Finset.range m, c j * b ^ j < b ^ m := by
  induction m with
  | zero => simp
  | succ m ih =>
    rw [Finset.sum_range_succ, pow_succ]
    have h1 := ih (fun j hj => hc j (by omega))
    have h2 : c m + 1 ≤ b := hc m (by omega)
    calc ∑ j ∈ Finset.range m, c j * b ^ j + c m * b ^ m
        < b ^ m + c m * b ^ m := by omega
      _ = (c m + 1) * b ^ m := by ring
      _ ≤ b * b ^ m := Nat.mul_le_mul_right _ h2
      _ = b ^ m * b := by ring

/-- **Reading a digit.** Digit `k` of `∑ⱼ cⱼ bʲ`, digits below `b`, is `c k` (zero past the
last digit). -/
theorem sum_div_pow_mod (c : ℕ → ℕ) {m : ℕ} (hc : ∀ j < m, c j < b) (k : ℕ) :
    (∑ j ∈ Finset.range m, c j * b ^ j) / b ^ k % b = if k < m then c k else 0 := by
  induction m generalizing c k with
  | zero => simp
  | succ m ih =>
    have hb : 0 < b := lt_of_le_of_lt (Nat.zero_le _) (hc 0 (by omega))
    rw [Finset.sum_range_succ']
    have hs : ∑ j ∈ Finset.range m, c (j + 1) * b ^ (j + 1) =
        b * ∑ j ∈ Finset.range m, c (j + 1) * b ^ j := by
      rw [Finset.mul_sum]
      exact Finset.sum_congr rfl fun j _ => by ring
    rw [hs, pow_zero, mul_one]
    cases k with
    | zero =>
      rw [pow_zero, Nat.div_one, Nat.mul_add_mod, Nat.mod_eq_of_lt (hc 0 (by omega))]
      simp
    | succ k =>
      rw [pow_succ', ← Nat.div_div_eq_div_mul, Nat.add_comm, Nat.add_mul_div_left _ _ hb,
        Nat.div_eq_of_lt (hc 0 (by omega)), Nat.zero_add,
        ih (fun j => c (j + 1)) (fun j hj => hc (j + 1) (by omega)) k]
      simp

/-- Every number below `b ^ n` is the sum of its first `n` base-`b` digits. -/
theorem eq_sum_digits (hb : 0 < b) {n a : ℕ} (ha : a < b ^ n) :
    a = ∑ j ∈ Finset.range n, a / b ^ j % b * b ^ j := by
  induction n generalizing a with
  | zero => simp at ha; simp [ha]
  | succ n ih =>
    rw [Finset.sum_range_succ']
    have hq : a / b < b ^ n := by
      rw [Nat.div_lt_iff_lt_mul hb]
      rwa [pow_succ] at ha
    have h := ih hq
    have hs : ∑ j ∈ Finset.range n, a / b ^ (j + 1) % b * b ^ (j + 1) =
        b * ∑ j ∈ Finset.range n, a / b / b ^ j % b * b ^ j := by
      rw [Finset.mul_sum]
      refine Finset.sum_congr rfl fun j _ => ?_
      rw [Nat.div_div_eq_div_mul, ← pow_succ']
      ring
    rw [hs, ← h]
    simp only [pow_zero, Nat.div_one, mul_one]
    exact (Nat.mod_add_div a b).symm.trans (by ring)

/-- Digit `k < n` of `N mod bⁿ` is digit `k` of `N`. -/
theorem mod_pow_div_pow_mod (N : ℕ) {n k : ℕ} (hk : k < n) :
    N % b ^ n / b ^ k % b = N / b ^ k % b := by
  obtain ⟨m, rfl⟩ : ∃ m, n = k + (m + 1) := ⟨n - k - 1, by omega⟩
  rw [pow_add, Nat.mod_mul_right_div_self, Nat.mod_mod_of_dvd]
  exact dvd_pow_self b (by omega)

/-- **Kronecker substitution.** If `a` and `c` have `n` base-`b` digits, all below `q`, and
`n² q² ≤ b`, then digit `n - 1` of `a * c` is `∑ₖ aₖ c_{n-1-k}`. -/
theorem kron_eq {q n a c : ℕ} (hn : 0 < n) (hbound : n * n * (q * q) ≤ b)
    (ha : a < b ^ n) (hc : c < b ^ n) (hda : ∀ k < n, a / b ^ k % b < q)
    (hdc : ∀ k < n, c / b ^ k % b < q) :
    a * c / b ^ (n - 1) % b =
      ∑ k ∈ Finset.range n, (a / b ^ k % b) * (c / b ^ (n - 1 - k) % b) := by
  have hq : 0 < q := lt_of_le_of_lt (Nat.zero_le _) (hda 0 hn)
  have hb : 0 < b := lt_of_lt_of_le (by positivity) hbound
  set x : ℕ → ℕ := fun k => a / b ^ k % b
  set y : ℕ → ℕ := fun k => c / b ^ k % b
  have hxy : ∀ k < n, ∀ m < n, x k * y m < q * q := fun k hk m hm =>
    Nat.mul_lt_mul'' (hda k hk) (hdc m hm)
  -- the sum of all products is below `b`
  have htot : ∑ k ∈ Finset.range n, ∑ m ∈ Finset.range n, x k * y m < b := by
    calc ∑ k ∈ Finset.range n, ∑ m ∈ Finset.range n, x k * y m
        < ∑ k ∈ Finset.range n, ∑ m ∈ Finset.range n, q * q := by
          apply Finset.sum_lt_sum_of_nonempty (Finset.nonempty_range_iff.mpr (by omega))
          intro k hk
          apply Finset.sum_lt_sum_of_nonempty (Finset.nonempty_range_iff.mpr (by omega))
          intro m hm
          exact hxy k (Finset.mem_range.mp hk) m (Finset.mem_range.mp hm)
      _ = n * n * (q * q) := by simp [Finset.sum_const, Finset.card_range]; ring
      _ ≤ b := hbound
  set g : ℕ → ℕ → ℕ := fun k m => x k * y m * b ^ (k + m)
  have hprod : a * c = ∑ k ∈ Finset.range n, ∑ m ∈ Finset.range n, g k m := by
    conv_lhs => rw [eq_sum_digits hb ha, eq_sum_digits hb hc]
    rw [Finset.sum_mul_sum]
    refine Finset.sum_congr rfl fun k _ => Finset.sum_congr rfl fun m _ => ?_
    simp only [g, x, y, pow_add]
    ring
  -- split every term by the exponent `k + m` against `n - 1`
  set low := ∑ k ∈ Finset.range n, ∑ m ∈ Finset.range n, if k + m < n - 1 then g k m else 0
  set mid := ∑ k ∈ Finset.range n, x k * y (n - 1 - k)
  set high := ∑ k ∈ Finset.range n, ∑ m ∈ Finset.range n,
    if n - 1 < k + m then x k * y m * b ^ (k + m - n) else 0
  have hsplit : a * c = low + b ^ (n - 1) * (mid + b * high) := by
    rw [hprod]
    have hpt : ∀ k ∈ Finset.range n, ∀ m ∈ Finset.range n, g k m =
        (if k + m < n - 1 then g k m else 0) + (if k + m = n - 1 then g k m else 0) +
          (if n - 1 < k + m then g k m else 0) := by
      intro k _ m _
      rcases lt_trichotomy (k + m) (n - 1) with h | h | h
      · simp [h, h.ne, not_lt.mpr h.le]
      · simp [h]
      · simp [h, h.ne', not_lt.mpr h.le]
    rw [Finset.sum_congr rfl fun k hk => Finset.sum_congr rfl fun m hm => hpt k hk m hm]
    simp only [Finset.sum_add_distrib]
    have hmid : ∑ k ∈ Finset.range n, ∑ m ∈ Finset.range n,
        (if k + m = n - 1 then g k m else 0) = b ^ (n - 1) * mid := by
      rw [Finset.mul_sum]
      refine Finset.sum_congr rfl fun k hk => ?_
      have hk := Finset.mem_range.mp hk
      have hc' : ∀ m, (k + m = n - 1) ↔ (m = n - 1 - k) := fun m => by omega
      simp only [hc']
      rw [Finset.sum_ite_eq' (Finset.range n) (n - 1 - k) (g k),
        if_pos (Finset.mem_range.mpr (by omega))]
      simp only [g]
      rw [show k + (n - 1 - k) = n - 1 by omega]
      ring
    have hhigh : ∑ k ∈ Finset.range n, ∑ m ∈ Finset.range n,
        (if n - 1 < k + m then g k m else 0) = b ^ (n - 1) * (b * high) := by
      rw [← mul_assoc, ← pow_succ, show n - 1 + 1 = n by omega, Finset.mul_sum]
      refine Finset.sum_congr rfl fun k _ => ?_
      rw [Finset.mul_sum]
      refine Finset.sum_congr rfl fun m _ => ?_
      split_ifs with h
      · simp only [g]
        rw [show k + m = n + (k + m - n) by omega, pow_add, show n + (k + m - n) - n =
          k + m - n by omega]
        ring
      · simp
    rw [hmid, hhigh]
    ring
  -- the low part is below `b ^ (n - 1)`
  have hlow : low < b ^ (n - 1) := by
    have hle : low * b ≤ (∑ k ∈ Finset.range n, ∑ m ∈ Finset.range n, x k * y m) *
        b ^ (n - 1) := by
      rw [Finset.sum_mul, Finset.sum_mul]
      refine Finset.sum_le_sum fun k _ => ?_
      rw [Finset.sum_mul, Finset.sum_mul]
      refine Finset.sum_le_sum fun m _ => ?_
      split_ifs with h
      · simp only [g]
        rw [mul_assoc, ← pow_succ]
        exact Nat.mul_le_mul_left _ (Nat.pow_le_pow_right hb (by omega))
      · simp
    have hpos : 0 < b ^ (n - 1) := by positivity
    by_contra hcon
    push Not at hcon
    have := Nat.mul_le_mul_right b hcon
    have h2 := Nat.mul_lt_mul_of_pos_right htot hpos
    nlinarith
  have hmidlt : mid < b := by
    refine lt_of_le_of_lt ?_ htot
    refine Finset.sum_le_sum fun k hk => ?_
    exact Finset.single_le_sum (f := fun m => x k * y m) (fun _ _ => Nat.zero_le _)
      (Finset.mem_range.mpr (by have := Finset.mem_range.mp hk; omega))
  rw [hsplit, Nat.add_mul_div_left _ _ (by positivity), Nat.div_eq_of_lt hlow, Nat.zero_add,
    Nat.add_mul_mod_self_left, Nat.mod_eq_of_lt hmidlt]

end Digits

/-! ### Packed vectors -/

/-- Digit `k` of `N` in base `2 ^ S`. -/
def digit (S N k : ℕ) : ℕ := N >>> (S * k) % 2 ^ S

theorem digit_eq (S N k : ℕ) : digit S N k = N / (2 ^ S) ^ k % 2 ^ S := by
  rw [digit, Nat.shiftRight_eq_div_pow, pow_mul]

/-- Block `i` of `n` digits of `P` (digits `n i` to `n i + n - 1`), as a number. -/
def blk (S n P i : ℕ) : ℕ := P >>> (S * n * i) % 2 ^ (S * n)

theorem blk_eq (S n P i : ℕ) : blk S n P i = P / (2 ^ S) ^ (n * i) % (2 ^ S) ^ n := by
  rw [blk, Nat.shiftRight_eq_div_pow, ← pow_mul, ← pow_mul, mul_assoc]

theorem blk_lt (S n P i : ℕ) : blk S n P i < (2 ^ S) ^ n := by
  rw [blk_eq]
  exact Nat.mod_lt _ (by positivity)

theorem digit_blk (S n P i : ℕ) {k : ℕ} (hk : k < n) :
    digit S (blk S n P i) k = digit S P (n * i + k) := by
  rw [digit_eq, digit_eq, blk_eq, mod_pow_div_pow_mod _ hk, Nat.div_div_eq_div_mul, ← pow_add]

/-- The entries of `l`, reduced modulo `p`, as the base-`2 ^ S` digits of one number, the first
entry lowest. -/
def packMod (p S : ℕ) : List ℕ → ℕ
  | [] => 0
  | a :: l => a % p + (packMod p S l <<< S)

theorem packMod_eq (p S : ℕ) (l : List ℕ) :
    packMod p S l = ∑ k ∈ Finset.range l.length, l.getD k 0 % p * (2 ^ S) ^ k := by
  induction l with
  | nil => simp [packMod]
  | cons a l ih =>
    rw [packMod, ih, Nat.shiftLeft_eq, List.length_cons, Finset.sum_range_succ', Finset.sum_mul]
    simp only [List.getD_cons_succ, List.getD_cons_zero, pow_zero, mul_one, pow_succ]
    rw [Nat.add_comm]
    congr 1
    exact Finset.sum_congr rfl fun k _ => by ring

theorem digit_packMod {p S : ℕ} (hp : 0 < p) (hpS : p ≤ 2 ^ S) (l : List ℕ) (k : ℕ) :
    digit S (packMod p S l) k = l.getD k 0 % p := by
  rw [digit_eq, packMod_eq, sum_div_pow_mod _ (fun j _ => lt_of_lt_of_le (Nat.mod_lt _ hp) hpS)]
  split_ifs with h
  · rfl
  · rw [List.getD_eq_default _ _ (by omega), Nat.zero_mod]

/-- `∑ⱼ (f j mod p) (2 ^ S) ^ j` for `j < n`: the residues of `f` packed as `n` digits. -/
def packFn (p S : ℕ) (f : ℕ → ℕ) : ℕ → ℕ
  | 0 => 0
  | n + 1 => packFn p S f n + (f n % p) <<< (S * n)

theorem packFn_eq (p S : ℕ) (f : ℕ → ℕ) (n : ℕ) :
    packFn p S f n = ∑ j ∈ Finset.range n, f j % p * (2 ^ S) ^ j := by
  induction n with
  | zero => rfl
  | succ n ih => rw [packFn, ih, Finset.sum_range_succ, Nat.shiftLeft_eq, pow_mul]

theorem packFn_lt {p S : ℕ} (hp : 0 < p) (hpS : p ≤ 2 ^ S) (f : ℕ → ℕ) (n : ℕ) :
    packFn p S f n < (2 ^ S) ^ n := by
  rw [packFn_eq]
  exact sum_lt _ fun j _ => lt_of_lt_of_le (Nat.mod_lt _ hp) hpS

theorem digit_packFn {p S : ℕ} (hp : 0 < p) (hpS : p ≤ 2 ^ S) (f : ℕ → ℕ) {n k : ℕ}
    (hk : k < n) : digit S (packFn p S f n) k = f k % p := by
  rw [digit_eq, packFn_eq, sum_div_pow_mod _ (fun j _ => lt_of_lt_of_le (Nat.mod_lt _ hp) hpS),
    if_pos hk]

/-- A packed vector of `n` residues modulo `p`: below `(2 ^ S) ^ n`, every digit below `p`. -/
def Good (p S n a : ℕ) : Prop := a < (2 ^ S) ^ n ∧ ∀ k < n, digit S a k < p

/-- The vector over `ZMod p` that a packed vector stands for. -/
def vecP (p S n a : ℕ) : Fin n → ZMod p := fun k => pf p (digit S a k.val)

/-- Digit `n - 1` of the product `a * c`: with `a` and `c` packed, the sum of the products of
the digits of `a` with those of `c` read backwards. -/
def kron (S n a c : ℕ) : ℕ := (a * c) >>> (S * (n - 1)) % 2 ^ S

theorem kron_spec {p S n a c : ℕ} (hn : 0 < n) (hb : n * n * (p * p) ≤ 2 ^ S)
    (ha : Good p S n a) (hc : Good p S n c) :
    kron S n a c = ∑ k ∈ Finset.range n, digit S a k * digit S c (n - 1 - k) := by
  rw [kron, Nat.shiftRight_eq_div_pow, pow_mul]
  rw [kron_eq hn hb ha.1 hc.1 (fun k hk => by rw [← digit_eq]; exact ha.2 k hk)
    (fun k hk => by rw [← digit_eq]; exact hc.2 k hk)]
  simp only [digit_eq]

/-- The bound under which no digit of a product of packed vectors overflows. -/
def boundOk (p S n : ℕ) : Bool := Nat.ble (n * n * (p * p)) (2 ^ S)

theorem boundOk_spec {p S n : ℕ} (h : boundOk p S n = true) : n * n * (p * p) ≤ 2 ^ S :=
  Nat.le_of_ble_eq_true h

theorem le_of_boundOk {p S n : ℕ} (hn : 0 < n) (h : boundOk p S n = true) :
    p ≤ 2 ^ S := by
  have := boundOk_spec h
  calc p ≤ p * p := Nat.le_mul_self p
    _ ≤ n * n * (p * p) := Nat.le_mul_of_pos_left _ (Nat.mul_pos hn hn)
    _ ≤ 2 ^ S := this

/-! ### Matrices -/

/-- Blocks `i, i + 1, …, i + m - 1` of `P`: the rows of a packed matrix. -/
def blocks (S n P : ℕ) : ℕ → ℕ → List ℕ
  | _, 0 => []
  | i, m + 1 => blk S n P i :: blocks S n P (i + 1) m

theorem length_blocks (S n P i m : ℕ) : (blocks S n P i m).length = m := by
  induction m generalizing i with
  | zero => rfl
  | succ m ih => simp [blocks, ih]

theorem blocks_getD (S n P : ℕ) {i m k : ℕ} (hk : k < m) :
    (blocks S n P i m).getD k 0 = blk S n P (i + k) := by
  induction m generalizing i k with
  | zero => omega
  | succ m ih =>
    cases k with
    | zero => simp [blocks]
    | succ k =>
      simp only [blocks, List.getD_cons_succ]
      rw [ih (by omega)]
      congr 1
      omega

/-- An `n × n` matrix over `ZMod p` whose row `i` is the packed vector `R.getD i 0`. -/
def ofPacked (p S n : ℕ) (R : List ℕ) : Matrix (Fin n) (Fin n) (ZMod p) :=
  Matrix.of fun i j => pf p (digit S (R.getD i.val 0) j.val)

/-- An `n × n` matrix over `ZMod p` given column by column, each column reversed: entry `(k, j)`
is `Wr[j n + (n - 1 - k)]`. This is the form of an inverse witness. -/
def revCols (p n : ℕ) (Wr : List ℕ) : Matrix (Fin n) (Fin n) (ZMod p) :=
  Matrix.of fun k j => pf p (Wr.getD (j.val * n + (n - 1 - k.val)) 0)

/-- Row `i` against column `j` of the witness, for `j` below the counter. -/
def cellsOk (p S n a C i : ℕ) : ℕ → Bool
  | 0 => true
  | j + 1 => (kron S n a (blk S n C j) % p == if i = j then 1 else 0) && cellsOk p S n a C i j

/-- Every listed row against every column of the witness: the identity modulo `p`. -/
def rowsOk (p S n C : ℕ) : List ℕ → ℕ → Bool
  | [], _ => true
  | a :: as, i => cellsOk p S n a C i n && rowsOk p S n C as (i + 1)

theorem cellsOk_spec {p S n a C i m : ℕ} (h : cellsOk p S n a C i m = true) {j : ℕ}
    (hj : j < m) : kron S n a (blk S n C j) % p = if i = j then 1 else 0 := by
  induction m with
  | zero => omega
  | succ m ih =>
    simp only [cellsOk, Bool.and_eq_true, beq_iff_eq] at h
    rcases Nat.lt_succ_iff_lt_or_eq.mp hj with hj | rfl
    · exact ih h.2 hj
    · exact h.1

theorem rowsOk_spec {p S n C : ℕ} {R : List ℕ} {i₀ : ℕ} (h : rowsOk p S n C R i₀ = true)
    {k j : ℕ} (hk : k < R.length) (hj : j < n) :
    kron S n (R.getD k 0) (blk S n C j) % p = if i₀ + k = j then 1 else 0 := by
  induction R generalizing i₀ k with
  | nil => simp at hk
  | cons a R ih =>
    simp only [rowsOk, Bool.and_eq_true] at h
    cases k with
    | zero => simpa using cellsOk_spec h.1 hj
    | succ k =>
      simp only [List.getD_cons_succ]
      rw [ih h.2 (by simpa using hk)]
      congr 1
      simp only [eq_iff_iff]
      omega

theorem good_blk {p S n : ℕ} (hp : 0 < p) (hpS : p ≤ 2 ^ S) (l : List ℕ) (i : ℕ) :
    Good p S n (blk S n (packMod p S l) i) := by
  refine ⟨blk_lt _ _ _ _, fun k hk => ?_⟩
  rw [digit_blk _ _ _ _ hk, digit_packMod hp hpS]
  exact Nat.mod_lt _ hp

/-- **An accepted packed product.** If `rowsOk` accepts the `n` rows `R` against the witness
`Wr`, then `Wr`, read column by column and reversed, is a right inverse of the rows. -/
theorem ofPacked_mul_revCols {p S n : ℕ} [NeZero n] [NeZero p] {R Wr : List ℕ}
    (hb : boundOk p S n = true) (hR : R.length = n) (hgood : ∀ i < n, Good p S n (R.getD i 0))
    (h : rowsOk p S n (packMod p S Wr) R 0 = true) : ofPacked p S n R * revCols p n Wr = 1 := by
  have hn : 0 < n := Nat.pos_of_ne_zero (NeZero.ne n)
  have hp : 0 < p := Nat.pos_of_ne_zero (NeZero.ne p)
  have hpS := le_of_boundOk hn hb
  ext i j
  have hk := rowsOk_spec h (k := i.val) (by rw [hR]; exact i.isLt) j.isLt
  rw [kron_spec hn (boundOk_spec hb) (hgood i.val i.isLt) (good_blk hp hpS Wr j.val)] at hk
  rw [Matrix.mul_apply, Matrix.one_apply]
  have hcast : (((∑ k ∈ Finset.range n, digit S (R.getD i.val 0) k *
      digit S (blk S n (packMod p S Wr) j.val) (n - 1 - k)) : ℕ) : ZMod p) =
      if i = j then 1 else 0 := by
    rw [← ZMod.natCast_mod, hk, zero_add]
    have hval : (i = j) ↔ (i.val = j.val) := Fin.val_inj.symm
    simp only [hval]
    split_ifs <;> simp
  rw [← hcast, Nat.cast_sum,
    ← Fin.sum_univ_eq_sum_range (fun k => ((digit S (R.getD i.val 0) k *
      digit S (blk S n (packMod p S Wr) j.val) (n - 1 - k) : ℕ) : ZMod p)) n]
  refine Finset.sum_congr rfl fun k _ => ?_
  rw [digit_blk _ _ _ _ (by omega), digit_packMod hp hpS]
  simp only [ofPacked, revCols, Matrix.of_apply, pf, Nat.cast_mul, ZMod.natCast_mod]
  congr 3
  ring

theorem ofPacked_blocks {p S n : ℕ} (hp : 0 < p) (hpS : p ≤ 2 ^ S) (E : List ℕ) :
    ofPacked p S n (blocks S n (packMod p S E) 0 n) = pfMat p n E := by
  ext i j
  simp only [ofPacked, pfMat, Matrix.of_apply, pf]
  rw [blocks_getD _ _ _ i.isLt, digit_blk _ _ _ _ j.isLt, digit_packMod hp hpS,
    ZMod.natCast_mod, Nat.zero_add, mul_comm n]

/-- **The inverse check.** `E` (row-major) times `Wr` (columns, each reversed) is the identity
modulo `p`, entry by entry, each entry one multiplication of packed numbers. -/
def checkInverse (p n S : ℕ) (E Wr : List ℕ) : Bool :=
  boundOk p S n && rowsOk p S n (packMod p S Wr) (blocks S n (packMod p S E) 0 n) 0

/-- **An accepted inverse witness.** -/
theorem mul_revCols_eq_one {p n S : ℕ} [NeZero n] [NeZero p] {E Wr : List ℕ}
    (h : checkInverse p n S E Wr = true) : pfMat p n E * revCols p n Wr = 1 := by
  simp only [checkInverse, Bool.and_eq_true] at h
  have hn : 0 < n := Nat.pos_of_ne_zero (NeZero.ne n)
  have hp : 0 < p := Nat.pos_of_ne_zero (NeZero.ne p)
  have hpS := le_of_boundOk hn h.1
  rw [← ofPacked_blocks hp hpS E]
  exact ofPacked_mul_revCols h.1 (length_blocks _ _ _ _ _)
    (fun i hi => by rw [blocks_getD _ _ _ hi]; exact good_blk hp hpS E _) h.2

/-- A matrix with an accepted inverse witness has a nonzero determinant. -/
theorem det_ne_zero_of_checkInverse {p n S : ℕ} [Fact p.Prime] [NeZero n] {E Wr : List ℕ}
    (h : checkInverse p n S E Wr = true) : (pfMat p n E).det ≠ 0 :=
  NatMatrix.det_ne_zero_of_mul_eq_one (mul_revCols_eq_one h)

/-! ### Vector-matrix products -/

/-- `∑ₖ vₖ · (row k of P)` for `k < m`, digit by digit without reduction. -/
def lincomb (S n P v : ℕ) : ℕ → ℕ
  | 0 => 0
  | k + 1 => lincomb S n P v k + digit S v k * blk S n P k

/-- The packed vector `v * M` modulo `p`, for the packed matrix `P` of `M`. -/
def vecMulP (p S n P v : ℕ) : ℕ := packFn p S (digit S (lincomb S n P v n)) n

theorem lincomb_eq (S n P v m : ℕ) :
    lincomb S n P v m = ∑ k ∈ Finset.range m, digit S v k * blk S n P k := by
  induction m with
  | zero => rfl
  | succ m ih => rw [lincomb, ih, Finset.sum_range_succ]

theorem digit_lincomb {p S n : ℕ} (hn : 0 < n) (hp : 0 < p) (hb : n * n * (p * p) ≤ 2 ^ S)
    {v : ℕ} (hv : Good p S n v) (l : List ℕ) {j : ℕ} (hj : j < n) :
    digit S (lincomb S n (packMod p S l) v n) j =
      ∑ k ∈ Finset.range n, digit S v k * (l.getD (n * k + j) 0 % p) := by
  have hpS : p ≤ 2 ^ S := le_of_boundOk hn (Nat.ble_eq_true_of_le hb)
  have hX : 0 < 2 ^ S := by positivity
  set c : ℕ → ℕ := fun j => ∑ k ∈ Finset.range n, digit S v k * (l.getD (n * k + j) 0 % p)
  have hrow : ∀ k, blk S n (packMod p S l) k =
      ∑ j ∈ Finset.range n, l.getD (n * k + j) 0 % p * (2 ^ S) ^ j := by
    intro k
    conv_lhs => rw [eq_sum_digits hX (blk_lt S n (packMod p S l) k)]
    refine Finset.sum_congr rfl fun j hj => ?_
    rw [← digit_eq, digit_blk _ _ _ _ (Finset.mem_range.mp hj), digit_packMod hp hpS]
  have hsum : lincomb S n (packMod p S l) v n = ∑ j ∈ Finset.range n, c j * (2 ^ S) ^ j := by
    rw [lincomb_eq]
    simp only [hrow, Finset.mul_sum, c, Finset.sum_mul]
    rw [Finset.sum_comm]
    exact Finset.sum_congr rfl fun j _ => Finset.sum_congr rfl fun k _ => by ring
  have hc : ∀ j < n, c j < 2 ^ S := by
    intro j _
    calc c j < ∑ k ∈ Finset.range n, p * p := by
          apply Finset.sum_lt_sum_of_nonempty (Finset.nonempty_range_iff.mpr (by omega))
          intro k hk
          exact Nat.mul_lt_mul'' (hv.2 k (Finset.mem_range.mp hk)) (Nat.mod_lt _ hp)
      _ = n * (p * p) := by simp
      _ ≤ n * n * (p * p) := Nat.mul_le_mul_right _ (Nat.le_mul_self n)
      _ ≤ 2 ^ S := hb
  rw [digit_eq, hsum, sum_div_pow_mod c hc, if_pos hj]

theorem good_packFn {p S : ℕ} (hp : 0 < p) (hpS : p ≤ 2 ^ S) (f : ℕ → ℕ) (n : ℕ) :
    Good p S n (packFn p S f n) :=
  ⟨packFn_lt hp hpS f n, fun k hk => by rw [digit_packFn hp hpS f hk]; exact Nat.mod_lt _ hp⟩

theorem good_vecMulP {p S n P v : ℕ} (hp : 0 < p) (hpS : p ≤ 2 ^ S) :
    Good p S n (vecMulP p S n P v) :=
  good_packFn hp hpS _ n

/-- **The packed vector-matrix product.** -/
theorem vecP_vecMulP {p S n : ℕ} (hn : 0 < n) (hp : 0 < p) (hb : n * n * (p * p) ≤ 2 ^ S)
    {v : ℕ} (hv : Good p S n v) (E : List ℕ) :
    vecP p S n (vecMulP p S n (packMod p S E) v) = vecMul (vecP p S n v) (pfMat p n E) := by
  have hpS : p ≤ 2 ^ S := le_of_boundOk hn (Nat.ble_eq_true_of_le hb)
  funext j
  simp only [vecP, vecMulP, pf]
  rw [digit_packFn hp hpS _ j.isLt, ZMod.natCast_mod, digit_lincomb hn hp hb hv E j.isLt,
    vecMul, dotProduct, Nat.cast_sum,
    ← Fin.sum_univ_eq_sum_range (fun k => ((digit S v k * (E.getD (n * k + j.val) 0 % p) : ℕ) :
      ZMod p)) n]
  refine Finset.sum_congr rfl fun k _ => ?_
  simp only [vecP, pfMat, pf, Matrix.of_apply, Nat.cast_mul, ZMod.natCast_mod, mul_comm n]

/-- The packed unit vector `e_c`. -/
def unitP (S c : ℕ) : ℕ := 1 <<< (S * c)

theorem digit_unitP {S c : ℕ} (hS : 2 ≤ 2 ^ S) (k : ℕ) :
    digit S (unitP S c) k = if k = c then 1 else 0 := by
  have h1 : unitP S c = ∑ j ∈ Finset.range (c + 1), (if j = c then 1 else 0) * (2 ^ S) ^ j := by
    rw [unitP, Nat.shiftLeft_eq, one_mul, pow_mul, Finset.sum_range_succ]
    simp only [if_true, one_mul]
    rw [Finset.sum_eq_zero fun j hj => by simp [(Finset.mem_range.mp hj).ne], zero_add]
  rw [digit_eq, h1, sum_div_pow_mod _ (fun j _ => by split_ifs <;> omega)]
  split_ifs <;> omega

theorem good_unitP {p S n c : ℕ} (hp : 2 ≤ p) (hpS : p ≤ 2 ^ S) (hc : c < n) :
    Good p S n (unitP S c) := by
  refine ⟨?_, fun k _ => ?_⟩
  · rw [unitP, Nat.shiftLeft_eq, one_mul, pow_mul]
    exact Nat.pow_lt_pow_right (by omega) hc
  · rw [digit_unitP (by omega)]
    split_ifs <;> omega

theorem vecP_unitP {p S n c : ℕ} [NeZero n] (hS : 2 ≤ 2 ^ S) (hc : c < n) :
    vecP p S n (unitP S c) = Pi.single (Fin.ofNat n c) 1 := by
  funext k
  simp only [vecP, pf, digit_unitP hS, Pi.single_apply]
  have : (k = Fin.ofNat n c) ↔ k.val = c := by
    rw [Fin.ext_iff, Fin.val_ofNat, Nat.mod_eq_of_lt hc]
  by_cases h : k.val = c
  · rw [if_pos h, if_pos (this.mpr h)]; simp
  · rw [if_neg h, if_neg (mt this.mp h)]; simp

/-! ### The masked rows of the powers, packed -/

/-- The packed rows `v Mʲ` for every `v` in `cur` and every `j < L`, power by power. -/
def layersP (p S n P : ℕ) : List ℕ → ℕ → List ℕ
  | _, 0 => []
  | cur, L + 1 => cur ++ layersP p S n P (cur.map (vecMulP p S n P)) L

/-- The packed rows `eᵢ Mʲ`, `j < L`, `i` masked, in the order of `j`, then of `i`. -/
def obsStackP (p n S : ℕ) (E mask : List ℕ) (L : ℕ) : List ℕ :=
  layersP p S n (packMod p S E) ((NatMatrix.maskPositions n mask).map (unitP S)) L

/-- **The observability check, packed.** The rows of `obsStackP` at the `n` indices `sel`
times the witness `Wr` (columns, reversed) is the identity modulo `p`. -/
def checkObs (p n S : ℕ) (E mask : List ℕ) (L : ℕ) (sel Wr : List ℕ) : Bool :=
  boundOk p S n && Nat.beq sel.length n &&
    rowsOk p S n (packMod p S Wr) (sel.map fun s => (obsStackP p n S E mask L).getD s 0) 0

/-- `v` packed backwards: digit `m` is `v[n - 1 - m] mod p`. -/
def revP (p S n : ℕ) (v : List ℕ) : ℕ := packFn p S (fun m => v.getD (n - 1 - m) 0) n

/-- **The short-bypass check, packed.** Every row of `obsStackP` is orthogonal to `v` modulo
`p`. -/
def checkOrth (p n S : ℕ) (E mask : List ℕ) (L : ℕ) (v : List ℕ) : Bool :=
  boundOk p S n && (obsStackP p n S E mask L).all fun r => kron S n r (revP p S n v) % p == 0

theorem layersP_complete (p S n P : ℕ) :
    ∀ (L : ℕ) (cur : List ℕ) (j : ℕ), j < L → ∀ v ∈ cur,
      (vecMulP p S n P)^[j] v ∈ layersP p S n P cur L
  | 0, _, _, hj, _, _ => absurd hj (Nat.not_lt_zero _)
  | _ + 1, _, 0, _, _, hv => List.mem_append_left _ hv
  | L + 1, cur, j + 1, hj, v, hv => by
    rw [layersP, Function.iterate_succ_apply]
    exact List.mem_append_right _
      (layersP_complete p S n P L _ j (by omega) _ (List.mem_map_of_mem hv))

/-- **The packed check of a block structure.** `E` (row-major `t × t`) agrees modulo `p` with
`circ(2 M₄, M₄, …, M₄)` for `M₄` row-major in `M4`, compared as two packed numbers. -/
def checkBlocks (p t S : ℕ) (E M4 : List ℕ) : Bool :=
  boundOk p S t && Nat.beq (packMod p S E)
    (packFn p S (fun m => (if m / t / 4 = m % t / 4 then 2 else 1) *
      digit S (packMod p S M4) (m / t % 4 * 4 + m % t % 4)) (t * t))

end Packed

namespace Hades

open NatMatrix Packed

/-- A packed row of the stack, with what the checks need to know about it. -/
theorem layersP_sound (p n S : ℕ) [Fact p.Prime] [NeZero n] (E : List ℕ) (P : Finset (Fin n))
    (hb : n * n * (p * p) ≤ 2 ^ S) :
    ∀ (L j₀ : ℕ) (cur : List ℕ),
      (∀ v ∈ cur, Good p S n v ∧ ∃ i ∈ P, vecP p S n v = obsRow (pfMat p n E) i j₀) →
      ∀ r ∈ layersP p S n (packMod p S E) cur L,
        Good p S n r ∧ ∃ j < j₀ + L, ∃ i ∈ P, vecP p S n r = obsRow (pfMat p n E) i j
  | 0, _, _, _, r, hr => by simp [layersP] at hr
  | L + 1, j₀, cur, hcur, r, hr => by
    have hn : 0 < n := Nat.pos_of_ne_zero (NeZero.ne n)
    have hp : 0 < p := (Fact.out : p.Prime).pos
    have hpS : p ≤ 2 ^ S := le_of_boundOk hn (Nat.ble_eq_true_of_le hb)
    rw [layersP, List.mem_append] at hr
    rcases hr with hr | hr
    · obtain ⟨hg, i, hi, he⟩ := hcur r hr
      exact ⟨hg, j₀, by omega, i, hi, he⟩
    · obtain ⟨hg, j, hj, i, hi, he⟩ := layersP_sound p n S E P hb L (j₀ + 1) _ (fun v hv => by
        obtain ⟨u, hu, rfl⟩ := List.mem_map.mp hv
        obtain ⟨hg, i, hi, he⟩ := hcur u hu
        refine ⟨good_vecMulP hp hpS, i, hi, ?_⟩
        rw [vecP_vecMulP hn hp hb hg, he, obsRow]) r hr
      exact ⟨hg, j, by omega, i, hi, he⟩

theorem obsStackP_sound {p n S : ℕ} [Fact p.Prime] [NeZero n] (E mask : List ℕ) (L : ℕ)
    (hb : n * n * (p * p) ≤ 2 ^ S) :
    ∀ r ∈ obsStackP p n S E mask L, Good p S n r ∧ ∃ j < L, ∃ i ∈
      (Finset.univ.filter fun i : Fin n => maskBits n mask i = true),
        vecP p S n r = obsRow (pfMat p n E) i j := by
  have hn : 0 < n := Nat.pos_of_ne_zero (NeZero.ne n)
  have hp2 : 2 ≤ p := (Fact.out : p.Prime).two_le
  have hpS : p ≤ 2 ^ S := le_of_boundOk hn (Nat.ble_eq_true_of_le hb)
  intro r hr
  obtain ⟨hg, j, hj, i, hi, he⟩ := layersP_sound p n S E _ hb L 0 _ (fun v hv => by
    obtain ⟨c, hc, rfl⟩ := List.mem_map.mp hv
    have hcn : c < n := by
      simp only [maskPositions, List.mem_filter, List.mem_range] at hc
      exact hc.1
    exact ⟨good_unitP hp2 hpS hcn, Fin.ofNat n c, mem_mask_of_mem_maskPositions hc,
      by rw [vecP_unitP (by omega) hcn]; rfl⟩) r hr
  exact ⟨hg, j, by omega, i, hi, he⟩

/-- **The observability certificate, packed.** If `Packed.checkObs` accepts, the internal matrix
is observable from the mask in `L` steps. -/
theorem observable_of_checkObsP {p n S : ℕ} [Fact p.Prime] [NeZero n] {E mask : List ℕ} {L : ℕ}
    {sel Wr : List ℕ} (h : Packed.checkObs p n S E mask L sel Wr = true) :
    Observable (pfMat p n E) (Finset.univ.filter fun i : Fin n => maskBits n mask i = true) L := by
  simp only [Packed.checkObs, Bool.and_eq_true, Nat.beq_eq] at h
  obtain ⟨⟨hbo, hlen⟩, hrows⟩ := h
  have hb := boundOk_spec hbo
  have hS := obsStackP_sound (S := S) E mask L hb
  set A := sel.map fun s => (obsStackP p n S E mask L).getD s 0
  have hrow : ∀ k, A.getD k 0 = 0 ∨ A.getD k 0 ∈ obsStackP p n S E mask L := by
    intro k
    rw [List.getD_eq_getElem?_getD]
    cases hk : A[k]? with
    | none => simp
    | some x =>
      obtain ⟨s, _, rfl⟩ := List.mem_map.mp (List.mem_of_getElem? hk)
      simp only [Option.getD_some]
      rw [List.getD_eq_getElem?_getD]
      cases hs : (obsStackP p n S E mask L)[s]? with
      | none => simp
      | some y => exact Or.inr (by simpa using List.mem_of_getElem? hs)
  have hgood : ∀ i < n, Good p S n (A.getD i 0) := by
    intro i _
    rcases hrow i with h0 | hm
    · rw [h0]
      exact ⟨by positivity, fun k _ => by
        rw [digit_eq, Nat.zero_div, Nat.zero_mod]; exact (Fact.out : p.Prime).pos⟩
    · exact (hS _ hm).1
  have : NeZero p := ⟨(Fact.out : p.Prime).ne_zero⟩
  have hW : revCols p n Wr * ofPacked p S n A = 1 :=
    mul_eq_one_comm.mp (ofPacked_mul_revCols hbo (by simp [A, hlen]) hgood hrows)
  intro d hd
  have hRd : (ofPacked p S n A).mulVec d = 0 := by
    funext k
    have hk : (ofPacked p S n A).mulVec d k = vecP p S n (A.getD k.val 0) ⬝ᵥ d := rfl
    rw [hk, Pi.zero_apply]
    rcases hrow k.val with h0 | hm
    · rw [h0]
      simp [vecP, pf, dotProduct, digit_eq]
    · obtain ⟨_, j, hj, i, hi, he⟩ := hS _ hm
      rw [he, obsRow_dotProduct]
      exact hd j hj i hi
  calc d = (revCols p n Wr * ofPacked p S n A).mulVec d := by rw [hW, Matrix.one_mulVec]
    _ = 0 := by rw [← Matrix.mulVec_mulVec, hRd, Matrix.mulVec_zero]

/-- **The short-bypass certificate, packed.** If `Packed.checkOrth` accepts, every power
`M ^ j`, `j < L`, keeps `v` at zero on the mask. -/
theorem powers_zero_of_checkOrthP {p n S : ℕ} [Fact p.Prime] [NeZero n] {E mask : List ℕ}
    {L : ℕ} {v : List ℕ} (h : Packed.checkOrth p n S E mask L v = true) :
    ∀ j < L, ∀ i ∈ (Finset.univ.filter fun i : Fin n => maskBits n mask i = true),
      (((pfMat p n E) ^ j).mulVec (pfVec p n v)) i = 0 := by
  simp only [Packed.checkOrth, Bool.and_eq_true] at h
  obtain ⟨hbo, hall⟩ := h
  have hb := boundOk_spec hbo
  have hn : 0 < n := Nat.pos_of_ne_zero (NeZero.ne n)
  have hp : 0 < p := (Fact.out : p.Prime).pos
  have hp2 : 2 ≤ p := (Fact.out : p.Prime).two_le
  have hpS : p ≤ 2 ^ S := le_of_boundOk hn hbo
  intro j hj i hi
  have hc := mem_maskPositions_of_mem_mask hi
  have hmem := layersP_complete p S n (packMod p S E) L _ j hj (unitP S i.val)
    (List.mem_map_of_mem hc)
  -- the row is `e_i M^j`
  have hrow : ∀ m, Good p S n ((vecMulP p S n (packMod p S E))^[m] (unitP S i.val)) ∧
      vecP p S n ((vecMulP p S n (packMod p S E))^[m] (unitP S i.val)) =
        obsRow (pfMat p n E) i m := by
    intro m
    induction m with
    | zero =>
      refine ⟨good_unitP hp2 hpS i.isLt, ?_⟩
      simp only [Function.iterate_zero, id]
      rw [vecP_unitP (by omega) i.isLt]
      have hi' : Fin.ofNat n i.val = i := Fin.ext (by simp)
      rw [hi']
      rfl
    | succ m ih =>
      rw [Function.iterate_succ_apply']
      exact ⟨good_vecMulP hp hpS, by rw [vecP_vecMulP hn hp hb ih.1, ih.2, obsRow]⟩
  have hd := List.all_eq_true.mp hall _ hmem
  rw [beq_iff_eq] at hd
  obtain ⟨hg, he⟩ := hrow j
  have hgv : Good p S n (revP p S n v) := good_packFn hp hpS _ n
  rw [kron_spec hn hb hg hgv] at hd
  rw [← obsRow_dotProduct, ← he]
  have : vecP p S n ((vecMulP p S n (packMod p S E))^[j] (unitP S i.val)) ⬝ᵥ pfVec p n v =
      (((∑ k ∈ Finset.range n, digit S ((vecMulP p S n (packMod p S E))^[j] (unitP S i.val)) k *
        digit S (revP p S n v) (n - 1 - k)) : ℕ) : ZMod p) := by
    rw [Nat.cast_sum, dotProduct, ← Fin.sum_univ_eq_sum_range (fun k => ((digit S
      ((vecMulP p S n (packMod p S E))^[j] (unitP S i.val)) k * digit S (revP p S n v)
        (n - 1 - k) : ℕ) : ZMod p)) n]
    refine Finset.sum_congr rfl fun k _ => ?_
    rw [revP, digit_packFn hp hpS _ (by omega), show n - 1 - (n - 1 - k.val) = k.val by omega]
    simp [vecP, pfVec, pf]
  rw [this]
  exact NatMatrix.cast_eq_zero_of_mod hd

/-- **The block structure, packed.** -/
theorem pfMat_eq_poseidon2External_of_checkP {p t S : ℕ} [NeZero p] {E M4 : List ℕ}
    (h : Packed.checkBlocks p t S E M4 = true) :
    pfMat p t E = poseidon2External t (pfMat p 4 M4) := by
  simp only [Packed.checkBlocks, Bool.and_eq_true, Nat.beq_eq] at h
  obtain ⟨hbo, heq⟩ := h
  have hp : 0 < p := Nat.pos_of_ne_zero (NeZero.ne p)
  ext i j
  have ht : 0 < t := lt_of_le_of_lt (Nat.zero_le _) i.isLt
  have hpS : p ≤ 2 ^ S := le_of_boundOk ht hbo
  have hm : i.val * t + j.val < t * t := by
    calc i.val * t + j.val < i.val * t + t := by omega
      _ = (i.val + 1) * t := by ring
      _ ≤ t * t := Nat.mul_le_mul_right _ i.isLt
  have hd := congrArg (fun N => digit S N (i.val * t + j.val)) heq
  simp only [digit_packMod hp hpS, digit_packFn hp hpS _ hm] at hd
  have hdiv : (i.val * t + j.val) / t = i.val := by
    rw [Nat.add_comm, Nat.add_mul_div_right _ _ ht, Nat.div_eq_of_lt j.isLt, zero_add]
  have hmod : (i.val * t + j.val) % t = j.val := by
    rw [Nat.add_comm, Nat.add_mul_mod_self_right, Nat.mod_eq_of_lt j.isLt]
  rw [hdiv, hmod] at hd
  simp only [pfMat, poseidon2External, Matrix.of_apply, pf, Fin.val_ofNat]
  rw [← ZMod.natCast_mod, hd, ZMod.natCast_mod, Nat.cast_mul, ZMod.natCast_mod]
  split_ifs <;> simp

end Hades

end Cryptificate
