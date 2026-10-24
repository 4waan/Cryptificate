
/-- The submitted HADES design as plain data: both matrices, the S-box exponent and the round
counts. -/
def candDesign : Hades.Design Poseidon2.BN254.F 3 where
  external := candExternal
  internal := candInternal
  exponent := candExponent
  fullRounds := candFullRounds
  partialRounds := candPartialRounds

/-- Claim `activity.outer`: run the candidate permutation on two distinct inputs: the external
matrix, then `h = candFullRounds / 2` full rounds, `candPartialRounds` partial rounds with
S-boxes on the positions in `mask`, and `h` full rounds, where each round adds its constant,
applies `x ↦ x ^ candExponent` and multiplies by its matrix. For every mask and every choice of
round constants, at least `(h / 2 + h / 2) * 4 + h % 2 + h % 2` S-box evaluations in the full
rounds receive different inputs in the two executions. Partial rounds are not counted. Uses
`external_mds`, `internal_invertible` and `power_bijective` from this file. -/
theorem hades_activity :
    ∀ (mask : Finset (Fin 3)) (constants : ℕ → Fin 3 → Poseidon2.BN254.F)
      (x y : Fin 3 → Poseidon2.BN254.F), x ≠ y →
        (candFullRounds / 2 / 2 + candFullRounds / 2 / 2) * 4
            + candFullRounds / 2 % 2 + candFullRounds / 2 % 2
          ≤ candDesign.outerActivity mask constants x y :=
  fun mask constants _ _ hxy =>
    candDesign.outer_activity external_mds internal_invertible power_bijective mask constants hxy
