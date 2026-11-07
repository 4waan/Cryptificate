import Cryptificate.PrimeField.Pratt
import Cryptificate.PrimeField.Encoding
import Cryptificate.PrimeField.Power
import Cryptificate.PrimeField.Presets
import Cryptificate.Hades.Wide
import Cryptificate.PrimeField.NatMatrix
import Cryptificate.PrimeField.Packed
import Cryptificate.Diffusion.Minors2

/-!
# Axiom audit of the prime-field results

The build fails if the Pratt checker, the power-map certificate over `ZMod p`, the width-four and
any-dimension partial-round certificates, the packed matrix checks of wide widths (inverse
witnesses, observability, short bypasses, the Poseidon2 block structure, Kronecker
substitution), the list checks (kernel vectors, low-weight vectors, invariant subspaces), the
width-two minors, or the primality of a named modulus starts depending on an axiom other than
the three standard ones (`propext`, `Classical.choice`, `Quot.sound`), e.g. `sorryAx` or
`Lean.ofReduceBool`. Certificates built from these theorems are audited again, claim by claim, by
`#cryptificate_audit`.
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
info: 'Cryptificate.PrimePower.ZModP.powMap_bijective' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.PrimePower.ZModP.powMap_bijective

/--
info: 'Cryptificate.PrimePower.ZModP.powMap_not_injective_of_root' depends on axioms: [propext, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.PrimePower.ZModP.powMap_not_injective_of_root

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
info: 'Cryptificate.Packed.kron_eq' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Packed.kron_eq

/--
info: 'Cryptificate.Packed.mul_revCols_eq_one' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Packed.mul_revCols_eq_one

/--
info: 'Cryptificate.Packed.det_ne_zero_of_checkInverse' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Packed.det_ne_zero_of_checkInverse

/--
info: 'Cryptificate.Hades.observable_of_checkObsP' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Hades.observable_of_checkObsP

/--
info: 'Cryptificate.Hades.powers_zero_of_checkOrthP' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Hades.powers_zero_of_checkOrthP

/--
info: 'Cryptificate.Hades.pfMat_eq_poseidon2External_of_checkP' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Hades.pfMat_eq_poseidon2External_of_checkP

/--
info: 'Cryptificate.NatMatrix.mulVec_eq_zero_of_check' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.NatMatrix.mulVec_eq_zero_of_check

/--
info: 'Cryptificate.NatMatrix.pfVec_ne_zero_of_check' depends on axioms: [propext, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.NatMatrix.pfVec_ne_zero_of_check

/--
info: 'Cryptificate.NatMatrix.pfVecs_zero_ne_zero_of_check' depends on axioms: [propext, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.NatMatrix.pfVecs_zero_ne_zero_of_check

/--
info: 'Cryptificate.NatMatrix.not_isMDS_of_checkBranch' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.NatMatrix.not_isMDS_of_checkBranch

/--
info: 'Cryptificate.Hades.invariant_of_check' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Hades.invariant_of_check

/--
info: 'Cryptificate.Mat2.isMDS_of_minorsOk' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Mat2.isMDS_of_minorsOk

/--
info: 'Cryptificate.Mat2.det_ne_zero_of_det2' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Mat2.det_ne_zero_of_det2

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
