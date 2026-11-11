import Cryptificate.Hades.Partial
import Cryptificate.Hades.Reference

/-!
# Axiom audit of the partial-round results

The build fails if any theorem of `Hades.Partial`, or a reference result built on it, starts
depending on an axiom other than the three standard ones (`propext`, `Classical.choice`,
`Quot.sound`), e.g. `sorryAx` or `Lean.ofReduceBool`. Certificates built from these theorems are
audited again, claim by claim, by `#cryptificate_audit`.
-/

/--
info: 'Cryptificate.Hades.observable_of_rows3' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Hades.observable_of_rows3

/--
info: 'Cryptificate.Hades.powers_zero_of_invariant2' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Hades.powers_zero_of_invariant2

/--
info: 'Cryptificate.Hades.powers_zero_of_short' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Hades.powers_zero_of_short

/--
info: 'Cryptificate.Hades.Design.round_sub_of_agree' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Hades.Design.round_sub_of_agree

/--
info: 'Cryptificate.Hades.Design.run_sub_of_agree' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Hades.Design.run_sub_of_agree

/--
info: 'Cryptificate.Hades.Design.bypass_of_powers' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Hades.Design.bypass_of_powers

/--
info: 'Cryptificate.Hades.Design.windowActive_of_observable' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Hades.Design.windowActive_of_observable

/--
info: 'Cryptificate.Hades.Design.not_bypass_of_windowActive' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Hades.Design.not_bypass_of_windowActive

/--
info: 'Cryptificate.Hades.Design.partialActivity_ge' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Hades.Design.partialActivity_ge

/--
info: 'Cryptificate.Hades.Design.total_activity' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Hades.Design.total_activity

/--
info: 'Cryptificate.Hades.reference_observable' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Hades.reference_observable

/--
info: 'Cryptificate.Hades.reference_windowActive' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Hades.reference_windowActive

/--
info: 'Cryptificate.Hades.reference_total_activity' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Hades.reference_total_activity
