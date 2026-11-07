import Cryptificate.Grain.Generator
import Cryptificate.Audit.Json

/-!
# Echoing submitted round constants

A certificate of claim `constants.grain` states its theorem about `candConstants`, the submitted
constants as one flat list of numerals. To tie that list to the request, the certificate prints it
back in the request's encoding, one row of `t` decimal strings per round:

```
CRYPTIFICATE_INPUT candConstants [["1","2","3"],["4","0","0"],…]
```

and the service compares the line with the normalized request (see `Audit.Echo`).
-/

set_option autoImplicit false

namespace Cryptificate.Grain

open Audit

/-- The echo line of a flat list of constants, in rows of `t` decimal strings. -/
def constantsLine (key : String) (t : ℕ) (cs : List ℕ) : String :=
  "CRYPTIFICATE_INPUT " ++ key ++ " " ++
    (CJson.arr ((rows t cs).map fun r => CJson.arr (r.map fun x => CJson.str (toString x)))).render

/-- Print the echo line of a flat list of constants in rows of `t`. -/
def echoConstants (key : String) (t : ℕ) (cs : List ℕ) : IO Unit :=
  IO.println (constantsLine key t cs)

#guard constantsLine "c" 2 [1, 2, 3, 0] = "CRYPTIFICATE_INPUT c [[\"1\",\"2\"],[\"3\",\"0\"]]"

#guard constantsLine "c" 3 [] = "CRYPTIFICATE_INPUT c []"

end Cryptificate.Grain
