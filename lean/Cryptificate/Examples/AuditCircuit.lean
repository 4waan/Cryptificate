import Cryptificate

/-!
# Example: auditing the circuit library

Certificates cite a handful of generic theorems from `Cryptificate.Circuit`; their axioms are
part of every circuit claim. The first block prints the audit line of each, in the form the
service parses. The second block checks every declaration defined in the circuit and audit
modules, as `WideTrail`'s own audit script does for that library, and fails unless all of them
depend only on `propext`, `Classical.choice` and `Quot.sound`.
-/

#cryptificate_audit Cryptificate.Circuit.Program.eval_eq_mulVec
#cryptificate_audit Cryptificate.Circuit.Program.implements_iff
#cryptificate_audit Cryptificate.Circuit.Program.checkEquiv_iff
#cryptificate_audit Cryptificate.Circuit.Program.implements_of_checkEquiv
#cryptificate_audit Cryptificate.Circuit.Program.mismatch
#cryptificate_audit Cryptificate.Circuit.Program.wellFormedb_iff

open Lean Elab Command in
run_cmd do
  let env ← getEnv
  let allowed : Array Name := #[``propext, ``Classical.choice, ``Quot.sound]
  let mut checked : Nat := 0
  let ours (m : Name) := (`Cryptificate.Circuit).isPrefixOf m || (`Cryptificate.Audit).isPrefixOf m
  for modName in env.header.moduleNames, data in env.header.moduleData do
    unless ours modName do
      continue
    for name in data.constNames do
      let axioms ← Lean.collectAxioms name
      let unexpected := axioms.filter (fun ax => !allowed.contains ax)
      unless unexpected.isEmpty do
        throwError "{name}: unexpected axioms {unexpected}"
      checked := checked + 1
  if checked = 0 then
    throwError "the audit selected no declarations"
  logInfo m!"Audited {checked} circuit and audit declarations: only propext, Classical.choice, \
    Quot.sound."
