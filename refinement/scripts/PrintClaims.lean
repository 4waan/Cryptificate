/-
Copyright (c) Cryptificate contributors. Released under the MIT license.
-/
import Refinement

/-!
Prints, for each refinement theorem listed in `claims.json`, one line
`CLAIM {"theorem": …, "type": …, "axioms": […]}` with the statement as Lean pretty-prints it and
the axioms it depends on. `scripts/claims.py` compares these lines with `claims.json`.

Run from `refinement/`: `lake env lean scripts/PrintClaims.lean`.
-/

open Lean Meta Elab Command

private def claimTheorems : List Name := [
  `Cryptificate.Refinement.gf256_xtime_refines,
  `Cryptificate.Refinement.gf256_add_refines,
  `Cryptificate.Refinement.gf256_mul_refines,
  `Cryptificate.Refinement.gf256_mul_field,
  `Cryptificate.Refinement.gf256_add_field,
  `Cryptificate.Refinement.gf256_xtime_field,
  `Cryptificate.Refinement.aes_like_round_refines,
  `Cryptificate.Refinement.aes_like_round_eq,
  `Cryptificate.Refinement.aes_like_encrypt_refines,
  `Cryptificate.Refinement.aes_like_encrypt_eq,
  `Cryptificate.Refinement.aes_like_encrypt_activity_bound,
  `Cryptificate.Refinement.aes_like_final_round_refines,
  `Cryptificate.Refinement.aes_like_final_round_eq,
  `Cryptificate.Refinement.aes_like_encrypt_with_last_round_refines,
  `Cryptificate.Refinement.aes_like_encrypt_with_last_round_eq,
  `Cryptificate.Refinement.aes_like_encrypt_with_last_round_activity_bound,
  `Cryptificate.Refinement.sboxOf_injective_iff,
  `Cryptificate.Refinement.sboxOf_injective_of_tableCovers,
  `Cryptificate.Refinement.aes_like_encrypt_activity_bound_of_checks,
  `Cryptificate.Refinement.aes_like_encrypt_with_last_round_activity_bound_of_checks,
  `Cryptificate.Refinement.matrixOf_aesMatrixBytes,
  `Cryptificate.Refinement.offsetsOf_aesOffsetBytes,
  `Cryptificate.Refinement.sboxOf_aesSboxBytes,
  `Cryptificate.Refinement.aes_rust_activity_bound,
  `Cryptificate.Refinement.aes_rust_activity_bound_exists,
  `Cryptificate.Refinement.aes_rust_activity_bound_10,
  `Cryptificate.Refinement.aes_rust_activity_bound_4,
  `Cryptificate.Refinement.aes_rust_cipher_activity_bound,
  `Cryptificate.Refinement.aes_rust_cipher_activity_bound_10,
  `Cryptificate.Refinement.Gf256Crate.gf256crate_mul_refines,
  `Cryptificate.Refinement.Gf256Crate.gf256crate_mul_field,
  `Cryptificate.Refinement.Gf256Crate.gf256crate_mul_eq_kernels
]

#eval show CommandElabM Unit from do
  for n in claimTheorems do
    let ci ← liftCoreM (getConstInfo n)
    let fmt ← liftTermElabM (withOptions (fun o => o.setBool `pp.fullNames false) (ppExpr ci.type))
    let ty := (fmt.pretty 100000).replace "\n" " "
    let axs ← liftCoreM (collectAxioms n)
    let json := Json.mkObj [("theorem", toJson n.toString), ("type", toJson ty),
      ("axioms", toJson (axs.toList.map Name.toString))]
    IO.println s!"CLAIM {json.compress}"
