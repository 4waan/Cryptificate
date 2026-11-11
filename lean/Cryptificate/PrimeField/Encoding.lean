import Cryptificate.Audit.Echo

/-!
# Literal encodings over a prime field `ZMod p`

A request over a prime field (model `hades/prime/v1`) names its modulus `p` and gives matrices,
vectors and witnesses as canonical decimal numerals in `[0, p)`. These helpers turn the numerals
the generator writes into elements of `ZMod p`, for any `p`, so one set of certificate templates
covers every prime field and every width. The entries are passed as a flat list in row-major
order, which a generated file can spell with numerals and commas alone:

    pfMat candModulus 3 [2, 1, 1, 1, 2, 1, 1, 1, 3]

A list that is too short reads as zeros. That is harmless: every certificate constant prints its
value back as Lean evaluates it (`Audit.echoInput`), and the service compares the printed value
with the request, so an entry that was dropped or mistyped is a rejected certificate, not a proof
about other numbers.

`ZMod p` is a field only when `p` is prime. The encoders do not need that; the claims about a
design do, and a certificate obtains `Fact (Nat.Prime p)` from a Pratt certificate checked by
the kernel (`Cryptificate.Pratt`).
-/

set_option autoImplicit false

namespace Cryptificate

/-- The residue of the numeral `n` modulo `p`. -/
def pf (p : ℕ) (n : ℕ) : ZMod p := (n : ZMod p)

/-- A vector of length `n` over `ZMod p` from its entries. -/
def pfVec (p n : ℕ) (entries : List ℕ) : Fin n → ZMod p := fun i => pf p (entries.getD i.val 0)

/-- An `n × n` matrix over `ZMod p` from its entries in row-major order. -/
def pfMat (p n : ℕ) (entries : List ℕ) : Matrix (Fin n) (Fin n) (ZMod p) :=
  Matrix.of fun i j => pf p (entries.getD (i.val * n + j.val) 0)

/-- `r` vectors of length `n` over `ZMod p`, one after the other in `entries`. -/
def pfVecs (p r n : ℕ) (entries : List ℕ) : Fin r → Fin n → ZMod p :=
  fun k i => pf p (entries.getD (k.val * n + i.val) 0)

/-- A partial-round mask of width `n`: `true` where the numeral is nonzero (the engine writes `1`
for a masked position and `0` otherwise). -/
def maskBits (n : ℕ) (entries : List ℕ) : Fin n → Bool := fun i => entries.getD i.val 0 != 0

namespace Audit

/-- An element of `ZMod p` prints as its canonical decimal representative in `[0, p)`, the
request encoding of every prime field. (The BN254 instance of `Audit.Echo` takes precedence for
`Poseidon2.BN254.F` and prints the same string.) -/
instance (priority := low) instToCanonicalZMod {p : ℕ} : ToCanonical (ZMod p) :=
  ⟨fun a => .str (toString a.val)⟩

/-- The echo line for a natural number printed as a decimal string. Moduli are written this way
in the request, because a 64-bit modulus such as Goldilocks does not fit a JSON number that every
reader parses exactly. -/
def decimalInputLine (key : String) (n : ℕ) : String :=
  "CRYPTIFICATE_INPUT " ++ key ++ " " ++ (CJson.str (toString n)).render

/-- Print the echo line of a natural number as a decimal string. -/
def echoDecimal (key : String) (n : ℕ) : IO Unit :=
  IO.println (decimalInputLine key n)

#guard inputLine "m" (pfMat 7 2 [1, 2, 3, 9]) =
  "CRYPTIFICATE_INPUT m [[\"1\",\"2\"],[\"3\",\"2\"]]"

#guard inputLine "v" (pfVec 2013265921 3 [0, 1, 2013265920]) =
  "CRYPTIFICATE_INPUT v [\"0\",\"1\",\"2013265920\"]"

#guard inputLine "k" (maskBits 4 [1, 0, 0, 0]) = "CRYPTIFICATE_INPUT k [true,false,false,false]"

#guard decimalInputLine "p" 18446744069414584321 =
  "CRYPTIFICATE_INPUT p \"18446744069414584321\""

end Audit

example : pfMat 7 2 [1, 2, 3, 4] * pfMat 7 2 [1, 0, 0, 1] = pfMat 7 2 [1, 2, 3, 4] := by decide

end Cryptificate
