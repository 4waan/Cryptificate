/-
Copyright (c) Cryptificate contributors. Released under the MIT license.
-/
import Refinement.GF256
import Refinement.AesLike
import Refinement.AesConcrete
import Refinement.Gf256Crate

/-!
# Axiom audit

The build fails if any main theorem starts depending on an axiom other than the three standard
ones (`propext`, `Classical.choice`, `Quot.sound`), e.g. `sorryAx` or `Lean.ofReduceBool`.

The one exception is listed explicitly: the theorems about the gf256 crate mention
`gf256_aes.core.mem.size_of`, the uninterpreted function that the Aeneas translation of that
crate declares for `core::mem::size_of` (not modelled by the Aeneas library at the pinned
commit). They assume, as a hypothesis, that it returns `1` for `u8`.
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
info: 'Cryptificate.Refinement.gf256_mul_comm' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Refinement.gf256_mul_comm

/--
info: 'Cryptificate.Refinement.gf256_mul_assoc' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Refinement.gf256_mul_assoc

/--
info: 'Cryptificate.Refinement.gf256_mul_add' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Refinement.gf256_mul_add

/--
info: 'Cryptificate.Refinement.gf256_mul_two' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Refinement.gf256_mul_two

/--
info: 'Cryptificate.Refinement.gf256_mul_inv' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Refinement.gf256_mul_inv

/--
info: 'Cryptificate.Refinement.aes_like_round_refines' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Refinement.aes_like_round_refines

/--
info: 'Cryptificate.Refinement.aes_like_encrypt_refines' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Refinement.aes_like_encrypt_refines

/--
info: 'Cryptificate.Refinement.aes_like_round_eq' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Refinement.aes_like_round_eq

/--
info: 'Cryptificate.Refinement.aes_like_encrypt_eq' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Refinement.aes_like_encrypt_eq

/--
info: 'Cryptificate.Refinement.aes_like_encrypt_activity_bound' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Refinement.aes_like_encrypt_activity_bound

/--
info: 'Cryptificate.Refinement.table_injective_of_sboxOf_injective' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Refinement.table_injective_of_sboxOf_injective

/--
info: 'Cryptificate.Refinement.sboxOf_injective_iff' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Refinement.sboxOf_injective_iff

/--
info: 'Cryptificate.Refinement.sboxOf_injective_of_tableCovers' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Refinement.sboxOf_injective_of_tableCovers

/--
info: 'Cryptificate.Refinement.stateOf_injective' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Refinement.stateOf_injective

/--
info: 'Cryptificate.Refinement.exists_encrypt_outputs' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Refinement.exists_encrypt_outputs

/--
info: 'Cryptificate.Refinement.aes_like_encrypt_activity_bound_of_checks' depends on axioms: [propext,
 Classical.choice,
 Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Refinement.aes_like_encrypt_activity_bound_of_checks

/--
info: 'Cryptificate.Refinement.aesMatrixBytes_minors4Ok' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Refinement.aesMatrixBytes_minors4Ok

/--
info: 'Cryptificate.Refinement.aesOffsetBytes_distinct' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Refinement.aesOffsetBytes_distinct

/--
info: 'Cryptificate.Refinement.aesSboxBytes_covers' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Refinement.aesSboxBytes_covers

/--
info: 'Cryptificate.Refinement.matrixOf_aesMatrixBytes' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Refinement.matrixOf_aesMatrixBytes

/--
info: 'Cryptificate.Refinement.offsetsOf_aesOffsetBytes' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Refinement.offsetsOf_aesOffsetBytes

/--
info: 'Cryptificate.Refinement.sboxOf_aesSboxBytes' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Refinement.sboxOf_aesSboxBytes

/--
info: 'Cryptificate.Refinement.aes_rust_activity_bound' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Refinement.aes_rust_activity_bound

/--
info: 'Cryptificate.Refinement.aes_rust_activity_bound_exists' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Refinement.aes_rust_activity_bound_exists

/--
info: 'Cryptificate.Refinement.aes_rust_activity_bound_10' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Refinement.aes_rust_activity_bound_10

/--
info: 'Cryptificate.Refinement.aes_rust_activity_bound_4' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Refinement.aes_rust_activity_bound_4

/--
info: 'Cryptificate.Refinement.Gf256Crate.crateMul_eq_rawMul' depends on axioms: [propext, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Refinement.Gf256Crate.crateMul_eq_rawMul

/--
info: 'Cryptificate.Refinement.Gf256Crate.gf256crate_mul_refines' depends on axioms: [propext,
 Classical.choice,
 Quot.sound,
 gf256_aes.core.mem.size_of]
-/
#guard_msgs in
#print axioms Cryptificate.Refinement.Gf256Crate.gf256crate_mul_refines

/--
info: 'Cryptificate.Refinement.Gf256Crate.gf256crate_mul_field' depends on axioms: [propext,
 Classical.choice,
 Quot.sound,
 gf256_aes.core.mem.size_of]
-/
#guard_msgs in
#print axioms Cryptificate.Refinement.Gf256Crate.gf256crate_mul_field

/--
info: 'Cryptificate.Refinement.Gf256Crate.gf256crate_mul_eq_kernels' depends on axioms: [propext,
 Classical.choice,
 Quot.sound,
 gf256_aes.core.mem.size_of]
-/
#guard_msgs in
#print axioms Cryptificate.Refinement.Gf256Crate.gf256crate_mul_eq_kernels
