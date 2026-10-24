import Cryptificate.Circuit.Literal
import Cryptificate.Audit.Json

/-!
# Echoing certificate inputs

A certificate states its theorems about constants such as `candMatrix` and `candProgram`, which
the generator wrote into the file. The audit line proves what was checked about those constants,
but not that they are the values the user submitted. To close that gap every constant fragment
prints its constant back, as Lean evaluates it, in the canonical JSON encoding of the request:

```
CRYPTIFICATE_INPUT candMatrix [["02","03","01","01"],["01","02","03","01"],…]
```

The service compares each echoed value with the normalized request and rejects the certificate
on any difference. A mistranscribed byte, or a numeral read in the wrong field, is caught this
way even though the proof itself is valid for what the file says.

The canonical encodings are those of the request format:

* an element of `GF(2⁸)` is a two-digit uppercase hex string without prefix, `"1B"`;
* an element of the BN254 scalar field is its canonical decimal string in `[0, p)`;
* vectors are arrays and matrices are row-major arrays of rows;
* naturals and elements of `Fin n` (offsets, rounds, register indices) are JSON numbers;
* a program is `{"field", "width", "instructions", "outputs"}` with instructions written as
  `{"op":"add","a":…,"b":…}` and `{"op":"mul","k":…,"a":…}`; the program's display name is not
  part of the certificate and is not echoed.

Usage in a fragment: `#eval echoInput "candMatrix" candMatrix`.
-/

set_option autoImplicit false

namespace Cryptificate.Audit

open Circuit

/-- A field with a canonical string encoding for its elements. -/
class CanonicalField (K : Type) where
  /-- The request's name for the field. -/
  fieldName : String
  /-- The canonical string of an element. -/
  encode : K → String

/-- Two uppercase hex digits. -/
def hex2 (n : Nat) : String :=
  let d := fun (k : Nat) => (Nat.digitChar ((n / 16 ^ k) % 16)).toUpper
  String.ofList [d 1, d 0]

instance : CanonicalField GF256 := ⟨"gf256", fun a => hex2 a.val.toNat⟩

instance : CanonicalField Poseidon2.BN254.F := ⟨"bn254", fun a => toString a.val⟩

/-- Values with a canonical JSON encoding. -/
class ToCanonical (α : Type) where
  toCJson : α → CJson

export ToCanonical (toCJson)

instance : ToCanonical Nat := ⟨.nat⟩

instance {n : Nat} : ToCanonical (Fin n) := ⟨fun i => .nat i.val⟩

instance : ToCanonical GF256 := ⟨fun a => .str (CanonicalField.encode a)⟩

instance : ToCanonical Poseidon2.BN254.F := ⟨fun a => .str (CanonicalField.encode a)⟩

instance {n : Nat} {α : Type} [ToCanonical α] : ToCanonical (Fin n → α) :=
  ⟨fun v => .arr (List.ofFn fun i => toCJson (v i))⟩

instance {m n : Nat} {α : Type} [ToCanonical α] : ToCanonical (Matrix (Fin m) (Fin n) α) :=
  ⟨fun M => .arr (List.ofFn fun i => .arr (List.ofFn fun j => toCJson (M i j)))⟩

/-- The request encoding of one instruction. -/
def instrJson {K : Type} [CanonicalField K] : Instr K → CJson
  | .add a b => .obj [("op", .str "add"), ("a", .nat a), ("b", .nat b)]
  | .mul k a => .obj [("op", .str "mul"), ("k", .str (CanonicalField.encode k)), ("a", .nat a)]

instance {K : Type} {n : Nat} [CanonicalField K] : ToCanonical (Program K n) :=
  ⟨fun p => .obj
    [("field", .str (CanonicalField.fieldName K)),
     ("width", .nat n),
     ("instructions", .arr (p.instrs.map instrJson)),
     ("outputs", .arr (List.ofFn fun j => .nat (p.outputs j)))]⟩

/-- The echo line for `value` under `key`. -/
def inputLine {α : Type} [ToCanonical α] (key : String) (value : α) : String :=
  "CRYPTIFICATE_INPUT " ++ key ++ " " ++ (toCJson value).render

/-- Print the echo line for `value` under `key`. -/
def echoInput {α : Type} [ToCanonical α] (key : String) (value : α) : IO Unit :=
  IO.println (inputLine key value)

#guard inputLine "v" (gfVec4 0x1B 0x80 0 0xff) =
  "CRYPTIFICATE_INPUT v [\"1B\",\"80\",\"00\",\"FF\"]"

#guard inputLine "m" (bnMat3 2 1 1 1 2 1 1 1 2) =
  "CRYPTIFICATE_INPUT m [[\"2\",\"1\",\"1\"],[\"1\",\"2\",\"1\"],[\"1\",\"1\",\"2\"]]"

-- `p + 1` reduces to `1`.
#guard inputLine "x"
    (bn 21888242871839275222246405745257275088548364400416034343698204186575808495618) =
  "CRYPTIFICATE_INPUT x \"1\""

#guard inputLine "o" (offsets4 0 1 2 3) = "CRYPTIFICATE_INPUT o [0,1,2,3]"

#guard inputLine "p" (gfProgram4 [.add 0 1, .mul 0x02 4] 5 1 2 3) =
  "CRYPTIFICATE_INPUT p {\"field\":\"gf256\",\"width\":4,\"instructions\":" ++
    "[{\"op\":\"add\",\"a\":0,\"b\":1},{\"op\":\"mul\",\"k\":\"02\",\"a\":4}]," ++
    "\"outputs\":[5,1,2,3]}"

end Cryptificate.Audit
