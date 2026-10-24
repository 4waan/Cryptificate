import Cryptificate.Circuit.Program
import Cryptificate.Circuit.Coefficients
import Cryptificate.Circuit.Check
import Cryptificate.Circuit.Literal

/-!
# Linear circuits

Straight-line programs of additions and constant multiplications over a field, their evaluation,
their coefficient matrices, and the checks certificates use to prove or refute that a submitted
circuit computes a given matrix.

* `Cryptificate.Circuit.Program`: instructions, programs, evaluation, well-formedness.
* `Cryptificate.Circuit.Coefficients`: coefficient rows computed once per register, and the
  coefficient theorem `Program.eval_eq_mulVec`.
* `Cryptificate.Circuit.Check`: the decidable equivalence check and the witness refutation.
* `Cryptificate.Circuit.Literal`: circuits written with numeral constants, as certificates do.
-/
