import Cryptificate.PrimeField.Pratt
import Cryptificate.PrimeField.Encoding
import Cryptificate.PrimeField.Power
import Cryptificate.PrimeField.Presets
import Cryptificate.Hades.Wide

/-!
# Axiom audit of the prime-field results

The build fails if the Pratt checker, the power-map certificate over `ZMod p`, the width-four and
any-dimension partial-round certificates, or the primality of a named modulus starts depending on
an axiom other than the three standard ones (`propext`, `Classical.choice`, `Quot.sound`), e.g.
`sorryAx` or `Lean.ofReduceBool`. Certificates built from these theorems are audited again, claim
by claim, by `#cryptificate_audit`.
-/

/--
info: 'Cryptificate.Pratt.powMod_eq' depends on axioms: [propext, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Pratt.powMod_eq

/--
info: 'Cryptificate.Pratt.prime_of_verify' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Pratt.prime_of_verify

/--
info: 'Cryptificate.Pratt.prime_of_checkFlat' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Pratt.prime_of_checkFlat

/--
info: 'Cryptificate.PrimePower.ZModP.pow_bijective' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.PrimePower.ZModP.pow_bijective

/--
info: 'Cryptificate.det_ne_zero_of_det4' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.det_ne_zero_of_det4

/--
info: 'Cryptificate.Hades.observable_of_rows4' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Hades.observable_of_rows4

/--
info: 'Cryptificate.Hades.powers_zero_of_invariant' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Hades.powers_zero_of_invariant

/--
info: 'Cryptificate.Hades.powers_zero_of_rows' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Hades.powers_zero_of_rows

/--
info: 'Cryptificate.PrimeField.babyBear_prime' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.PrimeField.babyBear_prime

/--
info: 'Cryptificate.PrimeField.koalaBear_prime' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.PrimeField.koalaBear_prime

/--
info: 'Cryptificate.PrimeField.mersenne31_prime' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.PrimeField.mersenne31_prime

/--
info: 'Cryptificate.PrimeField.goldilocks_prime' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.PrimeField.goldilocks_prime

/--
info: 'Cryptificate.PrimeField.bn254_prime' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.PrimeField.bn254_prime
