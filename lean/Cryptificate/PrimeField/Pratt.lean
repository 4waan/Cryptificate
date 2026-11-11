import Mathlib.NumberTheory.LucasPrimality
import Mathlib.Data.List.Prime

/-!
# Pratt certificates for submitted moduli

A request over a prime field names its modulus `p`. Every claim about that field is a statement
about `ZMod p`, and `ZMod p` is a field only when `p` is prime, so the certificate first has to
prove `Nat.Prime p`. Trial division up to `√p` is out of reach for a 64-bit modulus such as
Goldilocks, and tactic proofs (`norm_num`) would put a large proof search into every certificate.
Instead the generator supplies a **Pratt certificate** and the kernel only evaluates one Boolean
function on it with `decide`.

## The certificate

A certificate is a list of steps, each one proving a single number prime from numbers proved
prime by earlier steps. A step for `n` names a base `a` and the factorization
`n - 1 = q₁ ^ k₁ * … * q_m ^ k_m`, where every `qᵢ` was proved prime by an earlier step, and it is
accepted when

* `2 ≤ n` and the product of the listed prime powers is exactly `n - 1`;
* `a ^ (n - 1) ≡ 1 (mod n)`;
* `a ^ ((n - 1) / qᵢ) ≢ 1 (mod n)` for every listed `qᵢ`.

Then `a` has order `n - 1` modulo `n`, so `n` is prime: this is Lucas's test, Mathlib's
`lucas_primality`. The step for `2` lists no factors (`2 - 1` is the empty product) and uses the
base `1`. `prime_of_verify` proves, once for all certificates, that every number accepted this way
is prime. Modular powers are computed by square-and-multiply (`powMod`), so the kernel performs
about `2 log₂ n` multiplications of numbers below `n` for each exponentiation, with the
arbitrary-precision arithmetic it has built in.

## Encoding

Certificates are written into generated Lean files, where a substituted value may only consist of
numerals separated by commas. `decode` reads a flat list of numerals: each step is
`n, a, m, q₁, k₁, …, q_m, k_m`. A malformed list decodes to `none` and is rejected, so the
encoding needs no trust: `prime_of_checkFlat` only uses the decoded steps that `verify` accepted.
-/

set_option autoImplicit false

namespace Cryptificate.Pratt

/-! ### Modular exponentiation -/

/-- `b ^ e % m` by square-and-multiply, with an explicit recursion budget: `fuel ≥ e` is always
enough, and the recursion stops after `log₂ e + 1` steps however large `fuel` is. Recursion is
structural on `fuel`, which the kernel unfolds without well-founded recursion. -/
def powModAux : ℕ → ℕ → ℕ → ℕ → ℕ
  | 0, _, _, m => 1 % m
  | fuel + 1, b, e, m =>
    if e = 0 then 1 % m
    else
      let r := powModAux fuel (b * b % m) (e / 2) m
      if e % 2 = 1 then b * r % m else r

/-- `b ^ e % m` by square-and-multiply. -/
def powMod (b e m : ℕ) : ℕ := powModAux e b e m

theorem powModAux_eq (fuel b e m : ℕ) (h : e ≤ fuel) : powModAux fuel b e m = b ^ e % m := by
  induction fuel generalizing b e with
  | zero =>
    obtain rfl : e = 0 := by omega
    simp [powModAux]
  | succ fuel ih =>
    by_cases he : e = 0
    · subst he
      simp [powModAux]
    · have hhalf : e / 2 ≤ fuel := by omega
      simp only [powModAux, he, if_false, ih _ _ hhalf]
      have hsq : (b * b % m) ^ (e / 2) % m = b ^ (2 * (e / 2)) % m := by
        rw [← Nat.pow_mod, pow_mul, sq]
      rw [hsq]
      rcases Nat.mod_two_eq_zero_or_one e with h2 | h2
      · rw [if_neg (by omega)]
        congr 2
        omega
      · rw [if_pos h2, Nat.mul_mod, Nat.mod_mod, ← Nat.mul_mod, ← pow_succ']
        congr 2
        omega

/-- **Square-and-multiply computes the modular power.** -/
theorem powMod_eq (b e m : ℕ) : powMod b e m = b ^ e % m := powModAux_eq e b e m le_rfl

/-! ### Certificate steps -/

/-- One step of a certificate: `n` is prime, witnessed by the base `a` and the factorization
`n - 1 = ∏ q ^ k` over the pairs `(q, k)` of `factors`. -/
structure Step where
  n : ℕ
  a : ℕ
  factors : List (ℕ × ℕ)
  deriving Repr

/-- The checks of one step, given the numbers already proved prime. -/
def stepOk (known : List ℕ) (s : Step) : Bool :=
  decide (2 ≤ s.n) &&
    (s.factors.map fun f => f.1 ^ f.2).prod == s.n - 1 &&
    s.factors.all (fun f => known.contains f.1) &&
    powMod s.a (s.n - 1) s.n == 1 &&
    s.factors.all (fun f => powMod s.a ((s.n - 1) / f.1) s.n != 1)

/-- Run the steps in order, each with the numbers proved by the earlier ones, and accept `p` when
every step passes and one of them proved `p`. -/
def verify (known : List ℕ) : List Step → ℕ → Bool
  | [], p => known.contains p
  | s :: rest, p => stepOk known s && verify (s.n :: known) rest p

/-- A number that is `1` modulo `n ≥ 2` after reduction is `1` in `ZMod n`, and conversely. -/
theorem natCast_eq_one_iff {n x : ℕ} (hn : 2 ≤ n) : ((x : ℕ) : ZMod n) = 1 ↔ x % n = 1 := by
  rw [← Nat.cast_one, ZMod.natCast_eq_natCast_iff', Nat.one_mod_eq_one.mpr (by omega)]

/-- **One accepted step proves its number prime**, by Lucas's test. -/
theorem prime_of_stepOk {known : List ℕ} (hknown : ∀ q ∈ known, q.Prime) {s : Step}
    (h : stepOk known s = true) : s.n.Prime := by
  simp only [stepOk, Bool.and_eq_true, decide_eq_true_eq, beq_iff_eq, List.all_eq_true,
    List.contains_iff_mem, bne_iff_ne, ne_eq] at h
  obtain ⟨⟨⟨⟨hn, hprod⟩, hfac⟩, hpow⟩, hroots⟩ := h
  have hcast : ∀ e, ((s.a : ZMod s.n) ^ e = 1 ↔ powMod s.a e s.n = 1) := by
    intro e
    rw [powMod_eq, ← Nat.cast_pow, natCast_eq_one_iff hn]
  refine lucas_primality s.n (s.a : ZMod s.n) ((hcast _).mpr hpow) ?_
  intro q hq hdvd
  rw [← hprod] at hdvd
  obtain ⟨x, hx, hqx⟩ := (Prime.dvd_prod_iff hq.prime).mp hdvd
  obtain ⟨f, hf, rfl⟩ := List.mem_map.mp hx
  have hfprime : f.1.Prime := hknown _ (hfac f hf)
  have hqf : q = f.1 := (Nat.prime_dvd_prime_iff_eq hq hfprime).mp (hq.dvd_of_dvd_pow hqx)
  subst hqf
  intro hone
  exact hroots f hf ((hcast _).mp hone)

/-- **Accepted certificates prove primality.** If every number in `known` is prime and `verify`
accepts `p` after running `steps`, then `p` is prime. -/
theorem prime_of_verify (known : List ℕ) (hknown : ∀ q ∈ known, q.Prime) (steps : List Step)
    (p : ℕ) (h : verify known steps p = true) : p.Prime := by
  induction steps generalizing known with
  | nil =>
    simp only [verify, List.contains_iff_mem] at h
    exact hknown p h
  | cons s rest ih =>
    simp only [verify, Bool.and_eq_true] at h
    refine ih (s.n :: known) ?_ h.2
    intro q hq
    rcases List.mem_cons.mp hq with rfl | hq
    · exact prime_of_stepOk hknown h.1
    · exact hknown q hq

/-! ### Flat encoding -/

/-- Read `m` pairs `q, k` from the front of a list. -/
def takePairs : ℕ → List ℕ → Option (List (ℕ × ℕ) × List ℕ)
  | 0, l => some ([], l)
  | m + 1, q :: k :: rest =>
    match takePairs m rest with
    | some (fs, r) => some ((q, k) :: fs, r)
    | none => none
  | _ + 1, _ => none

/-- Read steps `n, a, m, q₁, k₁, …, q_m, k_m` until the list is used up; `fuel` bounds the number
of steps (the length of the list is always enough). -/
def decode : ℕ → List ℕ → Option (List Step)
  | _, [] => some []
  | 0, _ :: _ => none
  | fuel + 1, n :: a :: m :: rest =>
    match takePairs m rest with
    | some (fs, r) =>
      match decode fuel r with
      | some steps => some (⟨n, a, fs⟩ :: steps)
      | none => none
    | none => none
  | _ + 1, _ => none

/-- Decode a flat certificate and verify it for `p`; a malformed certificate is rejected. -/
def checkFlat (cert : List ℕ) (p : ℕ) : Bool :=
  match decode cert.length cert with
  | some steps => verify [] steps p
  | none => false

/-- **A flat certificate accepted by `checkFlat` proves `p` prime.** Certificates apply it as
`prime_of_checkFlat [n, a, m, …] p (by decide)`, so the kernel only evaluates `checkFlat`. -/
theorem prime_of_checkFlat (cert : List ℕ) (p : ℕ) (h : checkFlat cert p = true) : p.Prime := by
  unfold checkFlat at h
  split at h
  · exact prime_of_verify [] (by simp) _ p h
  · exact absurd h Bool.false_ne_true

/-! ### Small checks -/

example : powMod 3 200 1000003 = 3 ^ 200 % 1000003 := by decide

/-- `7`: `7 - 1 = 2 * 3`, base `3`. -/
example : Nat.Prime 7 := prime_of_checkFlat [2, 1, 0, 3, 2, 1, 2, 1, 7, 3, 2, 2, 1, 3, 1] 7
  (by decide)

/-- A certificate that does not prove its number is rejected: `9 - 1 = 2 ^ 3`, but no base has
order `8` modulo `9`. -/
example : checkFlat [2, 1, 0, 9, 2, 1, 2, 3] 9 = false := by decide

/-- A malformed list is rejected. -/
example : checkFlat [2, 1, 1] 2 = false := by decide

end Cryptificate.Pratt
