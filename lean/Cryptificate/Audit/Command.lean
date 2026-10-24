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
`pp.fieldNotation`, `pp.fieldNotation.generalized`), so the line does not depend on the options
of the file it runs in.
Axioms are listed in `Name.lt` order, the order `#print axioms` uses, so the line is the same
on every run.

The command accepts only theorems: a claim stated as a `def` or an `axiom` is rejected outright
rather than reported.

An axiom list is only meaningful if the kernel checked the proof. The option
`debug.skipKernelTC` adds declarations without that check, and a `decide +kernel` proof added
that way can state anything with no axioms at all. Options are scoped, so by the time the audit
line runs such an option may no longer be visible. The command therefore re-checks, with the
kernel and with options it fixes itself, the theorem and every declaration of the current file it
depends on, each added again under a fresh name; any rejection is an error and no line is
printed. This repeats the kernel's work once, which for certificates means checking each
`decide` twice. Imported declarations are not re-checked: their modules were checked when
they were built.
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
    |>.setBool `pp.fieldNotation.generalized true
  let fmt ← withOptions (fun _ => opts) (ppExpr e)
  return oneLine (fmt.pretty 1000000)

/-- The declarations of the current file that `name` depends on, `name` included, through types
and values. Imported declarations are not followed: their modules were checked when built. -/
def localClosure (name : Name) : CoreM (Array ConstantInfo) := do
  let env ← getEnv
  let mut seen : NameSet := {}
  let mut todo : Array Name := #[name]
  let mut out : Array ConstantInfo := #[]
  while h : 0 < todo.size do
    let c := todo.back
    todo := todo.pop
    if seen.contains c || env.isImportedConst c then
      continue
    seen := seen.insert c
    let info ← getConstInfo c
    out := out.push info
    let used := info.type.getUsedConstants ++ ((info.value? (allowOpaque := true)).map
      Expr.getUsedConstants |>.getD #[])
    todo := todo ++ used
  return out

/-- Re-check one declaration with the kernel by adding a copy of it under a fresh name. Options
are fixed here, so `debug.skipKernelTC` or a heartbeat limit set earlier in the file has no
effect on the outcome. -/
def recheckDecl (kenv : Kernel.Environment) (info : ConstantInfo) : CoreM Unit := do
  let fresh := info.name ++ `_cryptificate_recheck
  let decl ← match info with
    | .thmInfo v => pure <| Declaration.thmDecl { v with name := fresh, all := [fresh] }
    | .defnInfo v => pure <| Declaration.defnDecl { v with name := fresh, all := [fresh] }
    | .opaqueInfo v => pure <| Declaration.opaqueDecl { v with name := fresh, all := [fresh] }
    | .axiomInfo _ => return  -- reported in the axiom list
    | _ => throwError "#cryptificate_audit: cannot re-check '{info.name}', which is not a \
        theorem, definition or axiom"
  let depth := max (maxRecDepth.get (← getOptions)) 16000
  let opts : Options := debug.skipKernelTC.set {} false
  let opts := maxRecDepth.set (maxHeartbeats.set opts 0) depth
  match Kernel.Environment.addDecl kenv opts decl with
  | .ok _ => pure ()
  | .error e => throwError "#cryptificate_audit: the kernel rejects '{info.name}': \
      {e.toMessageData opts}"

/-- `#cryptificate_audit thm` prints the audit line of the theorem `thm`. -/
syntax (name := cryptificateAudit) "#cryptificate_audit " ident : command

@[command_elab cryptificateAudit]
def elabCryptificateAudit : CommandElab := fun stx => do
  let id : Ident := ⟨stx[1]⟩
  let name ← liftCoreM <| realizeGlobalConstNoOverloadWithInfo id
  let info ← getConstInfo name
  unless info matches .thmInfo _ do
    throwErrorAt id "#cryptificate_audit: '{name}' is not a theorem"
  liftCoreM do
    let kenv := (← getEnv).toKernelEnv
    for c in ← localClosure name do
      recheckDecl kenv c
  let axioms ← collectAxioms name
  let type ← liftTermElabM <| ppOneLine info.type
  logInfo (auditLine name type axioms)

end Cryptificate.Audit
