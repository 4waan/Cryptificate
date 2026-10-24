/-
Copyright (c) Cryptificate contributors. Released under the MIT license.
-/
import Refinement.GF256

/-!
# Axiom audit

The build fails if any main theorem starts depending on an axiom other than the three standard
ones (`propext`, `Classical.choice`, `Quot.sound`), e.g. `sorryAx` or `Lean.ofReduceBool`.
-/

/--
info: 'Cryptificate.Refinement.gf256_xtime_refines' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Refinement.gf256_xtime_refines

/--
info: 'Cryptificate.Refinement.gf256_add_refines' depends on axioms: [propext, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Refinement.gf256_add_refines

/--
info: 'Cryptificate.Refinement.gf256_mul_refines' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Refinement.gf256_mul_refines

/--
info: 'Cryptificate.Refinement.gf256_mul_field' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Refinement.gf256_mul_field

/--
info: 'Cryptificate.Refinement.gf256_xtime_field' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Refinement.gf256_xtime_field

/--
info: 'Cryptificate.Refinement.gf256_mul_assoc' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Refinement.gf256_mul_assoc

/--
info: 'Cryptificate.Refinement.gf256_mul_inv' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Refinement.gf256_mul_inv
