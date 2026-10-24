import Cryptificate

/-!
# Example: auditing the diffusion library

Design certificates cite a few generic theorems from the diffusion modules, and their axioms
are part of every design claim. The first block prints the audit line of each, in the form the
service parses. The second block checks every declaration of `Cryptificate.Diffusion`, its
submodules (including `Diffusion.Minors3`, which the HADES certificates use),
`Cryptificate.Bridge` and `Cryptificate.Sbox`, and fails unless all of them depend only on
`propext`, `Classical.choice` and `Quot.sound`.
-/

#cryptificate_audit Cryptificate.isMDS_of_minors4Ok
#cryptificate_audit Cryptificate.isMDS_iff_forall_injective
#cryptificate_audit Cryptificate.not_isMDS_of_witness
#cryptificate_audit Cryptificate.diffusionOptimal_of_injective
#cryptificate_audit Cryptificate.not_diffusionOptimal_of_offset_collision
#cryptificate_audit Cryptificate.candidate_activity_bound
#cryptificate_audit Cryptificate.isTrail_difference
#cryptificate_audit Cryptificate.activeSboxes_bound
#cryptificate_audit Cryptificate.bijective_of_leftInverse
#cryptificate_audit Cryptificate.not_injective_of_collision
#cryptificate_audit Cryptificate.aes_sbox_bijective
#cryptificate_audit Cryptificate.aes_sbox_eq_table

open Lean Elab Command in
run_cmd do
  let env ← getEnv
  let allowed : Array Name := #[``propext, ``Classical.choice, ``Quot.sound]
  let mut checked : Nat := 0
  let ours (m : Name) :=
    (`Cryptificate.Diffusion).isPrefixOf m || m == `Cryptificate.Bridge ||
      m == `Cryptificate.Sbox
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
  logInfo m!"Audited {checked} diffusion, bridge and S-box declarations: only propext, \
    Classical.choice, Quot.sound."
