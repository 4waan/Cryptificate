import Cryptificate.Grain.Generator
import Cryptificate.Grain.Bitwise
import Cryptificate.Grain.BN254

/-!
# Axiom audit of the Grain results

The build fails if a theorem about the Grain procedure starts depending on an axiom other than
the three standard ones (`propext`, `Classical.choice`, `Quot.sound`), e.g. `sorryAx` or
`Lean.ofReduceBool`. Certificates of claim `constants.grain` are audited again, claim by claim,
by `#cryptificate_audit`.
-/

/--
info: 'Cryptificate.Grain.shrinkTable_spec' depends on axioms: [propext]
-/
#guard_msgs in
#print axioms Cryptificate.Grain.shrinkTable_spec

/--
info: 'Cryptificate.Grain.ne_of_constantAt' depends on axioms: [propext]
-/
#guard_msgs in
#print axioms Cryptificate.Grain.ne_of_constantAt

/--
info: 'Cryptificate.Grain.bn254_reference' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Grain.bn254_reference

/--
info: 'Cryptificate.Grain.mask80_eq' does not depend on any axioms
-/
#guard_msgs in
#print axioms Cryptificate.Grain.mask80_eq

/--
info: 'Cryptificate.Grain.Bitwise.start_eq' depends on axioms: [propext]
-/
#guard_msgs in
#print axioms Cryptificate.Grain.Bitwise.start_eq
