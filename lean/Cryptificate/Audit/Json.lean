/-!
# Canonical JSON lines

Certificates report back to the service through single lines of JSON on standard output. The
service parses them, so they must be valid JSON; it also compares some of them with the request
it sent, so the same value must always print the same way.

`CJson` is a small JSON value type that keeps object keys in the order they are written (Lean's
`Lean.Json` stores objects in a red-black tree and prints keys sorted, which would reorder the
documented `{"theorem", "type", "axioms"}` layout). Rendering is compact, with no whitespace
between tokens. Strings are escaped so that every printed line is plain ASCII: quotes,
backslashes and control characters use the short JSON escapes, and every other character outside
printable ASCII is written as `\uXXXX`, with a surrogate pair above `U+FFFF`. A JSON parser
recovers the original string exactly, and the line survives any consumer that mishandles UTF-8.
-/

set_option autoImplicit false

namespace Cryptificate.Audit

/-- A JSON value whose objects keep their keys in the order given. -/
inductive CJson where
  | str (s : String)
  | nat (n : Nat)
  | bool (b : Bool)
  | arr (xs : List CJson)
  | obj (kvs : List (String × CJson))
  deriving Inhabited

/-- Four lowercase hex digits. -/
def hex4 (n : Nat) : String :=
  let d := fun (k : Nat) => Nat.digitChar ((n / 16 ^ k) % 16)
  String.ofList [d 3, d 2, d 1, d 0]

/-- The JSON escape of one character, as described in the module docstring. -/
def escapeChar (c : Char) : String :=
  if c = '"' then "\\\""
  else if c = '\\' then "\\\\"
  else if c = '\n' then "\\n"
  else if c = '\r' then "\\r"
  else if c = '\t' then "\\t"
  else if c.toNat < 0x20 || c.toNat ≥ 0x7F then
    if c.toNat < 0x10000 then "\\u" ++ hex4 c.toNat
    else
      let v := c.toNat - 0x10000
      "\\u" ++ hex4 (0xD800 + v / 0x400) ++ "\\u" ++ hex4 (0xDC00 + v % 0x400)
  else c.toString

/-- A JSON string literal, quotes included. -/
def quote (s : String) : String := "\"" ++ String.join (s.toList.map escapeChar) ++ "\""

mutual

/-- Compact rendering of a JSON value. -/
def CJson.render : CJson → String
  | .str s => quote s
  | .nat n => toString n
  | .bool b => if b then "true" else "false"
  | .arr xs => "[" ++ renderItems xs ++ "]"
  | .obj kvs => "{" ++ renderFields kvs ++ "}"

/-- Comma-separated array items. -/
def renderItems : List CJson → String
  | [] => ""
  | [x] => x.render
  | x :: xs => x.render ++ "," ++ renderItems xs

/-- Comma-separated object fields. -/
def renderFields : List (String × CJson) → String
  | [] => ""
  | [(k, v)] => quote k ++ ":" ++ v.render
  | (k, v) :: kvs => quote k ++ ":" ++ v.render ++ "," ++ renderFields kvs

end

#guard (CJson.obj [("b", .nat 1), ("a", .arr [.str "x\"y", .bool true])]).render =
  "{\"b\":1,\"a\":[\"x\\\"y\",true]}"

#guard quote "∀ x\n" = "\"\\u2200 x\\n\""

#guard quote "𝔽" = "\"\\ud835\\udd3d\""

end Cryptificate.Audit
