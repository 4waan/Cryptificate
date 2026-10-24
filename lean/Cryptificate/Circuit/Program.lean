import Mathlib.Data.List.GetD
import Mathlib.Data.Fintype.Basic

/-!
# Linear circuits over a field

A linear circuit is the shape in which a diffusion layer is actually implemented: a straight-line
program that adds registers and scales them by public constants. Registers `0, …, n - 1` hold the
input coordinates, instruction `i` writes register `n + i`, and `n` output indices say which
registers form the result. Over `GF(2⁸)` addition is xor and multiplication by the constant `02`
is the familiar `xtime`, so the known `4 xtime + 15 xor` implementation of AES `MixColumns` is a
program of this kind.

The semantics is written once, for an arbitrary value type, in `run`: an `Ops` record says how to
add two register values and how to scale one. Evaluating on a concrete input uses the field's own
operations (`valueOps`); the coefficient pass in `Cryptificate.Circuit.Coefficients` uses the same
`run` with rows of coefficients in place of values. Sharing one interpreter is what makes the
correctness proof a single induction: both passes are the same fold seen through a map.

Registers are stored newest first, so issuing a register is one `cons`. A program of `256`
instructions then builds its register file in `256` steps when the kernel evaluates it, instead
of rebuilding nested appends, and every register value is a single shared term that later reads
point to rather than copy.

Reads outside the register file return the zero of the value type. Well-formed programs never do
this (`Program.WellFormed`), but giving the read a total meaning keeps the semantics and the
coefficient theorem free of side conditions; well-formedness is checked separately and is part
of the certificate check in `Cryptificate.Circuit.Check`.
-/

set_option autoImplicit false

namespace Cryptificate.Circuit

/-- One straight-line instruction: the sum of two registers, or a register scaled by a public
constant `k` of the field. -/
inductive Instr (K : Type*) where
  | add (a b : ℕ)
  | mul (k : K) (a : ℕ)
  deriving DecidableEq, Repr

/-- A linear circuit of width `n`: registers `0, …, n - 1` are the inputs, instruction `i`
defines register `n + i`, and output `j` is the register `outputs j`. -/
structure Program (K : Type*) (n : ℕ) where
  instrs : List (Instr K)
  outputs : Fin n → ℕ

variable {K α β : Type*} {n : ℕ}

/-- What the interpreter needs from a value type: a default for reads outside the register
file, addition, and scaling by a field constant. -/
structure Ops (K α : Type*) where
  zero : α
  add : α → α → α
  smul : K → α → α

/-- A register file stored newest first: `vals` has `len` entries and register `r < len` is
at position `len - 1 - r`. -/
structure Regs (α : Type*) where
  vals : List α
  len : ℕ

namespace Regs

/-- Register `r`, or `d` when `r` has not been written. -/
def get (R : Regs α) (d : α) (r : ℕ) : α :=
  if r < R.len then R.vals.getD (R.len - 1 - r) d else d

/-- Issue a new register. -/
def push (R : Regs α) (v : α) : Regs α := ⟨v :: R.vals, R.len + 1⟩

/-- Apply `f` to every register. -/
def map (f : α → β) (R : Regs α) : Regs β := ⟨R.vals.map f, R.len⟩

/-- The `n` input registers holding `x 0, …, x (n - 1)`. -/
def ofFn (x : Fin n → α) : Regs α := ⟨(List.ofFn x).reverse, n⟩

theorem get_map (f : α → β) (R : Regs α) (d : α) (r : ℕ) :
    (R.map f).get (f d) r = f (R.get d r) := by
  unfold get map
  split_ifs <;> simp

theorem map_push (f : α → β) (R : Regs α) (v : α) :
    (R.push v).map f = (R.map f).push (f v) := rfl

theorem map_ofFn (f : α → β) (x : Fin n → α) : (ofFn x).map f = ofFn (f ∘ x) := by
  simp [ofFn, map, List.map_reverse, List.map_ofFn]

theorem get_ofFn (x : Fin n → α) (d : α) (r : Fin n) : (ofFn x).get d r = x r := by
  have hr := r.isLt
  have hlt : n - 1 - r < n := by omega
  simp only [get, ofFn, hr, if_true]
  rw [List.getD_eq_getElem _ _ (by simpa using hlt), List.getElem_reverse]
  simp only [List.getElem_ofFn]
  congr 1
  ext
  simp only [List.length_ofFn]
  omega

end Regs

/-- One instruction's value, read from the register file `R`. -/
def Instr.apply (ops : Ops K α) (R : Regs α) : Instr K → α
  | .add a b => ops.add (R.get ops.zero a) (R.get ops.zero b)
  | .mul k a => ops.smul k (R.get ops.zero a)

/-- Run instructions left to right, issuing one register per instruction. -/
def run (ops : Ops K α) : Regs α → List (Instr K) → Regs α
  | R, [] => R
  | R, i :: is => run ops (R.push (i.apply ops R)) is

theorem run_len (ops : Ops K α) (R : Regs α) (is : List (Instr K)) :
    (run ops R is).len = R.len + is.length := by
  induction is generalizing R with
  | nil => rfl
  | cons i is ih => simp only [run, ih, Regs.push, List.length_cons]; omega

/-- A map that respects the three operations commutes with running a program. This is the one
induction behind the coefficient theorem: values are the image of coefficient rows under
"evaluate the row at `x`". -/
theorem run_map {opsα : Ops K α} {opsβ : Ops K β} (f : α → β)
    (hzero : f opsα.zero = opsβ.zero)
    (hadd : ∀ u v, f (opsα.add u v) = opsβ.add (f u) (f v))
    (hsmul : ∀ k u, f (opsα.smul k u) = opsβ.smul k (f u))
    (R : Regs α) (is : List (Instr K)) :
    (run opsα R is).map f = run opsβ (R.map f) is := by
  induction is generalizing R with
  | nil => rfl
  | cons i is ih =>
    simp only [run]
    rw [ih, Regs.map_push]
    congr 2
    cases i with
    | add a b => simp only [Instr.apply, hadd, ← hzero, Regs.get_map]
    | mul k a => simp only [Instr.apply, hsmul, ← hzero, Regs.get_map]

/-- The field's own operations, for evaluating a program on concrete inputs. -/
def valueOps (K : Type*) [Zero K] [Add K] [Mul K] : Ops K K := ⟨0, (· + ·), (· * ·)⟩

namespace Program

variable [Zero K] [Add K] [Mul K]

/-- All registers after running `p` on the input `x`. -/
def registers (p : Program K n) (x : Fin n → K) : Regs K :=
  run (valueOps K) (Regs.ofFn x) p.instrs

/-- The output of `p` on the input `x`: output `j` is register `p.outputs j`. -/
def eval (p : Program K n) (x : Fin n → K) : Fin n → K :=
  fun j => (p.registers x).get 0 (p.outputs j)

end Program

/-! ### Well-formedness -/

/-- The registers an instruction reads. -/
def Instr.operands : Instr K → List ℕ
  | .add a b => [a, b]
  | .mul _ a => [a]

/-- The largest number of instructions a certificate accepts. -/
def maxInstrs : ℕ := 256

/-- A well-formed program reads only registers that already exist, has at most `maxInstrs`
instructions, and names existing registers as outputs. -/
structure Program.WellFormed (p : Program K n) : Prop where
  operands : ∀ (i : ℕ) (h : i < p.instrs.length), ∀ r ∈ (p.instrs[i]).operands, r < n + i
  bounded : p.instrs.length ≤ maxInstrs
  outputs : ∀ j, p.outputs j < n + p.instrs.length

/-- Boolean check that the instructions read only registers below `len`, `len + 1`, … in turn. -/
def operandsBelow : ℕ → List (Instr K) → Bool
  | _, [] => true
  | len, i :: is => i.operands.all (fun r => decide (r < len)) && operandsBelow (len + 1) is

theorem operandsBelow_iff (len : ℕ) (is : List (Instr K)) :
    operandsBelow len is = true ↔
      ∀ (i : ℕ) (h : i < is.length), ∀ r ∈ (is[i]).operands, r < len + i := by
  induction is generalizing len with
  | nil => simp [operandsBelow]
  | cons ins is ih =>
    simp only [operandsBelow, Bool.and_eq_true, List.all_eq_true, decide_eq_true_eq, ih,
      List.length_cons]
    constructor
    · rintro ⟨h0, hs⟩ i hi r hr
      cases i with
      | zero => simpa using h0 r hr
      | succ i =>
        have := hs i (by omega) r hr
        omega
    · intro h
      refine ⟨fun r hr => by simpa using h 0 (by omega) r hr, fun i hi r hr => ?_⟩
      have := h (i + 1) (by omega) r hr
      omega

/-- Boolean form of `Program.WellFormed`, cheap for the kernel to evaluate. -/
def Program.wellFormedb (p : Program K n) : Bool :=
  operandsBelow n p.instrs && decide (p.instrs.length ≤ maxInstrs) &&
    (List.finRange n).all (fun j => decide (p.outputs j < n + p.instrs.length))

theorem Program.wellFormedb_iff (p : Program K n) : p.wellFormedb = true ↔ p.WellFormed := by
  simp only [wellFormedb, Bool.and_eq_true, operandsBelow_iff, decide_eq_true_eq,
    List.all_eq_true, List.mem_finRange, true_implies]
  exact ⟨fun ⟨⟨h1, h2⟩, h3⟩ => ⟨h1, h2, h3⟩, fun ⟨h1, h2, h3⟩ => ⟨⟨h1, h2⟩, h3⟩⟩

instance (p : Program K n) : Decidable p.WellFormed :=
  decidable_of_iff _ p.wellFormedb_iff

end Cryptificate.Circuit
