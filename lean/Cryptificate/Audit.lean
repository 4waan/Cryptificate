import Cryptificate.Audit.Json
import Cryptificate.Audit.Command
import Cryptificate.Audit.Echo

/-!
# Reporting certificates to the service

What a certificate prints besides Lean's own messages, one JSON line at a time.

* `Cryptificate.Audit.Command`: `#cryptificate_audit thm` prints a theorem's name, statement and
  axioms as a `CRYPTIFICATE_AUDIT` line.
* `Cryptificate.Audit.Echo`: `echoInput key value` prints a candidate constant in the request's
  canonical encoding as a `CRYPTIFICATE_INPUT` line.
* `Cryptificate.Audit.Json`: the ordered, ASCII-only JSON renderer both use.
-/
