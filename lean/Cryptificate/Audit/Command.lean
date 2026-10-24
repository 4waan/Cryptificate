import Lean.Util.CollectAxioms
import Lean.Elab.Command
import Cryptificate.Audit.Json

/-!
# The audit line

A certificate is only as good as the axioms its theorems rest on. `#cryptificate_audit thm`
reports, for one theorem, its full name, its statement and every axiom it depends on, collected
transitively by `Lean.collectAxioms` through all definitions and imported lemmas, exactly as
`#print axioms` does. The service accepts a claim only when the statement matches the one the
template promised and the axioms are among `propext`, `Classical.choice` and `Quot.sound`; a proof
that used `sorry` shows `sorryAx`, and one that used `native_decide` shows `Lean.ofReduceBool`.

The report is one line on standard output:

```
CRYPTIFICATE_AUDIT {"theorem":"CryptificateJob.circuit_equivalence","type":"…","axioms":["propext","Classical.choice","Quot.sound"]}
```

The statement is pretty-printed on a single line: the formatter gets a width no statement
reaches, and any remaining line break with its indentation is folded into one space. The
options that people commonly change and that would alter the text are pinned
(`pp.unicode.fun`, `pp.fullNames`, `pp.universes`, `pp.explicit`, `pp.notation`,
`pp.fieldNotation`), so the line does not depend on the options of the file it runs in.
Axioms are listed in `Name.lt` order, the order `#print axioms` uses, so the line is the same
on every run.

The command accepts only theorems: a claim stated as a `def` or an `axiom` is rejected outright
rather than reported.
-/

set_option autoImplicit false

namespace Cryptificate.Audit

open Lean Elab Command Meta

/-- Fold every line break, together with the indentation that follows it, into one space. -/
def oneLine (s : String) : String :=
  let rec go : List Char → Bool → List Char → List Char
    | [], _, acc => acc.reverse
    | c :: cs, inBreak, acc =>
      if c = '\n' then go cs true (if inBreak then acc else ' ' :: acc)
      else if inBreak && c = ' ' then go cs true acc
      else go cs false (c :: acc)
  String.ofList (go s.toList false [])

/-- The audit line for a theorem with the given name, statement and axioms. -/
def auditLine (thm : Name) (type : String) (axioms : Array Name) : String :=
  let obj := CJson.obj
    [("theorem", .str thm.toString),
     ("type", .str type),
     ("axioms", .arr ((axioms.qsort Name.lt).toList.map fun a => .str a.toString))]
  "CRYPTIFICATE_AUDIT " ++ obj.render

/-- Pretty-print an expression as one line with the pinned options. -/
def ppOneLine (e : Expr) : MetaM String := do
  let opts := (← getOptions)
    |>.setBool `pp.unicode.fun false
    |>.setBool `pp.fullNames false
    |>.setBool `pp.universes false
    |>.setBool `pp.explicit false
    |>.setBool `pp.notation true
    |>.setBool `pp.fieldNotation true
  let fmt ← withOptions (fun _ => opts) (ppExpr e)
  return oneLine (fmt.pretty 1000000)

/-- `#cryptificate_audit thm` prints the audit line of the theorem `thm`. -/
syntax (name := cryptificateAudit) "#cryptificate_audit " ident : command

@[command_elab cryptificateAudit]
def elabCryptificateAudit : CommandElab := fun stx => do
  let id : Ident := ⟨stx[1]⟩
  let name ← liftCoreM <| realizeGlobalConstNoOverloadWithInfo id
  let info ← getConstInfo name
  unless info matches .thmInfo _ do
    throwErrorAt id "#cryptificate_audit: '{name}' is not a theorem"
  let axioms ← collectAxioms name
  let type ← liftTermElabM <| ppOneLine info.type
  logInfo (auditLine name type axioms)

end Cryptificate.Audit
