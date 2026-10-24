import Cryptificate.Audit.Echo
import Cryptificate.Sbox

/-!
# Echoing S-box constants

`Cryptificate.Audit.Echo` prints matrices, vectors, offsets and round counts in the request's
canonical encoding. An S-box is a function, which has no generic encoding, so its echo is
written here, in the request's own form for the `sbox` field:

* a table S-box prints as `{"kind":"table","table":["63","7C",…]}`, the `256` entries
  evaluated from the constant `candSboxTable` itself, so a mistranscribed entry shows up as a
  difference from the request;
* the AES S-box prints as `{"kind":"aes"}`.
-/

set_option autoImplicit false

namespace Cryptificate

open Audit

/-- The request encoding of a table S-box: its `256` entries, evaluated. -/
def sboxTableJson (f : GF256 → GF256) : CJson :=
  .obj [("kind", .str "table"),
    ("table", .arr ((List.range 256).map fun n => .str (CanonicalField.encode (f (gf n)))))]

/-- The request encoding of the AES S-box. -/
def sboxAesJson : CJson := .obj [("kind", .str "aes")]

/-- The echo line for a JSON value under `key`. -/
def jsonInputLine (key : String) (value : CJson) : String :=
  "CRYPTIFICATE_INPUT " ++ key ++ " " ++ value.render

/-- Print the echo line of a table S-box. -/
def echoSboxTable (key : String) (f : GF256 → GF256) : IO Unit :=
  IO.println (jsonInputLine key (sboxTableJson f))

/-- Print the echo line of the AES S-box. -/
def echoSboxAes (key : String) : IO Unit :=
  IO.println (jsonInputLine key sboxAesJson)

#guard jsonInputLine "s" sboxAesJson = "CRYPTIFICATE_INPUT s {\"kind\":\"aes\"}"

#guard ((sboxTableJson AES.sbox).render.take 33).toString =
  "{\"kind\":\"table\",\"table\":[\"63\",\"7C"

end Cryptificate
