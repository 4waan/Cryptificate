import Cryptificate.Circuit.Program
import Mathlib.Data.Matrix.Mul
import Mathlib.Algebra.BigOperators.Fin

/-!
# The coefficient matrix of a linear circuit

Every register of a linear circuit is a fixed linear combination of the inputs. This file
computes those combinations directly: each register gets a coefficient row, a list of `n` field
elements, and the rows are produced by the same left-to-right interpreter that evaluates the
circuit (`Cryptificate.Circuit.run`), with row addition and row scaling as the operations.

Because the rows are materialized one register at a time, a register that is read by many later
instructions is computed once and then referred to. The work is one row operation per
instruction plus a walk of the register file per read, at most quadratic in the number of
instructions. Unfolding the circuit as an expression tree instead would duplicate every shared
subterm at each use, which is exponential for circuits that reuse intermediate sums (a chain in
which each register adds the previous two already doubles at every step); the `256`-instruction
example in `Cryptificate.Examples.CircuitSharedDag` would unfold to about `4 · 10¹¹` nodes.

`Program.eval_eq_mulVec` is the single generic theorem that justifies the computation: for every
program and every input `x`, the circuit's output is `coeffMatrix p` applied to `x`. It holds
over any semiring and with no side conditions, since out-of-range reads are zero in both the
value semantics and the coefficient semantics. Consequently a program implements a matrix `M`
exactly when its coefficient matrix is `M` (`Program.implements_iff`), which is the fact the
certificate check in `Cryptificate.Circuit.Check` decides.

Rows are read with `List.getD` and built with `List.ofFn`, so every row operation is defined for
lists of any length and the evaluation map below is additive and homogeneous outright, without
tracking that all rows have length `n`.
-/

set_option autoImplicit false

namespace Cryptificate.Circuit

open Finset

variable {K : Type*} {n : ℕ}

section Rows

variable [Semiring K]

/-- Coordinate `j` of a coefficient row, zero past its end. -/
def coeff (u : List K) (j : ℕ) : K := u.getD j 0

/-- Coordinatewise sum of two coefficient rows. -/
def addRow (n : ℕ) (u v : List K) : List K := List.ofFn fun j : Fin n => coeff u j + coeff v j

/-- A coefficient row scaled by `k`. -/
def smulRow (n : ℕ) (k : K) (u : List K) : List K := List.ofFn fun j : Fin n => k * coeff u j

/-- The coefficient row of input register `i`: the `i`-th unit row. -/
def unitRow (n : ℕ) (i : Fin n) : List K := List.ofFn fun j : Fin n => if j = i then 1 else 0

/-- Interpreter operations on coefficient rows. The default row is empty, i.e. all zero. -/
def rowOps (K : Type*) [Semiring K] (n : ℕ) : Ops K (List K) := ⟨[], addRow n, smulRow n⟩

/-- The value of a coefficient row at the input `x`: `∑ j, u_j * x_j`. -/
def evalRow (x : Fin n → K) (u : List K) : K := ∑ j : Fin n, coeff u j * x j

theorem coeff_ofFn (f : Fin n → K) (j : Fin n) : coeff (List.ofFn f) j = f j := by
  rw [coeff, List.getD_eq_getElem _ _ (by simp)]
  simp

theorem evalRow_nil (x : Fin n → K) : evalRow x [] = 0 := by
  simp [evalRow, coeff]

theorem evalRow_addRow (x : Fin n → K) (u v : List K) :
    evalRow x (addRow n u v) = evalRow x u + evalRow x v := by
  simp only [evalRow, addRow, coeff_ofFn, add_mul, sum_add_distrib]

theorem evalRow_smulRow (x : Fin n → K) (k : K) (u : List K) :
    evalRow x (smulRow n k u) = k * evalRow x u := by
  simp only [evalRow, smulRow, coeff_ofFn, mul_sum, mul_assoc]

theorem evalRow_unitRow (x : Fin n → K) (i : Fin n) : evalRow x (unitRow n i) = x i := by
  simp [evalRow, unitRow, coeff_ofFn]

end Rows

namespace Program

variable [Semiring K]

/-- The coefficient row of every register, computed once, left to right. -/
def coeffRegs (p : Program K n) : Regs (List K) :=
  run (rowOps K n) (Regs.ofFn (unitRow n)) p.instrs

/-- The coefficient row of output `i`. -/
def outputRow (p : Program K n) (i : Fin n) : List K := p.coeffRegs.get [] (p.outputs i)

/-- The coefficient matrix of `p`: row `i` holds the coefficients of output `i`. -/
def coeffMatrix (p : Program K n) : Matrix (Fin n) (Fin n) K :=
  Matrix.of fun i j => coeff (p.outputRow i) j

/-- Evaluating every coefficient row at `x` gives the register values on input `x`. -/
theorem coeffRegs_map_evalRow (p : Program K n) (x : Fin n → K) :
    p.coeffRegs.map (evalRow x) = p.registers x := by
  unfold coeffRegs registers
  rw [run_map (opsβ := valueOps K) (evalRow x) (evalRow_nil x) (evalRow_addRow x)
    (evalRow_smulRow x), Regs.map_ofFn]
  congr 2
  funext i
  exact evalRow_unitRow x i

/-- **Coefficient theorem.** Every linear circuit computes the matrix-vector product with its
coefficient matrix, on every input. -/
theorem eval_eq_mulVec (p : Program K n) (x : Fin n → K) : p.eval x = p.coeffMatrix.mulVec x := by
  funext i
  rw [eval, ← coeffRegs_map_evalRow, ← evalRow_nil x, Regs.get_map]
  rfl

/-- The same statement for a well-formed program, in the form the certificates cite. -/
theorem WellFormed.eval_eq_mulVec {p : Program K n} (_ : p.WellFormed) (x : Fin n → K) :
    p.eval x = p.coeffMatrix.mulVec x :=
  p.eval_eq_mulVec x

/-- A program whose coefficient matrix is `M` computes `M` on every input. -/
theorem implements_of_coeffMatrix_eq {p : Program K n} {M : Matrix (Fin n) (Fin n) K}
    (h : p.coeffMatrix = M) : ∀ x, p.eval x = M.mulVec x := by
  intro x
  rw [eval_eq_mulVec, h]

/-- A program computes `M` on every input exactly when its coefficient matrix is `M`. -/
theorem implements_iff (p : Program K n) (M : Matrix (Fin n) (Fin n) K) :
    (∀ x, p.eval x = M.mulVec x) ↔ p.coeffMatrix = M := by
  refine ⟨fun h => ?_, implements_of_coeffMatrix_eq⟩
  apply Matrix.ext_iff_mulVec.mpr
  intro x
  rw [← eval_eq_mulVec, h]

end Program

end Cryptificate.Circuit
