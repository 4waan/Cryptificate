import Cryptificate.Encoding
import Cryptificate.Circuit.Program

/-!
# Writing circuits as literals

Certificates spell out the submitted program as a list of instructions whose constants are
natural-number numerals, exactly as the generator writes them, for example
`gfProgram4 [.add 0 1, .mul 0x02 4] 7 9 11 13`. The constant of a `mul` is converted to a field
element by the same helper the matrices use (`gf` for `GF(2⁸)`, `bn` for the BN254 scalar field),
so the byte `02` always means the element `x` and never the numeral `(2 : GF256) = 0`.
-/

set_option autoImplicit false

namespace Cryptificate

open Circuit

/-- An instruction as the generator writes it, with the constant as a natural numeral. -/
inductive RawInstr where
  | add (a b : ℕ)
  | mul (k a : ℕ)
  deriving DecidableEq, Repr

/-- Read the constant of a raw instruction with `lit`. -/
def RawInstr.toInstr {K : Type*} (lit : ℕ → K) : RawInstr → Instr K
  | .add a b => .add a b
  | .mul k a => .mul (lit k) a

/-- A width-four circuit over `GF(2⁸)` from raw instructions and four output registers. -/
def gfProgram4 (instrs : List RawInstr) (o0 o1 o2 o3 : ℕ) : Program GF256 4 :=
  ⟨instrs.map (RawInstr.toInstr gf), ![o0, o1, o2, o3]⟩

/-- A width-three circuit over the BN254 scalar field from raw instructions and three output
registers. -/
def bnProgram3 (instrs : List RawInstr) (o0 o1 o2 : ℕ) : Program Poseidon2.BN254.F 3 :=
  ⟨instrs.map (RawInstr.toInstr bn), ![o0, o1, o2]⟩

end Cryptificate
